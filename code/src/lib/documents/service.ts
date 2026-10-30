import "server-only";
import { and, desc, eq, ne } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { ZodError } from "zod";
import { audit } from "@/lib/audit";
import { db, schema } from "@/lib/db";
import type { ExtractedField } from "@/lib/db/schema";
import type { ActorType } from "@/lib/domain/taxonomy";
import { publish } from "@/lib/events/bus";
import { applyProfileChanges, getProfile } from "@/lib/profile/service";
import { MAX_DOCUMENT_BYTES, MAX_DOCUMENT_PAGES, type UploadRejection } from "./constants";
import { sha256Hex } from "./crypto";
import { toIsoDate } from "./dates";
import { classifyAndExtract } from "./extract";
import { DESCRIPTION_PATH, fieldDef, isExtractable } from "./fields";
import {
  applyEdits,
  type FieldValues,
  type PolicyDraft,
  policyDraftFor,
  profileChangesFor,
  suggestSubject,
} from "./mapping";
import { normalizeValue } from "./normalize";
import { sniffMimeType } from "./sniff";
import { readDecrypted, removeStored, storagePathFor, writeEncrypted } from "./storage";
import type {
  ConfirmExtractionInput,
  ConfirmExtractionResult,
  DocumentSubject,
  ExtractionSummary,
  UploadResponse,
} from "./types";

export type DocumentRow = typeof schema.documents.$inferSelect;
type ExtractionRow = typeof schema.extractions.$inferSelect;

/** Reserved key in `extractions.edits` remembering whose document the customer said it is. */
const SUBJECT_EDIT_KEY = "_subject";

const todayIso = () => toIsoDate(new Date());

// ─── Reads ──────────────────────────────────────────────────────────────────

export function getDocument(documentId: string): DocumentRow | undefined {
  return db.query.documents.findFirst({ where: eq(schema.documents.id, documentId) }).sync();
}

export function getOwnedDocument(customerId: string, documentId: string): DocumentRow | undefined {
  const doc = getDocument(documentId);
  return doc && doc.customerId === customerId && doc.status !== "deleted" ? doc : undefined;
}

function latestExtraction(documentId: string): ExtractionRow | undefined {
  return db
    .select()
    .from(schema.extractions)
    .where(eq(schema.extractions.documentId, documentId))
    .orderBy(desc(schema.extractions.createdAt))
    .get();
}

export function listCustomerDocuments(customerId: string): DocumentRow[] {
  return db
    .select()
    .from(schema.documents)
    .where(and(eq(schema.documents.customerId, customerId), ne(schema.documents.status, "deleted")))
    .orderBy(desc(schema.documents.createdAt))
    .all();
}

/** Extracted fields with the customer's corrections applied, for display. */
function displayFields(extraction: ExtractionRow): ExtractedField[] {
  const fields = extraction.fields.filter((f) => f.path !== DESCRIPTION_PATH);
  const docType = extraction.docType;
  if (!extraction.edits || !isExtractable(docType)) return fields;
  const byPath = new Map(fields.map((f) => [f.path, f]));
  for (const [path, raw] of Object.entries(extraction.edits)) {
    const def = fieldDef(docType, path);
    if (!def) continue;
    const value = raw === "" || raw === null ? null : normalizeValue(def, raw);
    if (value === null) byPath.delete(path);
    else
      byPath.set(path, {
        ...(byPath.get(path) ?? { page: null, quote: null }),
        path,
        value,
        confidence: 1,
      });
  }
  return [...byPath.values()];
}

function valuesOf(fields: ExtractedField[]): FieldValues {
  const values: FieldValues = {};
  for (const f of fields)
    if (typeof f.value === "string" || typeof f.value === "number" || typeof f.value === "boolean")
      values[f.path] = f.value;
  return values;
}

export function getExtractionSummary(documentId: string): ExtractionSummary {
  const doc = getDocument(documentId);
  if (!doc) {
    return {
      documentId,
      filename: "",
      status: "failed",
      docType: null,
      fields: [],
      description: null,
      error: "Document not found",
    };
  }
  const extraction = doc.status === "deleted" ? undefined : latestExtraction(documentId);
  const fields = extraction ? displayFields(extraction) : [];
  const description = extraction?.fields.find((f) => f.path === DESCRIPTION_PATH)?.value;
  const profile = getProfile(doc.customerId);
  const savedSubject = extraction?.edits?.[SUBJECT_EDIT_KEY];
  return {
    documentId: doc.id,
    filename: doc.filename,
    status: doc.status,
    docType: extraction?.docType ?? doc.docType,
    fields,
    description: typeof description === "string" ? description : null,
    error: doc.error,
    confirmedAt: extraction?.confirmedAt?.toISOString() ?? null,
    subject:
      savedSubject === "self" || savedSubject === "partner"
        ? savedSubject
        : suggestSubject(valuesOf(fields), profile),
    names: { self: profile.person.firstName, partner: profile.partner?.firstName },
  };
}

// ─── Upload ─────────────────────────────────────────────────────────────────

function cleanFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  // biome-ignore lint/suspicious/noControlCharactersInRegex: strip control characters from user input
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>|]/g, "").trim();
  return (cleaned || "dokument").slice(0, 120);
}

async function pdfPageCount(data: Buffer): Promise<number | null> {
  try {
    const pdf = await PDFDocument.load(data, { ignoreEncryption: true, updateMetadata: false });
    return pdf.getPageCount();
  } catch {
    return null;
  }
}

/**
 * Validates, deduplicates (sha256 per customer), encrypts and records uploaded files.
 * Returns the response plus ids of newly stored documents (to start extraction).
 */
export async function storeUploads(input: {
  customerId: string;
  conversationId: string | null;
  files: File[];
}): Promise<{ response: UploadResponse; created: string[] }> {
  const conversation = input.conversationId
    ? db.query.conversations
        .findFirst({
          where: and(
            eq(schema.conversations.id, input.conversationId),
            eq(schema.conversations.customerId, input.customerId),
          ),
        })
        .sync()
    : undefined;
  const response: UploadResponse = { documents: [], rejected: [] };
  const created: string[] = [];

  for (const file of input.files) {
    const filename = cleanFilename(file.name);
    const reject = (reason: UploadRejection) => response.rejected.push({ filename, reason });
    if (file.size === 0) {
      reject("empty");
      continue;
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      reject("too_large");
      continue;
    }
    const data = Buffer.from(await file.arrayBuffer());
    const mimeType = sniffMimeType(data);
    if (!mimeType) {
      reject("unsupported_type");
      continue;
    }
    let pageCount = 1;
    if (mimeType === "application/pdf") {
      const pages = await pdfPageCount(data);
      if (pages === null) {
        reject("unreadable");
        continue;
      }
      if (pages > MAX_DOCUMENT_PAGES) {
        reject("too_many_pages");
        continue;
      }
      pageCount = pages;
    }

    const sha256 = sha256Hex(data);
    const existing = db
      .select()
      .from(schema.documents)
      .where(
        and(
          eq(schema.documents.customerId, input.customerId),
          eq(schema.documents.sha256, sha256),
          ne(schema.documents.status, "deleted"),
        ),
      )
      .get();
    if (existing) {
      response.documents.push({
        id: existing.id,
        filename: existing.filename,
        status: existing.status,
        duplicate: true,
      });
      continue;
    }

    const id = crypto.randomUUID();
    const storagePath = storagePathFor(input.customerId, id);
    await writeEncrypted(storagePath, id, data);
    db.insert(schema.documents)
      .values({
        id,
        customerId: input.customerId,
        conversationId: conversation?.id ?? null,
        filename,
        mimeType,
        sizeBytes: data.length,
        sha256,
        storagePath,
        pageCount,
      })
      .run();
    audit({
      actorType: "customer",
      actorId: input.customerId,
      action: "document.uploaded",
      entityType: "document",
      entityId: id,
      data: {
        filename,
        mimeType,
        sizeBytes: data.length,
        pageCount,
        conversationId: conversation?.id,
      },
    });
    publish({ type: "document.updated", documentId: id, customerId: input.customerId });
    response.documents.push({ id, filename, status: "uploaded", duplicate: false });
    created.push(id);
  }
  return { response, created };
}

// ─── Extraction ─────────────────────────────────────────────────────────────

const globalForExtractions = globalThis as unknown as {
  paxExtractions?: Map<string, Promise<ExtractionSummary>>;
};
globalForExtractions.paxExtractions ??= new Map();
const inFlight = globalForExtractions.paxExtractions;

function setStatus(doc: DocumentRow, values: Partial<DocumentRow>): void {
  db.update(schema.documents).set(values).where(eq(schema.documents.id, doc.id)).run();
  publish({ type: "document.updated", documentId: doc.id, customerId: doc.customerId });
}

async function runExtraction(doc: DocumentRow): Promise<ExtractionSummary> {
  setStatus(doc, { status: "extracting", error: null });
  try {
    const data = await readDecrypted(doc.storagePath, doc.id);
    const result = await classifyAndExtract({
      data,
      mimeType: doc.mimeType,
      filename: doc.filename,
      today: todayIso(),
    });
    db.insert(schema.extractions)
      .values({
        documentId: doc.id,
        docType: result.docType,
        schemaVersion: 1,
        fields: result.fields,
        model: result.model,
      })
      .run();
    setStatus(doc, { status: "extracted", docType: result.docType });
    audit({
      actorType: "ai",
      action: "document.extracted",
      entityType: "document",
      entityId: doc.id,
      data: { docType: result.docType, fieldCount: result.fields.length - 1, model: result.model },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[documents] extraction failed for ${doc.id}:`, message);
    setStatus(doc, { status: "failed", error: message.slice(0, 300) });
    audit({
      actorType: "ai",
      action: "document.extraction_failed",
      entityType: "document",
      entityId: doc.id,
      data: { error: message.slice(0, 300) },
    });
  }
  return getExtractionSummary(doc.id);
}

/**
 * Idempotent: returns the stored extraction if it ran, joins a running one, otherwise runs it
 * (failed documents are retried). Never throws for model failures.
 */
export function extractDocument(documentId: string): Promise<ExtractionSummary> {
  const doc = getDocument(documentId);
  if (!doc || doc.status === "deleted" || latestExtraction(documentId))
    return Promise.resolve(getExtractionSummary(documentId));
  const running = inFlight.get(documentId);
  if (running) return running;
  const promise = runExtraction(doc).finally(() => inFlight.delete(documentId));
  inFlight.set(documentId, promise);
  return promise;
}

// ─── Confirmation ───────────────────────────────────────────────────────────

function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

/** Re-uploading a policy or a newer pension certificate updates the existing cockpit entry. */
function upsertPolicy(
  customerId: string,
  documentId: string,
  draft: PolicyDraft,
): { id: string; created: boolean } {
  const existing = db
    .select()
    .from(schema.policies)
    .where(eq(schema.policies.customerId, customerId))
    .all();
  const match =
    existing.find((p) => p.documentId === documentId) ??
    (draft.policyNumber
      ? existing.find(
          (p) => p.policyNumber === draft.policyNumber && sameText(p.insurer, draft.insurer),
        )
      : undefined) ??
    (draft.category === "pension_fund"
      ? existing.find(
          (p) =>
            p.category === "pension_fund" &&
            sameText(p.insurer, draft.insurer) &&
            sameText(p.insuredPerson, draft.insuredPerson),
        )
      : undefined);
  const status = draft.endDate && draft.endDate < todayIso() ? "ended" : "active";

  if (match) {
    const filled = Object.fromEntries(
      Object.entries(draft).filter(
        ([key, value]) => value !== null && !["insurer", "isExternal", "details"].includes(key),
      ),
    );
    db.update(schema.policies)
      .set({
        ...filled,
        status,
        documentId,
        details: { ...(match.details ?? {}), ...draft.details },
      })
      .where(eq(schema.policies.id, match.id))
      .run();
    return { id: match.id, created: false };
  }
  const [row] = db
    .insert(schema.policies)
    .values({ ...draft, customerId, status, documentId, source: "document" })
    .returning({ id: schema.policies.id })
    .all();
  return { id: row.id, created: true };
}

export function confirmExtraction(
  customerId: string,
  input: ConfirmExtractionInput,
): ConfirmExtractionResult {
  const doc = getOwnedDocument(customerId, input.documentId);
  if (!doc) return { ok: false, error: "not_found" };
  const extraction = latestExtraction(doc.id);
  if (!extraction || !isExtractable(extraction.docType))
    return { ok: false, error: "not_extracted" };
  const docType = extraction.docType;

  const { [SUBJECT_EDIT_KEY]: _ignored, ...edits } = input.edits;
  const { values, invalid } = applyEdits(docType, extraction.fields, edits);
  if (invalid.length > 0) return { ok: false, error: "invalid_values", invalid };

  const subject: DocumentSubject = input.subject === "partner" ? "partner" : "self";
  const changes = profileChangesFor(docType, values, subject, getProfile(customerId));
  try {
    applyProfileChanges(customerId, changes, {
      source: "document",
      documentId: doc.id,
      conversationId: doc.conversationId ?? undefined,
    });
  } catch (error) {
    if (error instanceof ZodError)
      return {
        ok: false,
        error: "invalid_values",
        invalid: error.issues.map((issue) => issue.path.join(".")),
      };
    throw error;
  }

  const draft = policyDraftFor(docType, values, todayIso());
  const policy = draft ? upsertPolicy(customerId, doc.id, draft) : null;
  db.update(schema.extractions)
    .set({ confirmedAt: new Date(), edits: { ...edits, [SUBJECT_EDIT_KEY]: subject } })
    .where(eq(schema.extractions.id, extraction.id))
    .run();
  setStatus(doc, { status: "confirmed", docType });
  audit({
    actorType: "customer",
    actorId: customerId,
    action: "document.confirmed",
    entityType: "document",
    entityId: doc.id,
    data: {
      docType,
      subject,
      changedPaths: changes.map((c) => c.path),
      editedPaths: Object.keys(edits),
      policyId: policy?.id ?? null,
    },
  });
  if (policy?.created) publish({ type: "policy.created", policyId: policy.id, customerId });
  return { ok: true, changedPaths: changes.map((c) => c.path), policyId: policy?.id ?? null };
}

// ─── Deletion ───────────────────────────────────────────────────────────────

/**
 * Removes the encrypted file and marks the document deleted. Unconfirmed extractions are
 * removed with it; confirmed ones stay as provenance of the profile values they produced.
 */
export async function deleteDocument(
  customerId: string,
  documentId: string,
  reason: "deleted" | "discarded",
): Promise<boolean> {
  const doc = getOwnedDocument(customerId, documentId);
  if (!doc) return false;
  await removeStored(doc.storagePath);
  db.transaction((tx) => {
    tx.update(schema.documents)
      .set({ status: "deleted", deletedAt: new Date() })
      .where(eq(schema.documents.id, doc.id))
      .run();
    const extraction = latestExtraction(doc.id);
    if (extraction && !extraction.confirmedAt)
      tx.delete(schema.extractions).where(eq(schema.extractions.documentId, doc.id)).run();
  });
  audit({
    actorType: "customer",
    actorId: customerId,
    action: reason === "discarded" ? "document.discarded" : "document.deleted",
    entityType: "document",
    entityId: doc.id,
    data: { filename: doc.filename },
  });
  publish({ type: "document.updated", documentId: doc.id, customerId });
  return true;
}

// ─── Viewing ────────────────────────────────────────────────────────────────

export async function readDocumentFile(
  doc: DocumentRow,
  viewer: { actorType: ActorType; actorId: string },
): Promise<Buffer> {
  const data = await readDecrypted(doc.storagePath, doc.id);
  audit({
    ...viewer,
    action: "document.viewed",
    entityType: "document",
    entityId: doc.id,
  });
  return data;
}

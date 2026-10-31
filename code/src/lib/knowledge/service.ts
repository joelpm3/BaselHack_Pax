import "server-only";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { db, schema } from "@/lib/db";
import { MAX_DOCUMENT_BYTES } from "@/lib/documents/constants";
import { sha256Hex } from "@/lib/documents/crypto";
import { cleanFilename, pdfPageCount } from "@/lib/documents/service";
import { sniffMimeType } from "@/lib/documents/sniff";
import { readDecrypted, removeStored, writeEncrypted } from "@/lib/documents/storage";
import type { KnowledgeKind } from "@/lib/domain/learning";
import { PRODUCTS, type ProductCode } from "@/lib/domain/products";
import { transcribeProductDocument } from "./extract";
import { chunkSections, type SearchHit, searchSections } from "./retrieval";

export type KnowledgeDocument = typeof schema.knowledgeDocuments.$inferSelect;

/** Product terms (AVB) are longer than customer documents. */
export const MAX_KNOWLEDGE_PAGES = 40;

export const KNOWLEDGE_UPLOAD_ERRORS = [
  "empty",
  "too_large",
  "not_pdf",
  "unreadable",
  "too_many_pages",
  "unknown_entry",
] as const;
export type KnowledgeUploadError = (typeof KNOWLEDGE_UPLOAD_ERRORS)[number];

const kd = schema.knowledgeDocuments;

/** Relative to DATA_DIR; inside `uploads/` so the shared encrypted storage accepts it. */
function storagePathFor(id: string): string {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Invalid id");
  return `uploads/knowledge/${id}.bin`;
}

// ─── Reads ──────────────────────────────────────────────────────────────────

export interface KnowledgeEntry {
  entryId: string;
  productCode: ProductCode;
  kind: KnowledgeKind;
  title: string;
  /** The version the advisor uses now (null while the first version is processed or failed). */
  active: KnowledgeDocument | null;
  /** The newest version, which may still be processing or have failed. */
  latest: KnowledgeDocument;
  versions: KnowledgeDocument[];
}

export function listKnowledgeEntries(): KnowledgeEntry[] {
  const rows = db
    .select()
    .from(kd)
    .where(ne(kd.status, "deleted"))
    .orderBy(asc(kd.productCode), desc(kd.version))
    .all();
  const byEntry = new Map<string, KnowledgeDocument[]>();
  for (const row of rows) byEntry.set(row.entryId, [...(byEntry.get(row.entryId) ?? []), row]);
  return [...byEntry.values()].map((versions) => {
    const latest = versions[0];
    const active = versions.find((v) => v.status === "active") ?? null;
    const current = active ?? latest;
    return {
      entryId: latest.entryId,
      productCode: current.productCode,
      kind: current.kind,
      title: current.title,
      active,
      latest,
      versions,
    };
  });
}

export function getKnowledgeDocument(id: string): KnowledgeDocument | undefined {
  return db.select().from(kd).where(eq(kd.id, id)).get();
}

function activeDocuments(productCode?: ProductCode): KnowledgeDocument[] {
  return db
    .select()
    .from(kd)
    .where(
      productCode
        ? and(eq(kd.status, "active"), eq(kd.productCode, productCode))
        : eq(kd.status, "active"),
    )
    .orderBy(asc(kd.productCode), asc(kd.kind))
    .all();
}

/** Which products have active documents, for the advisor's tool description. */
export function productsWithKnowledge(): Array<{ productCode: ProductCode; titles: string[] }> {
  const byProduct = new Map<ProductCode, string[]>();
  for (const doc of activeDocuments())
    byProduct.set(doc.productCode, [...(byProduct.get(doc.productCode) ?? []), doc.title]);
  return [...byProduct].map(([productCode, titles]) => ({ productCode, titles }));
}

// ─── Lookup (advisor tool) ──────────────────────────────────────────────────

export interface KnowledgeSource {
  documentId: string;
  entryId: string;
  title: string;
  kind: KnowledgeKind;
  version: number;
  filename: string;
}

function sourceOf(doc: KnowledgeDocument): KnowledgeSource {
  return {
    documentId: doc.id,
    entryId: doc.entryId,
    title: doc.title,
    kind: doc.kind,
    version: doc.version,
    filename: doc.filename,
  };
}

export interface KnowledgeExcerpt {
  source: KnowledgeSource;
  heading: string;
  page: number | null;
  text: string;
}

export interface KnowledgeLookup {
  documents: KnowledgeSource[];
  excerpts: KnowledgeExcerpt[];
  /** Section headings of the searched documents, so a failed search can be retried. */
  headings: string[];
}

export function lookupKnowledge(
  productCode: ProductCode,
  question: string,
  limit = 3,
): KnowledgeLookup {
  const docs = activeDocuments(productCode);
  const items = docs.flatMap((doc) =>
    chunkSections(doc.sections ?? []).map((section) => ({ ref: doc, section })),
  );
  const hits: Array<SearchHit<KnowledgeDocument>> = searchSections(items, question, limit);
  return {
    documents: docs.map(sourceOf),
    excerpts: hits.map((hit) => ({
      source: sourceOf(hit.ref),
      heading: hit.section.heading,
      page: hit.section.page,
      text: hit.section.text,
    })),
    headings: [...new Set(docs.flatMap((d) => (d.sections ?? []).map((s) => s.heading)))].slice(
      0,
      40,
    ),
  };
}

// ─── Upload, replace, delete ────────────────────────────────────────────────

export async function storeKnowledgeUpload(input: {
  file: File;
  advisorId: string;
  /** New entry: product, kind and title. Replacement: the entry to add a version to. */
  target:
    | { type: "new"; productCode: ProductCode; kind: KnowledgeKind; title: string }
    | { type: "replace"; entryId: string };
}): Promise<{ ok: true; id: string } | { ok: false; error: KnowledgeUploadError }> {
  const { file } = input;
  if (file.size === 0) return { ok: false, error: "empty" };
  if (file.size > MAX_DOCUMENT_BYTES) return { ok: false, error: "too_large" };
  const data = Buffer.from(await file.arrayBuffer());
  if (sniffMimeType(data) !== "application/pdf") return { ok: false, error: "not_pdf" };
  const pageCount = await pdfPageCount(data);
  if (pageCount === null) return { ok: false, error: "unreadable" };
  if (pageCount > MAX_KNOWLEDGE_PAGES) return { ok: false, error: "too_many_pages" };

  let base: {
    entryId: string;
    version: number;
    productCode: ProductCode;
    kind: KnowledgeKind;
    title: string;
  };
  const id = crypto.randomUUID();
  if (input.target.type === "replace") {
    const previous = db
      .select()
      .from(kd)
      .where(and(eq(kd.entryId, input.target.entryId), ne(kd.status, "deleted")))
      .orderBy(desc(kd.version))
      .get();
    if (!previous) return { ok: false, error: "unknown_entry" };
    base = {
      entryId: previous.entryId,
      version: previous.version + 1,
      productCode: previous.productCode,
      kind: previous.kind,
      title: previous.title,
    };
  } else {
    base = { entryId: id, version: 1, ...input.target };
  }

  const storagePath = storagePathFor(id);
  await writeEncrypted(storagePath, id, data);
  db.insert(kd)
    .values({
      id,
      ...base,
      filename: cleanFilename(file.name),
      sizeBytes: data.length,
      sha256: sha256Hex(data),
      storagePath,
      pageCount,
      uploadedByAdvisorId: input.advisorId,
    })
    .run();
  audit({
    actorType: "advisor",
    actorId: input.advisorId,
    action: input.target.type === "replace" ? "knowledge.replaced" : "knowledge.uploaded",
    entityType: "knowledge_document",
    entityId: id,
    data: {
      entryId: base.entryId,
      version: base.version,
      productCode: base.productCode,
      kind: base.kind,
    },
  });
  return { ok: true, id };
}

/**
 * Reads the PDF into sections. Only a successful read activates the version (and retires the
 * previous one), so a failed replacement leaves the advisor on the last good version.
 */
export async function processKnowledgeDocument(id: string): Promise<void> {
  const doc = getKnowledgeDocument(id);
  if (!doc || doc.status !== "processing") return;
  try {
    const data = await readDecrypted(doc.storagePath, doc.id);
    const { sections, model } = await transcribeProductDocument({
      data,
      filename: doc.filename,
      productName: PRODUCTS[doc.productCode].name,
    });
    if (sections.length === 0) throw new Error("No text found in the document");
    db.transaction((tx) => {
      const current = tx.select({ status: kd.status }).from(kd).where(eq(kd.id, id)).get();
      // Deleted while it was being read: keep it deleted.
      if (current?.status !== "processing") return;
      tx.update(kd)
        .set({ status: "superseded" })
        .where(and(eq(kd.entryId, doc.entryId), eq(kd.status, "active")))
        .run();
      tx.update(kd)
        .set({ status: "active", sections, model, activatedAt: new Date(), error: null })
        .where(eq(kd.id, id))
        .run();
    });
    audit({
      actorType: "system",
      action: "knowledge.activated",
      entityType: "knowledge_document",
      entityId: id,
      data: { entryId: doc.entryId, version: doc.version, sections: sections.length, model },
    });
  } catch (error) {
    console.error(`[knowledge] reading ${id} failed`, error);
    db.update(kd)
      .set({
        status: "failed",
        error: error instanceof Error ? error.message.slice(0, 500) : "failed",
      })
      .where(and(eq(kd.id, id), eq(kd.status, "processing")))
      .run();
  }
}

/** Removes a document (all versions) from the advisor; rows stay for the audit trail. */
export async function deleteKnowledgeEntry(entryId: string, advisorId: string): Promise<boolean> {
  const versions = db
    .select()
    .from(kd)
    .where(and(eq(kd.entryId, entryId), ne(kd.status, "deleted")))
    .all();
  if (versions.length === 0) return false;
  db.update(kd)
    .set({ status: "deleted", deletedAt: new Date(), sections: null })
    .where(
      inArray(
        kd.id,
        versions.map((v) => v.id),
      ),
    )
    .run();
  await Promise.all(versions.map((v) => removeStored(v.storagePath)));
  audit({
    actorType: "advisor",
    actorId: advisorId,
    action: "knowledge.deleted",
    entityType: "knowledge_document",
    entityId: entryId,
    data: { versions: versions.map((v) => v.version), productCode: versions[0].productCode },
  });
  return true;
}

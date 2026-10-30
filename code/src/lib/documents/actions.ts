"use server";

import { after } from "next/server";
import { z } from "zod";
import { getCurrentCustomer } from "@/lib/auth/customer";
import { LOCALES, type Locale } from "@/lib/domain/taxonomy";
import { ensureFreshHints } from "@/lib/hints/service";
import { confirmExtraction, deleteDocument, extractDocument, getOwnedDocument } from "./service";
import type { ConfirmExtractionResult, ExtractionSummary } from "./types";

/**
 * Server actions behind the "Das habe ich gelesen" card. Every action re-checks that the
 * document belongs to the customer behind the device cookie.
 */

const confirmSchema = z.object({
  documentId: z.uuid(),
  edits: z.record(
    z.string().max(64),
    z.union([z.string().max(300), z.number(), z.boolean(), z.null()]),
  ),
  subject: z.enum(["self", "partner"]),
  locale: z.enum(LOCALES).optional(),
});

export async function confirmExtractionAction(
  input: z.input<typeof confirmSchema>,
): Promise<ConfirmExtractionResult> {
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_values" };
  const customer = await getCurrentCustomer();
  if (!customer) return { ok: false, error: "not_found" };
  const result = confirmExtraction(customer.id, parsed.data);
  if (result.ok) {
    const locale: Locale = parsed.data.locale ?? customer.locale;
    after(() => ensureFreshHints(customer.id, locale).catch(() => undefined));
  }
  return result;
}

/** "Verwerfen": nothing is used and the uploaded file is deleted. */
export async function discardDocumentAction(documentId: string): Promise<{ ok: boolean }> {
  const customer = await getCurrentCustomer();
  if (!customer || !z.uuid().safeParse(documentId).success) return { ok: false };
  return { ok: await deleteDocument(customer.id, documentId, "discarded") };
}

/** Runs the extraction again after a failure. */
export async function retryExtractionAction(documentId: string): Promise<ExtractionSummary | null> {
  const customer = await getCurrentCustomer();
  if (!customer || !z.uuid().safeParse(documentId).success) return null;
  if (!getOwnedDocument(customer.id, documentId)) return null;
  return extractDocument(documentId);
}

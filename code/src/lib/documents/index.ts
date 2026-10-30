import "server-only";
import type { ExtractionSummary } from "./types";

export type { ExtractionSummary } from "./types";

/**
 * CONTRACT (owned by the documents area). Classifies and extracts an uploaded document
 * (idempotent: returns the stored extraction if it already ran). Never throws for model
 * failures; returns status "failed" with an error instead.
 */
export async function extractDocument(documentId: string): Promise<ExtractionSummary> {
  throw new Error(`extractDocument not implemented yet (${documentId})`);
}

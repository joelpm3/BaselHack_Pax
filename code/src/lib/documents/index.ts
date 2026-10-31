import "server-only";
import { describeDocumentOutcome } from "./outcome";
import { getDocumentOutcomes, extractDocument as runExtraction } from "./service";
import type { ExtractionSummary } from "./types";

export type { ExtractionSummary } from "./types";

/**
 * CONTRACT (owned by the documents area). Classifies and extracts an uploaded document
 * (idempotent: returns the stored extraction if it already ran). Never throws for model
 * failures; returns status "failed" with an error instead.
 */
export async function extractDocument(documentId: string): Promise<ExtractionSummary> {
  return runExtraction(documentId);
}

/**
 * CONTRACT (owned by the documents area). One note per reviewed document for the advisor
 * model: confirmed (with the values already applied to the profile), discarded or unconfirmed.
 */
export function documentNotesForAdvisor(customerId: string, documentIds: string[]): string[] {
  return getDocumentOutcomes(customerId, documentIds).map(describeDocumentOutcome);
}

"use client";

import type { ExtractionSummary } from "@/lib/documents/types";

/**
 * CONTRACT (owned by the documents area): the "Das habe ich gelesen" card rendered for the
 * advisor's `reviewDocuments` tool result. Lets the customer correct and confirm the values,
 * then uses useChatActions().sendMessage to tell the advisor.
 */
export interface ExtractionReviewCardProps {
  extractions: ExtractionSummary[];
}

export function ExtractionReviewCard(_props: ExtractionReviewCardProps) {
  return null;
}

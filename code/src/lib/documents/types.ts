import type { ExtractedField } from "@/lib/db/schema";
import type { DocumentStatus, DocumentType } from "@/lib/domain/taxonomy";

/** What the advisor's `reviewDocuments` tool returns and the review card renders. */
export interface ExtractionSummary {
  documentId: string;
  filename: string;
  status: DocumentStatus;
  docType: DocumentType | null;
  fields: ExtractedField[];
  /** Short plain-language description of what the document is (for the advisor). */
  description: string | null;
  error: string | null;
}

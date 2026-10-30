import type { ExtractedField } from "@/lib/db/schema";
import type { DocumentStatus, DocumentType } from "@/lib/domain/taxonomy";
import type { UploadRejection } from "./constants";

/** Whose document it is: the customer or their partner (`profile.partner`). */
export type DocumentSubject = "self" | "partner";

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
  /** ISO timestamp once the customer confirmed the values. */
  confirmedAt?: string | null;
  /** Best guess whose document it is; the review card lets the customer change it. */
  subject?: DocumentSubject;
  /** First names from the profile, to label the subject choice. */
  names?: { self?: string; partner?: string };
}

/** Response of POST /api/documents. */
export interface UploadResponse {
  documents: Array<{
    id: string;
    filename: string;
    status: DocumentStatus;
    /** Same file was uploaded before: the existing document is returned. */
    duplicate: boolean;
  }>;
  rejected: Array<{ filename: string; reason: UploadRejection }>;
}

/** Input of the confirm server action. */
export interface ConfirmExtractionInput {
  documentId: string;
  /** Field path → corrected value (strings are parsed like extracted values, "" removes). */
  edits: Record<string, unknown>;
  subject: DocumentSubject;
}

export type ConfirmExtractionResult =
  | {
      ok: true;
      changedPaths: string[];
      policyId: string | null;
    }
  | { ok: false; error: "not_found" | "not_extracted" | "invalid_values"; invalid?: string[] };

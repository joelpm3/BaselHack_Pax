import type { DocumentStatus, DocumentType } from "@/lib/domain/taxonomy";
import type { DocumentSubject } from "./types";

/**
 * What became of a document the customer reviewed, phrased for the advisor model. Confirming
 * writes the values to the profile on the server (source "document") before the customer's
 * message reaches the advisor, so the model must not store them a second time.
 */
export interface DocumentOutcome {
  documentId: string;
  docType: DocumentType | null;
  status: DocumentStatus;
  confirmed: boolean;
  subject: DocumentSubject | null;
  /** Profile paths the confirmation changed, with their new values. */
  applied: Array<{ path: string; value: unknown }>;
  /** A cockpit entry (policy or pension-fund entry) came from the document. */
  inCockpit: boolean;
}

const MAX_LISTED = 20;

function formatValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function describeDocumentOutcome(outcome: DocumentOutcome): string {
  const kind = outcome.docType ?? "document";
  const whose =
    outcome.subject === "partner"
      ? ", the partner's"
      : outcome.subject === "self"
        ? ", the customer's own"
        : "";
  const head = `Document ${outcome.documentId} (${kind}${whose})`;

  // A confirmed document deleted later keeps its values in the profile (provenance stays).
  if (outcome.status === "deleted" && !outcome.confirmed)
    return `[${head}: discarded by the customer; none of its values are used.]`;
  if (!outcome.confirmed)
    return `[${head}: not confirmed; its values are not used and not in the profile.]`;

  const parts = [`${head}: confirmed by the customer.`];
  if (outcome.applied.length > 0) {
    const listed = outcome.applied
      .slice(0, MAX_LISTED)
      .map((c) => `${c.path} = ${formatValue(c.value)}`)
      .join(", ");
    const more = outcome.applied.length > MAX_LISTED ? ", …" : "";
    parts.push(
      `Its values are already applied to the profile (source: document): ${listed}${more}.`,
    );
  } else {
    parts.push("Its values already matched the profile; nothing had to change.");
  }
  if (outcome.inCockpit) parts.push("It is listed in the customer's Vorsorge-Cockpit.");
  parts.push(
    "Do not store these values again with updateProfile. If they affect an analysis you showed, run it again now so the customer sees the result with the document's figures.",
  );
  return `[${parts.join(" ")}]`;
}

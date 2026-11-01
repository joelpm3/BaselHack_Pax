import { contractTexts } from "./i18n";
import { renderOffer } from "./pdf/offer";
import { renderPolicy } from "./pdf/policy";
import type { ContractDocument } from "./types";

export interface RenderedContract {
  bytes: Uint8Array;
  /** Every string drawn, in order (the embedded font makes the PDF text hard to read back). */
  text: string[];
  filename: string;
}

/** Renders the Antrag or the Police in the customer's language. */
export async function renderContractPdf(doc: ContractDocument): Promise<RenderedContract> {
  const t = await contractTexts(doc.locale);
  return doc.kind === "offer" ? renderOffer(doc, t) : renderPolicy(doc, t);
}

import "server-only";
import type { CallContext } from "@/lib/logismata/client";
import type { Quote, QuoteInput } from "./types";

export type { Quote, QuoteInput } from "./types";

/**
 * CONTRACT (owned by the pricing area): live Pax premium from Quicksale, with a fitted
 * fallback estimate. Records the calculation in `calculations` (provider quicksale|estimate).
 */
export async function quotePremium(input: QuoteInput, context: CallContext = {}): Promise<Quote> {
  void context;
  throw new Error(`quotePremium not implemented yet (${input.productCode})`);
}

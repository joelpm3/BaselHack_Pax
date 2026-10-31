import "server-only";
import { db, schema } from "@/lib/db";
import type { CallContext } from "@/lib/logismata/client";
import { dedupe, getCachedQuote, setCachedQuote } from "./cache";
import { estimateQuote } from "./estimate";
import { checkQuoteInput, contractStartDate, describeIssue } from "./limits";
import { normalizeQuoteInput, quoteCacheKey } from "./normalize";
import { runQuicksale } from "./quicksale/client";
import { quicksaleProductFor } from "./quicksale/mapping";
import { parseProposal } from "./quicksale/parse";
import type { Quote, QuoteInput, QuoteIssue } from "./types";

export type {
  Quote,
  QuoteInput,
  QuoteIssue,
  QuoteIssueCode,
  QuoteRider,
  ScenarioValues,
} from "./types";

/**
 * CONTRACT (owned by the pricing area): live Pax premium from Quicksale, with a fitted
 * fallback estimate. Records the calculation in `calculations` (provider quicksale|estimate).
 */
export async function quotePremium(input: QuoteInput, context: CallContext = {}): Promise<Quote> {
  const inputs = normalizeQuoteInput(input);
  const startDate = inputs.startDate ?? contractStartDate(new Date());
  const issues = checkQuoteInput(inputs, startDate);
  const key = quoteCacheKey(inputs);

  const cached = getCachedQuote(key);
  if (cached) {
    record("quicksale", inputs, { ...cached, cached: true }, undefined, 0, context);
    return cached;
  }

  const product = quicksaleProductFor(inputs);
  if (product && !issues.some((i) => i.blocking)) {
    const started = Date.now();
    try {
      const { quote, actions, sessionId } = await dedupe(key, async () => {
        const run = await runQuicksale(product, inputs);
        const { quicksaleWarnings, ...fields } = parseProposal(run.proposal, inputs);
        const all: QuoteIssue[] = [
          ...issues,
          ...quicksaleWarnings.map((text) => ({
            code: "quicksale_warning" as const,
            blocking: false,
            params: { text },
          })),
        ];
        const live: Quote = {
          ...fields,
          source: "quicksale",
          issues: all,
          warnings: all.map(describeIssue),
          inputs,
        };
        setCachedQuote(key, live);
        return { quote: live, actions: run.actions, sessionId: run.sessionId };
      });
      record(
        "quicksale",
        inputs,
        { ...quote, quicksale: { sessionId, actions } },
        undefined,
        Date.now() - started,
        context,
      );
      return quote;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      record("quicksale", inputs, null, message, Date.now() - started, context);
      issues.push({ code: "quicksale_unavailable", blocking: false });
    }
  }

  const started = Date.now();
  const quote: Quote = {
    productCode: inputs.productCode,
    ...estimateQuote(inputs, startDate),
    source: "estimate",
    issues,
    warnings: issues.map(describeIssue),
    inputs,
  };
  record("estimate", inputs, quote, undefined, Date.now() - started, context);
  return quote;
}

function record(
  provider: "quicksale" | "estimate",
  input: QuoteInput,
  output: unknown,
  error: string | undefined,
  durationMs: number,
  context: CallContext,
): void {
  try {
    db.insert(schema.calculations)
      .values({
        customerId: context.customerId,
        conversationId: context.conversationId,
        toolCallId: context.toolCallId,
        provider,
        operation: `quote.${input.productCode}`,
        input,
        output: output ?? null,
        status: error ? "error" : "ok",
        error,
        durationMs,
      })
      .run();
  } catch (cause) {
    // The audit row must never break a quote (e.g. a conversation deleted mid-flight).
    console.error("[pricing] could not record calculation", cause);
  }
}

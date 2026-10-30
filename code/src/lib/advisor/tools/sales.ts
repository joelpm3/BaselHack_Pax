import "server-only";
import { type ToolSet, tool } from "ai";
import {
  offerInputSchema,
  prepareOffer,
  startSuitabilityCheck,
  suitabilityInputSchema,
} from "@/lib/sales/application";
import { recommendInputSchema, recommendProducts } from "@/lib/sales/recommend";
import type { ToolContext } from "./context";

/**
 * CONTRACT (owned by the pricing/sales area): recommendation → suitability → offer → signature
 * tools. Expected tool names: `recommendProducts`, `startSuitabilityCheck`, `prepareOffer`.
 * The advisor area merges these into its tool set and renders them via `salesWidgets`.
 */
export function createSalesTools(ctx: ToolContext): ToolSet {
  return {
    recommendProducts: tool({
      description:
        "Recommend Pax products for gaps that the analysis has already identified, priced with the live Pax " +
        "tariff (Quicksale) or a labelled estimate, and show them as recommendation cards. Call only when the " +
        "life situation is understood, the gaps are known (risk analysis, pension overview or confirmed " +
        "documents) and the customer wants a solution. Pass every relevant gap with its amount in CHF per year " +
        "(need minus income; null if unknown) and the person it concerns ('partner' when the partner is the " +
        "main earner). The tool sizes the cover itself (death: gap × years until the youngest child is 25; " +
        "disability: annual pension = gap, 24-month waiting period for employees; retirement/tax: 3a premium " +
        "up to the deductible maximum), checks entry ages and the active company rules (blocked products are " +
        "returned in `excluded` with the rule text) and stores each recommendation with its criteria for audit. " +
        "If `status` is 'needs_info', ask for the `missing` profile fields, save them with updateProfile and call " +
        "again. Unit-linked products (LifeStar, FondsStar, Auszahlungsplan) come back with " +
        "`requiresSuitability: true`: present them as possible only after the suitability check " +
        "(startSuitabilityCheck). Afterwards explain briefly: the gap, why this product (its criteria), that the " +
        "price is indicative and not binding, and one alternative. Do not repeat all numbers of the cards.",
      inputSchema: recommendInputSchema,
      execute: (input, { toolCallId }) => recommendProducts(ctx, input, toolCallId),
    }),

    startSuitabilityCheck: tool({
      description:
        "Start the legally required suitability check (Angemessenheitsprüfung) for a unit-linked product " +
        "(LifeStar, FondsStar, Auszahlungsplan) before its offer. Shows an interactive form: financial capacity " +
        "(A1–A4), goal and horizon (B1–B2), knowledge and reaction to losses (C1–C2) and the guaranteed share " +
        "(D), with transparent points, the investment profile (Konservativ ≤ 44, Ausgewogen 45–84, " +
        "Dynamisch ≥ 85) and the matching Pax funds. Pass the recommendationId from recommendProducts. Do not " +
        "ask these questions in the chat and never answer them for the customer. The result arrives as the " +
        "customer's next message: if it is suitable, call prepareOffer; if not, explain neutrally that Pax " +
        "advises against the product (affordability or risk profile) and suggest an alternative.",
      inputSchema: suitabilityInputSchema,
      execute: async (input) => startSuitabilityCheck(ctx, input),
    }),

    prepareOffer: tool({
      description:
        "Prepare the offer for the recommendation the customer chose (e.g. after 'Offerte ansehen'). Shows " +
        "product, insured person, cover, duration, premium and riders, key conditions including the 14-day " +
        "right of withdrawal, then contact details (if missing), consents and a typed-name demo signature that " +
        "creates the policy in the customer's Vorsorge-Cockpit. Pass the recommendationId from " +
        "recommendProducts. Unit-linked products need a completed, suitable suitability check first: status " +
        "'suitability_required' means call startSuitabilityCheck, 'not_suitable' means explain and offer an " +
        "alternative. The signature is a demo and creates no legal contract. Afterwards say in one or two " +
        "sentences what the customer can do in the card; do not restate the offer. When the customer reports " +
        "the signature, congratulate briefly and point to the Vorsorge-Cockpit.",
      inputSchema: offerInputSchema,
      execute: (input, { toolCallId }) => prepareOffer(ctx, input, toolCallId),
    }),
  };
}

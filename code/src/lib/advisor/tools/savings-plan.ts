import "server-only";
import { type JSONValue, tool } from "ai";
import { z } from "zod";
import { runSaving } from "../logismata/checks";
import {
  normalizeSavingsParams,
  SAVINGS_INTEREST_RATE,
  SAVINGS_LIMITS,
  type SavingsPlanOutput,
} from "../savings-plan";
import { withoutCustomerInputs } from "../widget-inputs";
import type { ToolContext } from "./context";

export function createSavingsPlanTools(ctx: ToolContext) {
  return {
    calculateSavingsPlan: tool({
      description:
        "Savings plan with Logismata: how much to save per month to reach a goal in a number of " +
        "years, and how deposits and interest add up. Interactive widget with sliders. The " +
        `interest rate is fixed at ${SAVINGS_INTEREST_RATE}% per year (the Pax savings ` +
        "calculator's assumption, not a promise). Use for a savings goal the customer names, or " +
        "after showPensionOverview to show how a capital gap (breakdown.capitalGap) could be " +
        "closed by retirement.",
      inputSchema: z.object({
        goal: z
          .number()
          .min(SAVINGS_LIMITS.goal.min)
          .max(SAVINGS_LIMITS.goal.max)
          .describe("CHF to have at the end"),
        years: z
          .number()
          .int()
          .min(SAVINGS_LIMITS.years.min)
          .max(SAVINGS_LIMITS.years.max)
          .describe("Years until the goal (e.g. years until retirement)"),
        startCapital: z
          .number()
          .min(0)
          .max(SAVINGS_LIMITS.startCapital.max)
          .optional()
          .describe("CHF already saved for this goal, as the customer said it; default 0"),
      }),
      execute: (input, { toolCallId }): Promise<SavingsPlanOutput> =>
        runSaving(normalizeSavingsParams(input), {
          customerId: ctx.customerId,
          conversationId: ctx.conversationId,
          toolCallId,
        }),
      toModelOutput: ({ output }) => ({
        type: "json",
        value: withoutCustomerInputs(output) as JSONValue,
      }),
    }),
  };
}

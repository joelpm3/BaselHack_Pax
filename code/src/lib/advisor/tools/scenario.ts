import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { getProfile } from "@/lib/profile/service";
import { ensureTaxLocation } from "../location";
import { computeScenario } from "../scenarios";
import { SCENARIO_KINDS, type ScenarioOutput } from "../types";
import type { ToolContext } from "./context";

export const scenarioInput = z.object({
  scenario: z
    .enum(SCENARIO_KINDS)
    .describe(
      "child: another child arrives · home_purchase: buy a home with pension-fund (WEF) and 3a " +
        "withdrawals · early_retirement: stop working before 65 · pillar3a: pay a different 3a amount",
    ),
  params: z
    .object({
      children: z.number().int().min(1).max(4).optional(),
      retirementAge: z.number().int().min(58).max(65).optional(),
      yearlyAmount: z.number().min(0).optional(),
      pensionFundWithdrawal: z.number().min(0).optional(),
      pillar3aWithdrawal: z.number().min(0).optional(),
    })
    .optional()
    .describe("Values the customer mentioned; the widget lets them change everything"),
});

export function createScenarioTools(ctx: ToolContext) {
  return {
    simulateScenario: tool({
      description:
        "Interactive what-if for a life event, calculated with Logismata. Shows before/after " +
        "squares and lets the customer adjust the values themselves. Use it when the customer " +
        "plans or wonders about a child, buying a home, retiring early or changing 3a payments.",
      inputSchema: scenarioInput,
      execute: async ({ scenario, params }, { toolCallId }): Promise<ScenarioOutput> => {
        const callCtx = {
          customerId: ctx.customerId,
          conversationId: ctx.conversationId,
          toolCallId,
        };
        const profile = await ensureTaxLocation(
          ctx.customerId,
          getProfile(ctx.customerId),
          ctx.locale,
          callCtx,
        );
        return computeScenario(scenario, params ?? {}, profile, callCtx);
      },
    }),
  };
}

import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { getProfile } from "@/lib/profile/service";
import { ensureTaxLocation } from "../location";
import {
  currentYear,
  runPurchaseP2,
  runRetirementCheck,
  runRiskCheck,
  runSaving3a,
} from "../logismata/checks";
import {
  DEATH_NEED_PERCENT,
  dependentChildren,
  hasPartner,
  INTEREST_RATE,
  max3a,
  missingFor,
  NEED_PERCENT,
  retirementAge,
  yearsUntilRetirement,
} from "../logismata/mapping";
import { policyCoverOf } from "../policies";
import { applyPolicyCover } from "../policy-cover";
import { riskResultForModel } from "../risk-model-output";
import type { PensionOverviewOutput, RiskAnalysisOutput, TaxSavingsOutput } from "../types";
import type { ToolContext } from "./context";

const n = (v: number | undefined) => Math.round(v ?? 0);

export function createAnalysisTools(ctx: ToolContext) {
  const callContext = (toolCallId: string) => ({
    customerId: ctx.customerId,
    conversationId: ctx.conversationId,
    toolCallId,
  });

  return {
    showPensionOverview: tool({
      description:
        "Retirement check across all three pillars (AHV, pension fund, savings/3a) with Logismata: " +
        "income need in retirement (80% of today's gross), what each pillar pays and the gap. " +
        "Shows the three-pillar overview and fills the Vorsorgebild. Needs birth year, sex, " +
        "marital status and income (and the partner's for couples).",
      inputSchema: z.object({}),
      execute: async (_input, { toolCallId }): Promise<PensionOverviewOutput> => {
        const profile = getProfile(ctx.customerId);
        const missing = missingFor(profile, "retirement");
        if (missing.length) return { status: "missing", missing };
        const check = await runRetirementCheck(profile, callContext(toolCallId));
        return {
          status: "ok",
          household: hasPartner(profile),
          retirementAge: check.retirementAge,
          retirementYear: check.retirementYear,
          breakdown: check.breakdown,
          availableFortune: n(check.response.AvailableFortune),
          capitalNeed: n(check.response.CapitalNeed),
          pillar3a: {
            balance: profile.pillar3a.balance ?? null,
            annualContribution: profile.pillar3a.annualContribution ?? null,
          },
          assumptions: {
            needPercent: NEED_PERCENT,
            interestRate: INTEREST_RATE,
            retirementAge: check.retirementAge,
            pillar2Estimated: check.estimated,
          },
        };
      },
    }),

    showRiskAnalysis: tool({
      description:
        "Risk check with Logismata: income if the customer (and partner) can no longer work or " +
        "dies, separately for illness and accident, against the need (80% of gross for " +
        "disability, 70% for survivors). Shows a gap chart like the Pax Vorsorgecheck. Active " +
        "death and disability policies (Pax and other insurers) are already counted in the " +
        "`policies` figure and reduce the gap. The result gives the card's monthly figures; " +
        "follow its readingGuide.",
      inputSchema: z.object({}),
      execute: async (_input, { toolCallId }): Promise<RiskAnalysisOutput> => {
        const profile = getProfile(ctx.customerId);
        const missing = missingFor(profile, "risk");
        if (missing.length) return { status: "missing", missing };
        const check = await runRiskCheck(profile, callContext(toolCallId));
        const year = currentYear();
        const policyCover = policyCoverOf(ctx.customerId, profile, year);
        return {
          status: "ok",
          persons: applyPolicyCover(check.persons, policyCover, profile, year),
          dependentChildren: dependentChildren(profile, year),
          policyCover,
          assumptions: {
            needPercent: NEED_PERCENT,
            deathNeedPercent: DEATH_NEED_PERCENT,
            interestRate: INTEREST_RATE,
            pillar2Estimated: check.estimated,
          },
        };
      },
      // The model reads the card's monthly figures, not the widget's yearly breakdowns.
      toModelOutput: ({ output }) => ({ type: "json", value: riskResultForModel(output) }),
    }),

    calculateTaxSavings: tool({
      description:
        "Tax effect of paying into pillar 3a (default: the legal maximum) and, when relevant, of " +
        "a voluntary pension-fund buy-in, with Logismata for the customer's place of residence. The " +
        "saving shown is for the whole yearly amount compared with paying nothing, not a difference.",
      inputSchema: z.object({
        yearlyAmount: z
          .number()
          .min(0)
          .optional()
          .describe("Yearly 3a contribution to calculate; default is the legal maximum"),
        buyInAmount: z
          .number()
          .min(0)
          .optional()
          .describe("Pension-fund buy-in to calculate (only with a pension fund)"),
        buyInYears: z
          .number()
          .int()
          .min(1)
          .max(15)
          .optional()
          .describe("Spread the buy-in over this many years (default 1)"),
      }),
      execute: async (input, { toolCallId }): Promise<TaxSavingsOutput> => {
        const callCtx = callContext(toolCallId);
        const profile = await ensureTaxLocation(
          ctx.customerId,
          getProfile(ctx.customerId),
          ctx.locale,
          callCtx,
        );
        const missing = missingFor(profile, "tax");
        // A postcode with several towns (8165) stays unresolved until the customer names the town.
        if (missing.length === 0 && profile.residence.taxLocationId === undefined)
          missing.push("residence.city");
        if (missing.length) return { status: "missing", missing };
        const limit = max3a(profile);
        const yearlyAmount = Math.min(input.yearlyAmount ?? limit, limit);
        const buyInAmount =
          profile.pillar2.hasPensionFund !== false
            ? (input.buyInAmount ?? profile.pillar2.maxBuyIn)
            : undefined;
        const buyInYears = input.buyInYears ?? 1;
        const [saving, purchase] = await Promise.all([
          runSaving3a(profile, callCtx, { yearlyAmount }),
          buyInAmount
            ? runPurchaseP2(profile, callCtx, { amount: buyInAmount, years: buyInYears })
            : null,
        ]);
        return {
          status: "ok",
          saving3a: {
            yearlyAmount,
            max3a: limit,
            duration: yearsUntilRetirement(profile, new Date().getFullYear()),
            yearlyTaxSavings: n(saving.response.YearlyTaxSavings),
            overallTaxSavings: n(saving.response.OverallTaxSavings),
            grossCapital: n(saving.response.GrossCapital),
            netCapital: n(saving.response.NetCapital),
            capitalTax: n(saving.response.CapitalTax),
          },
          buyIn:
            purchase && buyInAmount
              ? {
                  amount: buyInAmount,
                  years: buyInYears,
                  taxSavings: n(purchase.TaxSavings),
                  netInvestment: n(purchase.NetInvestment),
                  additionalPension: n(purchase.AdditionalPension),
                  additionalCapital: n(purchase.AdditionalCapital),
                }
              : null,
          assumptions: {
            needPercent: NEED_PERCENT,
            interestRate: INTEREST_RATE,
            retirementAge: retirementAge(profile),
            pillar2Estimated: false,
          },
        };
      },
    }),
  };
}

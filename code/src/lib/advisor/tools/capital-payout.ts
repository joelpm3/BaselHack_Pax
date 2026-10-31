import "server-only";
import { tool } from "ai";
import { z } from "zod";
import type { LifeSituation } from "@/lib/domain/profile";
import { getProfile } from "@/lib/profile/service";
import {
  type CapitalPayoutTaxOutput,
  type CapitalTaxSplit,
  groupPayoutsByAge,
  PAYOUT_SOURCES,
  type PayoutRequest,
  type PayoutSource,
} from "../capital-payout";
import { ensureTaxLocation } from "../location";
import { type CapitalTaxResponse, currentYear, runCapitalTax } from "../logismata/checks";
import { dependentChildren, isJointlyTaxed, missingFor, retirementAge } from "../logismata/mapping";
import type { ToolContext } from "./context";

const n = (v: number | undefined) => Math.round(v ?? 0);

/** Pension fund and 3a can be drawn at the latest five years after the regular retirement age. */
const MAX_PAYOUT_AGE = 70;

const payoutInput = z.object({
  source: z.enum(PAYOUT_SOURCES).describe("Where the money comes from"),
  amount: z
    .number()
    .min(1)
    .max(10_000_000)
    .optional()
    .describe(
      "CHF paid out. Default: pillar2.projectedCapitalAtRetirement (pension fund) or " +
        "pillar3a.balance (3a) from the profile",
    ),
  age: z
    .number()
    .int()
    .min(18)
    .max(MAX_PAYOUT_AGE)
    .optional()
    .describe("The customer's age at the payout; default is the retirement age"),
});

/** Profile path that would give the default amount of a payout. */
const DEFAULT_AMOUNT_PATH: Record<PayoutSource, string> = {
  pension_fund: "pillar2.projectedCapitalAtRetirement",
  pillar3a: "pillar3a.balance",
};

function defaultAmount(profile: LifeSituation, source: PayoutSource): number | undefined {
  return source === "pension_fund"
    ? profile.pillar2.projectedCapitalAtRetirement
    : profile.pillar3a.balance;
}

function split(response: CapitalTaxResponse): CapitalTaxSplit {
  return {
    total: n(response.CapitalTaxes),
    federal: n(response.FederalTax),
    state: n(response.StateTax),
    community: n(response.CommunityTax),
    church: n(response.ChurchTax),
  };
}

export function createCapitalPayoutTools(ctx: ToolContext) {
  return {
    calculateCapitalPayoutTax: tool({
      description:
        "Tax on taking pension-fund or pillar 3a money as a lump sum (Kapitalbezug) instead of a " +
        "pension, with Logismata for the customer's place of residence: federal, cantonal, " +
        "communal and church tax, net capital and tax rate. Pass several payouts at different " +
        "ages to show a staggered withdrawal (e.g. 3a at 62, pension fund at 65); the result " +
        "then compares it with taking everything in one year. Payouts at the same age are taxed " +
        "together. Use only amounts from the customer or the profile.",
      inputSchema: z.object({
        payouts: z.array(payoutInput).min(1).max(10),
      }),
      execute: async (input, { toolCallId }): Promise<CapitalPayoutTaxOutput> => {
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
        const missing = missingFor(profile, "capitalTax");
        const year = currentYear();
        const currentAge = year - (profile.person.birthYear ?? year);
        // Without an age: at retirement, or now for someone already past the retirement age.
        const defaultAge = Math.min(MAX_PAYOUT_AGE, Math.max(retirementAge(profile), currentAge));
        const payouts: PayoutRequest[] = [];
        for (const payout of input.payouts) {
          const amount = payout.amount ?? defaultAmount(profile, payout.source);
          if (amount === undefined) missing.push(DEFAULT_AMOUNT_PATH[payout.source]);
          else payouts.push({ amount, source: payout.source, age: payout.age ?? defaultAge });
        }
        if (missing.length) return { status: "missing", missing: [...new Set(missing)] };

        const years = groupPayoutsByAge(payouts);
        const lastAge = years.at(-1)?.age ?? defaultAge;
        const totalAmount = years.reduce((sum, y) => sum + y.amount, 0);
        const [results, single] = await Promise.all([
          Promise.all(years.map((y) => runCapitalTax(profile, callCtx, y))),
          years.length > 1
            ? runCapitalTax(profile, callCtx, { amount: totalAmount, age: lastAge })
            : null,
        ]);
        const birthYear = profile.person.birthYear ?? year;
        const resultYears = years.map((y, i) => ({
          ...y,
          amount: Math.round(y.amount),
          year: birthYear + y.age,
          tax: split(results[i]),
          netCapital: n(results[i].NetCapital),
          taxPercent: results[i].TaxPercentage ?? 0,
        }));
        const totalTax = resultYears.reduce((sum, y) => sum + y.tax.total, 0);
        const { zip, city } = profile.residence;
        return {
          status: "ok",
          place: [zip, city].filter(Boolean).join(" ") || null,
          years: resultYears,
          totalAmount: Math.round(totalAmount),
          totalTax,
          netCapital: Math.round(totalAmount) - totalTax,
          singlePayout: single
            ? {
                age: lastAge,
                tax: n(single.CapitalTaxes),
                taxPercent: single.TaxPercentage ?? 0,
                saving: n(single.CapitalTaxes) - totalTax,
              }
            : null,
          assumptions: {
            jointlyTaxed: isJointlyTaxed(profile),
            children: dependentChildren(profile, birthYear + lastAge),
          },
        };
      },
    }),
  };
}

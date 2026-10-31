import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { callLogismata } from "@/lib/logismata/client";
import { getProfile } from "@/lib/profile/service";
import {
  type CompoundParams,
  clampCompound,
  compoundSummary,
  EXAMPLE_PARAMS,
} from "../explainers/compound-interest";
import {
  buildConsumptionRequest,
  type ConsumptionResponse,
  capitalByYear,
  DRAWDOWN_UNTIL_AGE,
  drawdownStartAge,
  profileCapitalFor,
} from "../explainers/drawdown";
import { buildLifePlan, planRetirement } from "../explainers/life-plan";
import { PAX_ARTICLE_IDS } from "../explainers/references";
import {
  type CapitalDrawdownOutput,
  type CompoundInterestOutput,
  DRAWDOWN_SOURCES,
  type LifePlanOutput,
  type LifePlanRetirement,
  type ReferencesOutput,
  type ValueSource,
} from "../explainers/types";
import { currentYear, runRetirementCheck } from "../logismata/checks";
import { INTEREST_RATE, missingFor, yearsUntilRetirement } from "../logismata/mapping";
import { MIN_RETIREMENT_AGE, scenarioContext } from "../scenarios";
import type { ToolContext } from "./context";

/**
 * Tools that show rather than tell: compound interest, the customer's life plan, how long a
 * capital lasts, and links to Pax's own explanatory pages.
 */

const compoundInput = z.object({
  startAmount: z
    .number()
    .min(0)
    .optional()
    .describe("Amount saved today, if the customer named one"),
  monthlySaving: z
    .number()
    .min(0)
    .optional()
    .describe("Saving per month, if the customer named one"),
  ratePercent: z
    .number()
    .min(0)
    .max(8)
    .optional()
    .describe("Yearly interest in percent, only if the customer asked about a specific rate"),
  years: z.number().int().min(1).max(50).optional().describe("Saving period in years"),
  usePillar3a: z
    .boolean()
    .optional()
    .describe(
      "true: start from the customer's 3a balance and contribution and save until retirement",
    ),
});

/** Customer values first, then (for 3a) the profile, then the labelled example. */
function compoundParams(
  input: z.infer<typeof compoundInput>,
  profile: ReturnType<typeof getProfile>,
): Pick<CompoundInterestOutput, "params" | "sources" | "basis"> {
  const pillar3a = input.usePillar3a === true;
  const fromProfile: Partial<CompoundParams> = pillar3a
    ? {
        startAmount: profile.pillar3a.balance,
        monthlySaving:
          profile.pillar3a.annualContribution !== undefined
            ? profile.pillar3a.annualContribution / 12
            : undefined,
        years:
          profile.person.birthYear !== undefined
            ? yearsUntilRetirement(profile, currentYear())
            : undefined,
      }
    : {};
  const params = {} as CompoundParams;
  const sources = {} as Record<keyof CompoundParams, ValueSource>;
  for (const key of ["startAmount", "monthlySaving", "ratePercent", "years"] as const) {
    const own = input[key];
    const known = fromProfile[key];
    if (own !== undefined) {
      params[key] = own;
      sources[key] = "customer";
    } else if (known !== undefined) {
      params[key] = known;
      sources[key] = "profile";
    } else {
      params[key] = EXAMPLE_PARAMS[key];
      sources[key] = "example";
    }
  }
  const usedProfile = Object.values(sources).includes("profile");
  return { params: clampCompound(params), sources, basis: usedProfile ? "pillar3a" : "general" };
}

const lifePlanInput = z.object({
  monthlyExpenses: z
    .number()
    .min(0)
    .optional()
    .describe("What the household spends per month, only if the customer said it"),
});

const drawdownInput = z.object({
  source: z
    .enum(DRAWDOWN_SOURCES)
    .describe(
      "Which capital: pension_fund (capital at retirement instead of a pension) · pillar3a · " +
        "savings (free assets)",
    ),
  capital: z
    .number()
    .min(0)
    .optional()
    .describe("Amount the customer named; default: the profile figure for the source"),
  monthlyWithdrawal: z
    .number()
    .min(0)
    .optional()
    .describe("Monthly amount the customer wants to live from, if they named one"),
});

export function createExplainerTools(ctx: ToolContext) {
  const callContext = (toolCallId: string) => ({
    customerId: ctx.customerId,
    conversationId: ctx.conversationId,
    toolCallId,
  });

  return {
    explainCompoundInterest: tool({
      description:
        "Interactive compound-interest illustration (Zinseszins): growth over the years split into " +
        "own deposits, interest and interest on interest; the customer moves sliders for start " +
        "amount, monthly saving, rate and years. Use it whenever someone asks what compound " +
        "interest is or how saving grows. Without values it shows a labelled example; with " +
        "usePillar3a it starts from the customer's 3a figures. The figures are an illustration " +
        "with an assumed rate, never a promise.",
      inputSchema: compoundInput,
      execute: async (input): Promise<CompoundInterestOutput> => {
        const profile = getProfile(ctx.customerId);
        const chosen = compoundParams(input, profile);
        return { status: "ok", ...chosen, summary: compoundSummary(chosen.params) };
      },
    }),

    showLifePlan: tool({
      description:
        "The customer's life on one timeline (one square per year of life): today, planned events " +
        "from the profile (child, home, sabbatical, marriage, self-employment …), children " +
        "turning 18, their retirement and their partner's, plus monthly income today and the " +
        "Logismata income in retirement. Store new plans with updateProfile (addPlannedEvents, " +
        "desiredRetirementAge) before calling it. Needs the birth year.",
      inputSchema: lifePlanInput,
      execute: async ({ monthlyExpenses }, { toolCallId }): Promise<LifePlanOutput> => {
        const profile = getProfile(ctx.customerId);
        const year = currentYear();
        const plan = planRetirement(profile, year);
        let income: LifePlanRetirement["income"];
        const missing = missingFor(profile, "retirement");
        if (!plan) income = { status: "missing", missing: ["person.birthYear"] };
        else if (missing.length) income = { status: "missing", missing };
        else if (plan.age < MIN_RETIREMENT_AGE) income = { status: "too_early" };
        else {
          // Same check as the early-retirement scenario, logged as a what-if so it never
          // replaces the customer's real Vorsorgebild.
          const check = await runRetirementCheck(
            profile,
            scenarioContext(callContext(toolCallId)),
            { retirementAge: plan.age },
          ).catch(() => null);
          income = check
            ? { status: "ok", breakdown: check.breakdown, pillar2Estimated: check.estimated }
            : { status: "failed" };
        }
        return buildLifePlan(profile, year, { income, expensesMonthly: monthlyExpenses });
      },
    }),

    calculateCapitalDrawdown: tool({
      description:
        "How long a capital lasts when the customer lives from it, with Logismata: with their " +
        `monthly amount, or which monthly amount lasts until ${DRAWDOWN_UNTIL_AGE}. Shows the ` +
        "capital shrinking year by year. Use it for pension-fund capital instead of a pension, a " +
        "3a balance or savings. Amounts are before any tax on a payout.",
      inputSchema: drawdownInput,
      execute: async (input, { toolCallId }): Promise<CapitalDrawdownOutput> => {
        const profile = getProfile(ctx.customerId);
        const { source } = input;
        const missing: string[] = [];
        const startAge = drawdownStartAge(profile, currentYear());
        if (startAge === undefined) missing.push("person.birthYear");
        const profileCapital = profileCapitalFor(source, profile);
        const capital = input.capital ?? profileCapital;
        if (capital === undefined || capital <= 0) {
          missing.push(
            source === "pension_fund"
              ? "pillar2.projectedCapitalAtRetirement"
              : source === "pillar3a"
                ? "pillar3a.balance"
                : "assets.liquid",
          );
        }
        if (missing.length || startAge === undefined || capital === undefined)
          return { status: "missing", source, missing };

        const consumption = await callLogismata<ConsumptionResponse>(
          "APICalc_calculateConsumption",
          buildConsumptionRequest({
            capital,
            startAge,
            monthlyWithdrawal: input.monthlyWithdrawal,
          }),
          callContext(toolCallId),
        );
        const years = consumption.DurationYears ?? 0;
        return {
          status: "ok",
          source,
          capital: Math.round(capital),
          capitalSource: input.capital !== undefined ? "customer" : "profile",
          startAge,
          monthlyWithdrawal: Math.round(consumption.Withdrawal ?? 0),
          withdrawalSource: input.monthlyWithdrawal ? "customer" : "calculated",
          years,
          months: consumption.DurationMonths ?? 0,
          capitalByYear: capitalByYear(consumption),
          lastsUntilAge: startAge + years,
          interestRate: consumption.InterestRate ?? INTEREST_RATE,
        };
      },
      // The model needs the figures, not the yearly series of the chart.
      toModelOutput: ({ output }) => ({
        type: "json",
        value: output.status === "ok" ? { ...output, capitalByYear: undefined } : output,
      }),
    }),

    showReferences: tool({
      description:
        "A compact 'Mehr dazu' card with up to three of Pax's own explanatory pages (Ratgeber, " +
        "Vorsorgewelt) in the customer's language. Pick ids that match the concept you just " +
        "explained; if none fits, do not call it and do not name a link.",
      inputSchema: z.object({
        articles: z
          .array(z.enum(PAX_ARTICLE_IDS))
          .min(1)
          .max(3)
          .describe(
            "compound_interest (Zinseszins, Vermögensaufbau) · pension_system (3 Säulen) · " +
              "social_security (AHV/IV) · retirement_planning · pillar3a_tax · " +
              "pillar3a_bank_or_insurance · pillar3a_staggered_withdrawal · " +
              "pillar3a_premium_waiver · life_insurance · pillar2_basics (BVG) · conversion_rate " +
              "(Umwandlungssatz) · coordination_deduction · pension_certificate (Vorsorgeausweis) " +
              "· pension_fund_buy_in (PK-Einkauf) · pension_gaps (Vorsorgelücken) · unpaid_leave " +
              "(Sabbatical, unbezahlter Urlaub) · early_retirement · pension_or_lump_sum (Rente " +
              "oder Kapital) · retirement_budget · couples_and_cohabiting (Ehe, Konkubinat) · " +
              "protect_family · death_and_disability · children · parental_leave (Babypause) · " +
              "divorce · estate_planning (Nachlass) · home_ownership · home_with_pension_money " +
              "(WEF) · self_employment",
          ),
      }),
      execute: async ({ articles }): Promise<ReferencesOutput> => ({
        articles: [...new Set(articles)],
      }),
    }),
  };
}

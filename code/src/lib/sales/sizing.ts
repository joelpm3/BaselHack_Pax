import { DISABILITY_SUM_INSURANCE_MAX, PILLAR_3A_MAX } from "@/lib/pricing/limits";

/**
 * Gap → cover sizing. Pure: the numbers that end up in a recommendation's criteria, so the
 * customer and an auditor can follow how a sum insured or a premium was derived.
 */

/** Maximum 3a contribution without a pension fund: 20 % of earned income, capped (2026). */
export const PILLAR_3A_MAX_NO_PENSION_FUND = 36_288;
/** Orphan's pensions and the support need run until the youngest child is 25. */
export const CHILD_SUPPORT_UNTIL_AGE = 25;
/** Retirement income gap is capitalised over this many years of retirement. */
const RETIREMENT_YEARS = 20;

export interface InsuredFacts {
  age: number;
  currentYear: number;
  grossIncome?: number;
  employment?: string;
  occupation?: string;
  hasPartner: boolean;
  /** Birth year of the youngest child, if any. */
  youngestChildBirthYear?: number;
  hasPensionFund?: boolean;
  pillar3aContribution?: number;
  retirementAge: number;
}

const roundUp = (value: number, step: number) => Math.ceil(value / step) * step;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export type DeathSizing = "until_youngest_child_25" | "partner_10_years" | "minimum_5_years";

export interface DeathCover {
  sumInsured: number;
  years: number;
  endAge: number;
  method: DeathSizing;
  /** True when no gap amount was given and the sum is three gross salaries. */
  fromIncome: boolean;
}

export type SupportFacts = Pick<
  InsuredFacts,
  "age" | "currentYear" | "hasPartner" | "youngestChildBirthYear"
>;

/**
 * How long the survivors need support after a death: until the youngest child is 25, else
 * 10 years with a partner, else 5. Death cover is sized over this period, and existing death
 * capital is spread over the same period when it counts against the gap.
 */
export function deathSupportYears(facts: SupportFacts): { years: number; method: DeathSizing } {
  let years: number;
  let method: DeathSizing;
  if (facts.youngestChildBirthYear !== undefined) {
    years = facts.youngestChildBirthYear + CHILD_SUPPORT_UNTIL_AGE - facts.currentYear;
    method = "until_youngest_child_25";
  } else if (facts.hasPartner) {
    years = 10;
    method = "partner_10_years";
  } else {
    years = 5;
    method = "minimum_5_years";
  }
  return { years: clamp(years, 5, Math.max(5, 85 - facts.age)), method };
}

/** Death gap × the survivors' support period (see deathSupportYears). */
export function sizeDeathCover(gapAnnual: number | null, facts: InsuredFacts): DeathCover {
  const { years, method } = deathSupportYears(facts);
  const fromIncome = !gapAnnual || gapAnnual <= 0;
  const raw = fromIncome ? (facts.grossIncome ?? 60_000) * 3 : gapAnnual * years;
  return {
    sumInsured: clamp(roundUp(raw, 10_000), 10_000, 2_000_000),
    years,
    endAge: facts.age + years,
    method,
    fromIncome,
  };
}

/**
 * Occupation risk group 1–4 from the free-text occupation (Pax groups by main occupation;
 * verified examples: Treuhänder 1, kaufmännische Angestellte 2, Verkauf 3, Schreiner 4).
 */
export function occupationGroup(occupation: string | undefined): {
  group: 1 | 2 | 3 | 4;
  assumed: boolean;
} {
  const text = (occupation ?? "").toLowerCase();
  if (!text) return { group: 2, assumed: true };
  if (
    /(bau|maurer|dach|schrein|zimmer|elektr|install|mechan|landwirt|forst|gärtner|maler|handwerk|chauffeur|lkw|monteur|carpenter|construct)/.test(
      text,
    )
  )
    return { group: 4, assumed: false };
  if (
    /(verk[aä]uf|detailhandel|pflege|koch|köchin|gastro|kellner|coiffeu|polizei|logistik|lager|nurse|sales|retail|cook)/.test(
      text,
    )
  )
    return { group: 3, assumed: false };
  if (
    /(treuh|anwalt|jurist|arzt|ärztin|ingenieur|informatik|software|entwickl|bank|berat|consult|manager|ökonom|architekt|lehr|professor|engineer|lawyer|doctor|teacher)/.test(
      text,
    )
  )
    return { group: 1, assumed: false };
  return { group: 2, assumed: false };
}

export interface DisabilityCover {
  annualPension: number;
  waitingPeriodMonths: 12 | 24;
  endAge: number;
  aboveSumInsurance: boolean;
}

/**
 * Annual pension = disability gap (rounded up to CHF 1'000). Employees usually have salary
 * continuation or daily sickness allowance for two years, so the pension starts after 24 months;
 * self-employed people get 12 months.
 */
export function sizeDisabilityCover(
  gapAnnual: number | null,
  facts: InsuredFacts,
): DisabilityCover {
  const fallback = (facts.grossIncome ?? 60_000) * 0.2;
  const annualPension = clamp(
    roundUp(gapAnnual && gapAnnual > 0 ? gapAnnual : fallback, 1000),
    3000,
    120_000,
  );
  return {
    annualPension,
    waitingPeriodMonths: facts.employment === "self_employed" ? 12 : 24,
    endAge: Math.min(65, facts.retirementAge),
    aboveSumInsurance: annualPension > DISABILITY_SUM_INSURANCE_MAX,
  };
}

/** Room left in pillar 3a this year. */
export function pillar3aRoom(facts: InsuredFacts): number {
  const max =
    facts.hasPensionFund === false
      ? Math.min(PILLAR_3A_MAX_NO_PENSION_FUND, Math.round((facts.grossIncome ?? 0) * 0.2))
      : PILLAR_3A_MAX;
  return Math.max(0, max - (facts.pillar3aContribution ?? 0));
}

export interface SavingsPlan {
  annualPremium: number;
  pillar: "3a" | "3b";
  endAge: number;
  years: number;
  /** Premium needed to close the whole retirement gap (before limits and budget). */
  requiredPremium: number;
  room3a: number;
  closesGapFully: boolean;
  limitedByBudget: boolean;
}

/**
 * Annual saving: the retirement gap capitalised over 20 years of retirement, spread over the
 * years until retirement with a modest 1.5 % growth. Tax-only gaps fill the 3a room. 3a first;
 * 3b when the 3a room is used up.
 */
export function sizeSavings(
  gapAnnual: number | null,
  includeTaxGap: boolean,
  facts: InsuredFacts,
  maxBudget?: number,
): SavingsPlan {
  const endAge = clamp(facts.retirementAge, 60, 70);
  const years = Math.max(10, endAge - facts.age);
  const room3a = pillar3aRoom(facts);
  const growth = ((1.015 ** years - 1) / 0.015) * 1.015;
  const forGap = gapAnnual && gapAnnual > 0 ? (gapAnnual * RETIREMENT_YEARS) / growth : 0;
  const requiredPremium = Math.round(Math.max(forGap, includeTaxGap ? room3a : 0));
  const use3a = room3a >= 1200;
  let premium = use3a ? Math.min(requiredPremium, room3a) : requiredPremium;
  const limitedByBudget = maxBudget !== undefined && premium > maxBudget;
  if (limitedByBudget) premium = maxBudget ?? premium;
  // 1'200 is the tariff minimum for LifeStar and FondsStar.
  premium = Math.max(1200, Math.round(premium));
  return {
    annualPremium: premium,
    pillar: use3a ? "3a" : "3b",
    endAge: use3a ? endAge : Math.min(endAge, 80),
    years,
    requiredPremium,
    room3a,
    closesGapFully: premium >= requiredPremium,
    limitedByBudget,
  };
}

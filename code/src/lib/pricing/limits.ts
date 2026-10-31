import type { ProductCode } from "@/lib/domain/products";
import type { QuoteInput, QuoteIssue } from "./types";

/**
 * Tariff limits from Pax's "Technische Tarifbestimmungen" (challenge_context/quicksale/pdf_text)
 * and the product pages. Pure: shared by the Quicksale adapter, the estimate model and the
 * recommendation logic.
 */

/** Maximum tax-deductible 3a contribution for employees with a pension fund (2026). */
export const PILLAR_3A_MAX = 7258;

/**
 * 3a maximum (with a pension fund) for a calendar year. The federal council sets it every two
 * years; until a later amount is published, later years use the latest known one.
 */
export function pillar3aMaxFor(_year: number): number {
  return PILLAR_3A_MAX;
}
/** Disability pensions up to this amount are sum insurance (no proof of income loss). */
export const DISABILITY_SUM_INSURANCE_MAX = 36_000;

interface Range {
  min: number;
  max: number;
}

export interface TariffLimits {
  entryAge: Range;
  endAge: Range;
  minDurationYears: number;
  sumInsured?: Range;
  annualPremium?: { min: number; max3a?: number };
  singlePremium?: Range;
}

type LimitsByPillar = Partial<Record<"3a" | "3b", TariffLimits>>;

const SAVINGS_3B: TariffLimits = {
  entryAge: { min: 0, max: 70 },
  endAge: { min: 10, max: 80 },
  minDurationYears: 10,
  annualPremium: { min: 1200 },
};
const SAVINGS_3A: TariffLimits = {
  entryAge: { min: 17, max: 60 },
  endAge: { min: 60, max: 70 },
  minDurationYears: 10,
  annualPremium: { min: 1200, max3a: PILLAR_3A_MAX },
};

export const TARIFF_LIMITS: Record<ProductCode, LimitsByPillar> = {
  todesfall: {
    // End age 85 up to entry age 60, 80 from entry age 61 (see endAgeMax below).
    "3b": {
      entryAge: { min: 15, max: 70 },
      endAge: { min: 20, max: 85 },
      minDurationYears: 5,
      sumInsured: { min: 10_000, max: 2_000_000 },
    },
    "3a": {
      entryAge: { min: 17, max: 60 },
      endAge: { min: 22, max: 65 },
      minDurationYears: 5,
      sumInsured: { min: 10_000, max: 2_000_000 },
    },
  },
  erwerbsunfaehigkeit: {
    "3b": { entryAge: { min: 15, max: 60 }, endAge: { min: 20, max: 65 }, minDurationYears: 5 },
    "3a": { entryAge: { min: 17, max: 60 }, endAge: { min: 22, max: 65 }, minDurationYears: 5 },
  },
  lifestar: { "3b": SAVINGS_3B, "3a": SAVINGS_3A },
  fondsstar: { "3b": SAVINGS_3B, "3a": SAVINGS_3A },
  pax3a: {
    "3a": {
      entryAge: { min: 18, max: 60 },
      endAge: { min: 60, max: 70 },
      minDurationYears: 5,
      annualPremium: { min: 600, max3a: PILLAR_3A_MAX },
    },
  },
  auszahlungsplan: {
    "3b": {
      entryAge: { min: 18, max: 75 },
      endAge: { min: 25, max: 95 },
      minDurationYears: 5,
      singlePremium: { min: 25_000, max: 1_000_000 },
    },
  },
  kinderversicherung: {
    // Ages refer to the insured child.
    "3b": {
      entryAge: { min: 0, max: 20 },
      endAge: { min: 15, max: 30 },
      minDurationYears: 10,
      annualPremium: { min: 1000 },
    },
  },
  care: {
    "3b": { entryAge: { min: 18, max: 99 }, endAge: { min: 18, max: 120 }, minDurationYears: 0 },
  },
};

export function limitsFor(productCode: ProductCode, pillar: "3a" | "3b"): TariffLimits | undefined {
  const byPillar = TARIFF_LIMITS[productCode];
  return byPillar[pillar] ?? byPillar["3b"] ?? byPillar["3a"];
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Contracts start on the first of the next month (as in Quicksale and the sample offers). */
export function contractStartDate(today: Date): string {
  const year = today.getUTCFullYear() + (today.getUTCMonth() === 11 ? 1 : 0);
  const month = ((today.getUTCMonth() + 1) % 12) + 1;
  return `${year}-${pad(month)}-01`;
}

export type StartDateProblem = "not_first_of_month" | "in_the_past" | "too_far_ahead" | "invalid";

/**
 * The contract start for a requested date: the first of a month, today or later and at most
 * 12 months ahead (Quicksale accepts later starts but the application questions are only valid
 * for 3 months). Without a request it is the first of next month. A date that is not the first
 * of a month moves to the next first; an impossible one falls back to the default.
 */
export function resolveStartDate(
  requested: string | undefined,
  today: Date,
): { startDate: string; problem?: StartDateProblem } {
  const fallback = contractStartDate(today);
  if (!requested) return { startDate: fallback };
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(requested);
  const month = match ? Number(match[2]) : 0;
  const day = match ? Number(match[3]) : 0;
  if (!match || month < 1 || month > 12 || day < 1 || day > 31)
    return { startDate: fallback, problem: "invalid" };
  let year = Number(match[1]);
  let startMonth = month;
  if (day !== 1) {
    startMonth = month === 12 ? 1 : month + 1;
    if (month === 12) year++;
  }
  const startDate = `${year}-${pad(startMonth)}-01`;
  const todayIso = today.toISOString().slice(0, 10);
  if (startDate < todayIso) return { startDate: fallback, problem: "in_the_past" };
  if (startDate > addYears(todayIso, 1)) return { startDate: fallback, problem: "too_far_ahead" };
  return day === 1 ? { startDate } : { startDate, problem: "not_first_of_month" };
}

/** Whole months between two ISO dates (date part only). */
function monthsBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
}

/**
 * Pax "technisches Alter": age at contract start rounded to the nearest year
 * (born 01.01.1987, start 01.11.2026 → 39 y 10 m → 40).
 */
export function technicalAge(birthDate: string, startDate: string): number {
  return Math.round(monthsBetween(birthDate, startDate) / 12);
}

export function addYears(isoDate: string, years: number): string {
  const [y, m, d] = isoDate.split("-");
  return `${Number(y) + years}-${m}-${d}`;
}

function endAgeMax(input: QuoteInput, limits: TariffLimits, age: number): number {
  if (input.productCode === "todesfall" && input.pillar === "3b" && age >= 61) return 80;
  return limits.endAge.max;
}

/** Validates an input against the tariff sheet. Blocking issues mean "cannot be written". */
export function checkQuoteInput(input: QuoteInput, startDate: string): QuoteIssue[] {
  const limits = limitsFor(input.productCode, input.pillar);
  if (!limits) return [];
  const issues: QuoteIssue[] = [];
  const age = technicalAge(input.birthDate, startDate);

  if (age < limits.entryAge.min)
    issues.push({
      code: "entry_age_below_min",
      blocking: true,
      params: { age, min: limits.entryAge.min },
    });
  if (age > limits.entryAge.max)
    issues.push({
      code: "entry_age_above_max",
      blocking: true,
      params: { age, max: limits.entryAge.max },
    });

  if (input.productCode !== "care") {
    const maxEnd = endAgeMax(input, limits, age);
    if (input.endAge < limits.endAge.min || input.endAge > maxEnd)
      issues.push({
        code: "end_age_out_of_range",
        blocking: true,
        params: { endAge: input.endAge, min: limits.endAge.min, max: maxEnd },
      });
    else if (input.endAge - age < limits.minDurationYears)
      issues.push({
        code: "duration_too_short",
        blocking: true,
        params: { years: input.endAge - age, min: limits.minDurationYears },
      });
  }

  switch (input.productCode) {
    case "todesfall": {
      const sum = input.sumInsured;
      const range = limits.sumInsured;
      if (sum === undefined) issues.push({ code: "amount_missing", blocking: true });
      else if (range && sum < range.min)
        issues.push({ code: "sum_below_min", blocking: true, params: { sum, min: range.min } });
      else if (range && sum > range.max)
        issues.push({ code: "sum_above_max", blocking: true, params: { sum, max: range.max } });
      break;
    }
    case "erwerbsunfaehigkeit": {
      const pension = input.annualPension;
      if (pension === undefined || pension <= 0)
        issues.push({ code: "amount_missing", blocking: true });
      else if (pension > DISABILITY_SUM_INSURANCE_MAX)
        issues.push({
          code: "pension_above_sum_insurance",
          blocking: false,
          params: { pension, max: DISABILITY_SUM_INSURANCE_MAX },
        });
      break;
    }
    case "auszahlungsplan": {
      const single = input.singlePremium;
      const range = limits.singlePremium;
      if (single === undefined) issues.push({ code: "amount_missing", blocking: true });
      else if (range && single < range.min)
        issues.push({
          code: "single_premium_below_min",
          blocking: true,
          params: { amount: single, min: range.min },
        });
      else if (range && single > range.max)
        issues.push({
          code: "single_premium_above_max",
          blocking: true,
          params: { amount: single, max: range.max },
        });
      break;
    }
    case "care":
      break;
    default: {
      const premium = input.annualPremium;
      const rule = limits.annualPremium;
      if (premium === undefined) issues.push({ code: "amount_missing", blocking: true });
      else if (rule && premium < rule.min)
        issues.push({
          code: "premium_below_min",
          blocking: true,
          params: { premium, min: rule.min },
        });
      else if (rule?.max3a && premium > rule.max3a + 0.5)
        issues.push({
          code: "premium_above_3a_max",
          blocking: false,
          params: { premium, max: rule.max3a },
        });
    }
  }
  return issues;
}

const GERMAN: Record<QuoteIssue["code"], (p: Record<string, string | number>) => string> = {
  entry_age_below_min: (p) =>
    `Eintrittsalter ${p.age} liegt unter dem Minimum von ${p.min} Jahren.`,
  entry_age_above_max: (p) => `Eintrittsalter ${p.age} liegt über dem Maximum von ${p.max} Jahren.`,
  end_age_out_of_range: (p) => `Endalter ${p.endAge} ist nicht möglich (${p.min}–${p.max}).`,
  duration_too_short: (p) =>
    `Laufzeit ${p.years} Jahre ist kürzer als das Minimum von ${p.min} Jahren.`,
  sum_below_min: (p) => `Todesfallsumme CHF ${p.sum} liegt unter dem Minimum von CHF ${p.min}.`,
  sum_above_max: (p) => `Todesfallsumme CHF ${p.sum} liegt über dem Maximum von CHF ${p.max}.`,
  pension_above_sum_insurance: (p) =>
    `Rente über CHF ${p.max}: Schadenversicherung, im Leistungsfall ist ein Einkommensnachweis nötig.`,
  premium_below_min: (p) =>
    `Jahresprämie CHF ${p.premium} liegt unter dem Minimum von CHF ${p.min}.`,
  premium_above_3a_max: (p) =>
    `Jahresprämie CHF ${p.premium} liegt über dem 3a-Maximalbetrag von CHF ${p.max}.`,
  single_premium_below_min: (p) =>
    `Einmalprämie CHF ${p.amount} liegt unter dem Minimum von CHF ${p.min}.`,
  single_premium_above_max: (p) =>
    `Einmalprämie CHF ${p.amount} liegt über dem Maximum von CHF ${p.max}.`,
  amount_missing: () => "Versicherungssumme, Rente oder Prämie fehlt.",
  quicksale_unavailable: () => "Pax-Tarifrechner nicht erreichbar: Prämie geschätzt.",
  quicksale_warning: (p) => `Pax-Tarifrechner: ${p.text}`,
};

/** German text for the model and the audit trail; the UI translates `issues` by code. */
export function describeIssue(issue: QuoteIssue): string {
  return GERMAN[issue.code](issue.params ?? {});
}

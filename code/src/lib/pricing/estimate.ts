import { technicalAge } from "./limits";
import type { Quote, QuoteInput, QuoteRider } from "./types";

/**
 * Fallback premium model, fitted to live Pax Quicksale results (30.10.2026) and the sample
 * offers. Only used when Quicksale is unreachable or has no tariff for the product; results
 * are labelled "Geschätzt, unverbindlich".
 *
 * Risk products: premium = fixed policy cost + rate × amount, where the rate scales with a
 * Gompertz curve averaged over the insured ages (level premium for the term).
 */

type EstimatedFields = Omit<Quote, "source" | "warnings" | "issues" | "inputs" | "productCode">;

const round2 = (v: number) => Math.round(v * 100) / 100;
const round0 = (v: number) => Math.round(v);

/** Mean of e^(B·t) over [from, to): the level-premium age factor. */
function gompertzMean(from: number, to: number, b: number): number {
  const years = Math.max(1, to - from);
  return (Math.exp(b * (from + years)) - Math.exp(b * from)) / (b * years);
}

function ageFactor(age: number, endAge: number, b: number): number {
  return gompertzMean(age, endAge, b) / gompertzMean(40, 65, b);
}

/**
 * Term life (FK). Fit: male non-smoker 40→65: CHF 113.60 at 10'000 and 656.80 at 200'000
 * (fixed 85.00 + 2.859 per 1'000); 55→65: 1'088.30; smoker ×2.83 on the risk part
 * (166.00 at 40); premium waiver +7.2 %; surplus ≈ 8.4 % of the risk part.
 */
export const DEATH_MODEL = {
  fixed: 85,
  ratePer1000At40: 2.859,
  gompertzB: 0.105,
  smokerFactor: 2.83,
  femaleFactor: 0.6,
  waiverLoading: 0.072,
  surplusShare: 0.084,
} as const;

/**
 * Disability pension (SIR), 24-month waiting period, 40→65, per 1'000 annual pension:
 * group 1: 442.60, 2: 509.30, 3: 811.50, 4: 909.40 at CHF 10'000 (fixed ≈ 111.70).
 * Smoking does not change the tariff; 12-month waiting period +1.2 %.
 */
export const DISABILITY_MODEL = {
  fixed: 111.7,
  ratePer1000At40: { 1: 33.09, 2: 39.76, 3: 69.98, 4: 79.77 },
  gompertzB: 0.027,
  waiting12Factor: 1.012,
  femaleFactor: 1.2,
  surplusShare: 0.155,
} as const;

/**
 * Savings: effective annual saving = premium − CHF 100 policy cost. Net scenario rates
 * (after all costs and risk premiums) fitted to TerzaLifeStar at 80 %/50 % guarantee and
 * TerzaFondsStar (100 % Pax Sustainable Equity Switzerland Small & Mid Cap), 25 years.
 */
export const SAVINGS_MODEL = {
  policyCost: 100,
  waiverShare: 0.069,
  lifestar: {
    classic: { low: -0.0035, medium: 0.006, high: 0.015 },
    fund: { low: -0.0285, medium: 0.0246, high: 0.0474 },
    /** guaranteed = saving × years × (base + slope × share) */
    guaranteeBase: 0.12,
    guaranteeSlope: 0.745,
  },
  fondsstar: { fund: { low: -0.039, medium: 0.0305, high: 0.055 } },
} as const;

/** Auszahlungsplan: classic part 93 % paid out with 1.0/1.3/1.6 % surplus interest. */
export const PAYOUT_MODEL = {
  classicPayoutRatio: 0.93,
  classic: { low: 0.01, medium: 0.013, high: 0.016 },
  fundNet: 0.97,
  fund: { low: -0.031, medium: 0.042, high: 0.07 },
} as const;

type Scenario = "low" | "medium" | "high";
const SCENARIOS: Scenario[] = ["low", "medium", "high"];

/** Lower-risk funds move less in both directions than the equity funds the model was fitted on. */
export function fundRiskScale(fundName: string | undefined): number {
  if (!fundName) return 1;
  if (/target return/i.test(fundName)) return 0.45;
  if (/portfolio 25\b/i.test(fundName)) return 0.55;
  if (/portfolio 50\b/i.test(fundName)) return 0.7;
  if (/portfolio 75\b/i.test(fundName)) return 0.85;
  return 1;
}

/** Future value of an annual payment at the start of each year. */
function annuityDue(payment: number, rate: number, years: number): number {
  if (Math.abs(rate) < 1e-9) return payment * years;
  return payment * (((1 + rate) ** years - 1) / rate) * (1 + rate);
}

function estimateDeath(input: QuoteInput, age: number): EstimatedFields {
  const m = DEATH_MODEL;
  const sum = input.sumInsured ?? 0;
  let rate = m.ratePer1000At40 * ageFactor(age, input.endAge, m.gompertzB);
  if (input.smoker) rate *= m.smokerFactor;
  if (input.sex === "female") rate *= m.femaleFactor;
  const base = m.fixed + (rate * sum) / 1000;
  const waiver = input.premiumWaiver ? base * m.waiverLoading : 0;
  const gross = base + waiver;
  const net = gross - m.surplusShare * (gross - m.fixed);
  const riders: QuoteRider[] = input.premiumWaiver
    ? [{ code: "I", name: "Prämienbefreiung", premiumAnnual: round2(waiver) }]
    : [];
  return {
    premiumAnnualGross: round2(gross),
    premiumAnnualNet: round2(net),
    sumInsured: sum,
    riders,
  };
}

function estimateDisability(input: QuoteInput, age: number): EstimatedFields {
  const m = DISABILITY_MODEL;
  const pension = input.annualPension ?? 0;
  let rate =
    m.ratePer1000At40[input.occupationGroup ?? 2] * ageFactor(age, input.endAge, m.gompertzB);
  if (input.waitingPeriodMonths === 12) rate *= m.waiting12Factor;
  if (input.sex === "female") rate *= m.femaleFactor;
  const gross = m.fixed + (rate * pension) / 1000;
  const net = gross - m.surplusShare * (gross - m.fixed);
  return {
    premiumAnnualGross: round2(gross),
    premiumAnnualNet: round2(net),
    annualPension: pension,
    riders: [{ code: "I", name: "Prämienbefreiung (inbegriffen)", premiumAnnual: 0 }],
  };
}

function estimateSavings(input: QuoteInput, years: number): EstimatedFields {
  const m = SAVINGS_MODEL;
  const premium = input.annualPremium ?? 0;
  const saving = Math.max(0, premium - m.policyCost);
  const scale = fundRiskScale(input.fundName);
  const share = (input.guaranteedSharePercent ?? 0) / 100;
  const isLifeStar = input.productCode === "lifestar" || input.productCode === "pax3a";

  const rate = (s: Scenario): number => {
    if (isLifeStar) {
      const p = m.lifestar;
      return share * p.classic[s] + (1 - share) * p.fund[s] * scale;
    }
    return m.fondsstar.fund[s] * scale;
  };
  const maturity: NonNullable<Quote["maturity"]> = {};
  for (const s of SCENARIOS) maturity[s] = round0(annuityDue(saving, rate(s), years));
  if (isLifeStar && share > 0) {
    maturity.guaranteed = round0(
      saving * years * (m.lifestar.guaranteeBase + m.lifestar.guaranteeSlope * share),
    );
  }
  const riders: QuoteRider[] = input.premiumWaiver
    ? [{ code: "I", name: "Prämienbefreiung", premiumAnnual: round2(premium * m.waiverShare) }]
    : [];
  return {
    premiumAnnualGross: premium,
    premiumAnnualNet: premium,
    maturity,
    riders,
    fundName: input.fundName,
    guaranteedSharePercent: input.guaranteedSharePercent,
  };
}

function estimatePayoutPlan(input: QuoteInput, age: number): EstimatedFields {
  const m = PAYOUT_MODEL;
  const single = input.singlePremium ?? 0;
  const share = (input.guaranteedSharePercent ?? 50) / 100;
  const payoutStart = age >= 64 ? age + 1 : 65;
  const payoutYears = Math.max(5, input.endAge - payoutStart);
  const invested = payoutStart - age + payoutYears / 2;
  const scale = fundRiskScale(input.fundName);
  const annual = (s: Scenario) =>
    (single *
      (share * m.classicPayoutRatio * (1 + m.classic[s]) ** invested +
        (1 - share) * m.fundNet * (1 + m.fund[s] * scale) ** invested)) /
    payoutYears;
  const payoutAnnual = {
    guaranteed: round0((single * share * m.classicPayoutRatio) / payoutYears),
    low: round0(annual("low")),
    medium: round0(annual("medium")),
    high: round0(annual("high")),
  };
  return {
    premiumAnnualGross: 0,
    premiumAnnualNet: 0,
    singlePremium: single,
    annualPension: payoutAnnual.medium,
    payoutAnnual,
    riders: [],
    fundName: input.fundName,
    guaranteedSharePercent: input.guaranteedSharePercent,
  };
}

/** Estimated quote fields for a normalized input. */
export function estimateQuote(input: QuoteInput, startDate: string): EstimatedFields {
  const age = technicalAge(input.birthDate, startDate);
  const years = Math.max(1, input.endAge - age);
  const common = { startDate, durationYears: years };
  switch (input.productCode) {
    case "todesfall":
      return { ...estimateDeath(input, age), ...common };
    case "erwerbsunfaehigkeit":
      return { ...estimateDisability(input, age), ...common };
    case "auszahlungsplan":
      return { ...estimatePayoutPlan(input, age), ...common };
    case "care":
      // Pax Care is free of charge (CHF 2'000 immediate help in case of death).
      return {
        premiumAnnualGross: 0,
        premiumAnnualNet: 0,
        sumInsured: 2000,
        riders: [],
        startDate,
      };
    default:
      return { ...estimateSavings(input, years), ...common };
  }
}

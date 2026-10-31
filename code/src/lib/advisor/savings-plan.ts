/**
 * Savings plan for a goal (Sparen für ein Ziel): how much to save each month to reach an amount
 * in a number of years. Client-safe: the tool's output type, the limits of the widget's sliders
 * and the pure mapping to and from Logismata APICalc_calculateSaving.
 */

/**
 * Yearly return the plan assumes, in percent. Not a forecast: it is the rate behind the Pax
 * savings calculator on pax.ch ("Sparen für die Pensionierung"), back-solved from its example
 * CHF 50'000 in 10 years → CHF 367 per month. Logismata gives exactly CHF 367 at 2.5 %
 * (SavingGoal=2, monthly), and SavingGoal=4 with CHF 367 returns 2.497 %. The model never
 * chooses the rate.
 */
export const SAVINGS_INTEREST_RATE = 2.5;

export const SAVINGS_LIMITS = {
  goal: { min: 1000, max: 1_000_000 },
  years: { min: 1, max: 45 },
  startCapital: { min: 0, max: 1_000_000 },
} as const;

export interface SavingsPlanParams {
  goal: number;
  years: number;
  startCapital: number;
}

export interface SavingsYear {
  year: number;
  /** Paid in so far (start capital + savings), end of the year. */
  deposits: number;
  /** Interest earned so far, end of the year. */
  interest: number;
}

export interface SavingsPlanOutput {
  status: "ok";
  params: SavingsPlanParams;
  /** CHF per month to save; 0 when the start capital alone reaches the goal. */
  monthly: number;
  /** The start capital reaches the goal without saving. */
  reachedWithoutSaving: boolean;
  /** Start capital plus all savings. */
  deposits: number;
  interest: number;
  endCapital: number;
  series: SavingsYear[];
  assumptions: { interestRate: number };
}

/** Clamps and rounds the inputs to what the widget and the tool accept. */
export function normalizeSavingsParams(input: {
  goal: number;
  years: number;
  startCapital?: number;
}): SavingsPlanParams {
  const clamp = (value: number, { min, max }: { min: number; max: number }) =>
    Math.min(max, Math.max(min, Math.round(value)));
  return {
    goal: clamp(input.goal, SAVINGS_LIMITS.goal),
    years: clamp(input.years, SAVINGS_LIMITS.years),
    startCapital: clamp(input.startCapital ?? 0, SAVINGS_LIMITS.startCapital),
  };
}

/** SavingGoal 2 (= the periodic investment is wanted), monthly payments. */
export function buildSavingRequest(params: SavingsPlanParams) {
  return {
    SavingGoal: 2,
    Duration: params.years,
    InitialInvestment: params.startCapital,
    InvestmentMonthly: true,
    InterestRate: SAVINGS_INTEREST_RATE,
    EndCapital: params.goal,
  };
}

/** SavingGoal 1 (= the end capital is wanted): the start capital growing without savings. */
export function buildGrowthRequest(params: SavingsPlanParams) {
  return {
    SavingGoal: 1,
    Duration: params.years,
    InitialInvestment: params.startCapital,
    InvestmentMonthly: true,
    PeriodicInvestment: 0,
    InterestRate: SAVINGS_INTEREST_RATE,
  };
}

interface ResultDetail {
  Periods?: number;
  Data2?: number[];
}

export interface SavingResponse {
  Deposits?: number;
  Interest?: number;
  GrossCapital?: number;
  PeriodicInvestment?: number;
  DetailsDeposits?: ResultDetail;
  DetailsInterest?: ResultDetail;
}

const n = (v: number | undefined) =>
  typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0;

export function savingsPlanFromResponse(
  params: SavingsPlanParams,
  response: SavingResponse,
  reachedWithoutSaving: boolean,
): SavingsPlanOutput {
  const deposits = response.DetailsDeposits?.Data2 ?? [];
  const interest = response.DetailsInterest?.Data2 ?? [];
  return {
    status: "ok",
    params,
    monthly: reachedWithoutSaving ? 0 : Math.max(0, n(response.PeriodicInvestment)),
    reachedWithoutSaving,
    deposits: n(response.Deposits),
    interest: n(response.Interest),
    endCapital: n(response.GrossCapital),
    series: deposits.map((d, i) => ({ year: i + 1, deposits: n(d), interest: n(interest[i]) })),
    assumptions: { interestRate: SAVINGS_INTEREST_RATE },
  };
}

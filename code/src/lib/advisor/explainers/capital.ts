import type { LifeSituation } from "@/lib/domain/profile";
import { dependentChildren, INTEREST_RATE, relationshipCode, retirementAge } from "../logismata/mapping";
import type { WithdrawalPurpose } from "./types";

/**
 * Pure request builders for the capital-withdrawal explainer: the lump-sum tax on a pension
 * payout (APICalc_calculateCapitalTax) and how long the net capital lasts with regular
 * withdrawals (APICalc_calculateConsumption).
 */

const SEX = { male: 1, female: 2 } as const;
const NO_CONFESSION = 4;
/** Withdrawals for a home are made now; lump sums at retirement. */
export const DRAWDOWN_UNTIL_AGE = 85;

export function paymentAgeFor(
  purpose: WithdrawalPurpose,
  profile: LifeSituation,
  year: number,
): number {
  const birthYear = profile.person.birthYear ?? year;
  const currentAge = year - birthYear;
  return purpose === "home_purchase" ? currentAge : Math.max(currentAge, retirementAge(profile));
}

/** The profile figure a purpose uses when the customer named no amount. */
export function profileAmountFor(
  purpose: WithdrawalPurpose,
  profile: LifeSituation,
): number | undefined {
  switch (purpose) {
    case "retirement_lump_sum":
      return profile.pillar2.projectedCapitalAtRetirement;
    case "pillar3a_payout":
      return profile.pillar3a.balance;
    case "home_purchase":
      return undefined;
  }
}

export function buildCapitalTaxRequest(
  profile: LifeSituation,
  options: { amount: number; paymentAge: number; paymentYear: number },
) {
  const relationship = relationshipCode(profile);
  return {
    CapitalPayment: Math.max(0, Math.round(options.amount)),
    PaymentAge: options.paymentAge,
    TaxLocationID: profile.residence.taxLocationId ?? 0,
    Relationship: relationship,
    Confession1: NO_CONFESSION,
    ...(relationship !== 1 ? { Confession2: NO_CONFESSION } : {}),
    NumberOfChildren: dependentChildren(profile, options.paymentYear),
    Sex: profile.person.sex ? SEX[profile.person.sex] : SEX.male,
    BirthYear: profile.person.birthYear ?? options.paymentYear - options.paymentAge,
  };
}

/**
 * Goal 2 asks how long the capital lasts with the given monthly withdrawal; goal 1 asks how much
 * can be withdrawn each month until `DRAWDOWN_UNTIL_AGE`.
 */
export function buildConsumptionRequest(options: {
  netCapital: number;
  paymentAge: number;
  monthlyWithdrawal?: number;
}) {
  const base = {
    StartCapital: Math.max(0, Math.round(options.netCapital)),
    InterestRate: INTEREST_RATE,
    WithdrawalMonthly: true,
    EndCapital: 0,
  };
  if (options.monthlyWithdrawal !== undefined && options.monthlyWithdrawal > 0) {
    return {
      ...base,
      ConsumptionGoal: 2,
      Withdrawal: Math.round(options.monthlyWithdrawal),
    };
  }
  return {
    ...base,
    ConsumptionGoal: 1,
    Duration: Math.max(1, DRAWDOWN_UNTIL_AGE - options.paymentAge),
  };
}

export interface CapitalTaxResponse {
  CapitalTaxes?: number;
  CommunityTax?: number;
  ChurchTax?: number;
  StateTax?: number;
  FederalTax?: number;
  NetCapital?: number;
  TaxPercentage?: number;
}

export interface ConsumptionResponse {
  Withdrawal?: number;
  DurationYears?: number;
  DurationMonths?: number;
  EndCapital?: number;
  InterestRate?: number;
  DetailsCapital?: { Periods?: number; Data1?: number[]; Data2?: number[] };
}

/** Capital at the start of each year of the drawdown, rounded. */
export function capitalByYear(response: ConsumptionResponse): number[] {
  return (response.DetailsCapital?.Data1 ?? []).map((v) => Math.max(0, Math.round(v)));
}

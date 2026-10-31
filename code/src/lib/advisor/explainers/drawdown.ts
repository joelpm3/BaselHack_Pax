import type { LifeSituation } from "@/lib/domain/profile";
import { INTEREST_RATE } from "../logismata/mapping";
import { planRetirement } from "./life-plan";
import type { DrawdownSource } from "./types";

/**
 * Pure helpers for the capital-drawdown explainer: how long a capital lasts with regular
 * monthly withdrawals (APICalc_calculateConsumption). Taxes on a payout are not part of it.
 */

/** Without a monthly amount, the explainer shows what lasts until this age. */
export const DRAWDOWN_UNTIL_AGE = 85;

/** The profile figure a source stands for when the customer named no amount. */
export function profileCapitalFor(
  source: DrawdownSource,
  profile: LifeSituation,
): number | undefined {
  switch (source) {
    case "pension_fund":
      return profile.pillar2.projectedCapitalAtRetirement;
    case "pillar3a":
      return profile.pillar3a.balance;
    case "savings": {
      const { liquid, securities, total } = profile.assets;
      if (liquid === undefined && securities === undefined) return total;
      return (liquid ?? 0) + (securities ?? 0);
    }
  }
}

/** Withdrawals start at retirement, or today for someone already past that age. */
export function drawdownStartAge(profile: LifeSituation, year: number): number | undefined {
  // The same retirement age as the life plan, including a planned early retirement.
  return planRetirement(profile, year)?.age;
}

/**
 * Goal 2 asks how long the capital lasts with the given monthly withdrawal; goal 1 asks how much
 * can be withdrawn each month until `DRAWDOWN_UNTIL_AGE`.
 */
export function buildConsumptionRequest(options: {
  capital: number;
  startAge: number;
  monthlyWithdrawal?: number;
}) {
  const base = {
    StartCapital: Math.max(0, Math.round(options.capital)),
    InterestRate: INTEREST_RATE,
    WithdrawalMonthly: true,
    EndCapital: 0,
  };
  if (options.monthlyWithdrawal !== undefined && options.monthlyWithdrawal > 0) {
    return { ...base, ConsumptionGoal: 2, Withdrawal: Math.round(options.monthlyWithdrawal) };
  }
  return {
    ...base,
    ConsumptionGoal: 1,
    Duration: Math.max(1, DRAWDOWN_UNTIL_AGE - options.startAge),
  };
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

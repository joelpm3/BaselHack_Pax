/**
 * Lump-sum withdrawals (Kapitalbezug) from the pension fund or pillar 3a: client-safe types of
 * the calculateCapitalPayoutTax tool and the pure grouping behind a staggered withdrawal.
 * Payouts in the same tax year are added up and taxed together; payouts in different years
 * are taxed separately, which is why staggering lowers the progression.
 */

import type { MissingOutput } from "./types";

export const PAYOUT_SOURCES = ["pension_fund", "pillar3a"] as const;
export type PayoutSource = (typeof PAYOUT_SOURCES)[number];

export interface PayoutRequest {
  amount: number;
  /** Age at the payout. */
  age: number;
  source: PayoutSource;
}

/** One tax year with all payouts that fall into it. */
export interface PayoutYear {
  age: number;
  amount: number;
  sources: PayoutSource[];
}

/** Adds up payouts by age (= tax year), oldest last. Amounts of zero or less are dropped. */
export function groupPayoutsByAge(payouts: PayoutRequest[]): PayoutYear[] {
  const years = new Map<number, PayoutYear>();
  for (const payout of payouts) {
    if (!(payout.amount > 0)) continue;
    const year = years.get(payout.age) ?? { age: payout.age, amount: 0, sources: [] };
    year.amount += payout.amount;
    if (!year.sources.includes(payout.source)) year.sources.push(payout.source);
    years.set(payout.age, year);
  }
  return [...years.values()].sort((a, b) => a.age - b.age);
}

/** Capital tax split by authority, CHF, as Logismata returns it. */
export interface CapitalTaxSplit {
  total: number;
  federal: number;
  state: number;
  community: number;
  church: number;
}

export interface CapitalPayoutYearResult extends PayoutYear {
  year: number;
  tax: CapitalTaxSplit;
  netCapital: number;
  /** Tax as a percentage of the payout. */
  taxPercent: number;
}

export type CapitalPayoutTaxOutput =
  | MissingOutput
  | {
      status: "ok";
      place: string | null;
      years: CapitalPayoutYearResult[];
      totalAmount: number;
      totalTax: number;
      netCapital: number;
      /**
       * Staggered payouts only: the same total taken in one year (at the last payout age), for
       * comparison. `saving` is how much less tax the staggered plan costs.
       */
      singlePayout: { age: number; tax: number; taxPercent: number; saving: number } | null;
      assumptions: { jointlyTaxed: boolean; children: number };
    };

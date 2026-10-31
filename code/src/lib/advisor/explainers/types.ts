/**
 * Client-safe output types of the explainer tools (compound interest, life plan, capital
 * withdrawal, Pax references). Amounts are CHF; monthly amounts say so in their name.
 */

import type { IncomeBreakdown, MissingOutput } from "../types";
import type { CompoundParams, CompoundSummary } from "./compound-interest";
import type { PaxArticleId } from "./references";

/** Where a value shown to the customer comes from. */
export type ValueSource = "profile" | "customer" | "example";

export interface CompoundInterestOutput {
  status: "ok";
  params: CompoundParams;
  sources: Record<keyof CompoundParams, ValueSource>;
  /** What the profile figures stand for, e.g. the 3a balance as start amount. */
  basis: "pillar3a" | "general";
  summary: CompoundSummary;
}

// ─── Life plan ──────────────────────────────────────────────────────────────

/** Where a life-plan entry comes from: the profile, a rule applied to it, or an assumption. */
export type PlanSource = "profile" | "derived" | "assumption" | "calculation";

export type LifeEventKind =
  | "today"
  | "child"
  | "child_adult"
  | "home_purchase"
  | "marriage"
  | "sabbatical"
  | "self_employment"
  | "divorce"
  | "inheritance"
  | "other"
  | "retirement"
  | "partner_retirement";

export interface LifeEvent {
  kind: LifeEventKind;
  /** Null when the customer named the plan without a year. */
  year: number | null;
  age: number | null;
  source: PlanSource;
  note: string | null;
}

export type LifePhaseKind = "work" | "sabbatical" | "retirement";

export interface LifePhase {
  kind: LifePhaseKind;
  fromAge: number;
  /** Inclusive. */
  toAge: number;
  assumed: boolean;
}

export interface LifePlanRetirement {
  age: number;
  year: number;
  /** profile: desired age stated; plan: from a planned early retirement; default: reference age. */
  basis: "profile" | "plan" | "default";
  /** Logismata retirement check at that age, or why there is none. */
  income:
    | { status: "ok"; breakdown: IncomeBreakdown; pillar2Estimated: boolean }
    | { status: "missing"; missing: string[] }
    | { status: "too_early" }
    | { status: "failed" };
}

export type LifePlanOutput =
  | MissingOutput
  | {
      status: "ok";
      currentYear: number;
      currentAge: number;
      horizonAge: number;
      events: LifeEvent[];
      phases: LifePhase[];
      retirement: LifePlanRetirement;
      money: {
        /** Gross income today, CHF per month, from the profile. */
        incomeMonthly: number | null;
        /** The partner's income is part of incomeMonthly. */
        incomeIncludesPartner: boolean;
        /** What the customer said they spend per month. */
        expensesMonthly: number | null;
      };
      needPercent: number;
    };

// ─── Capital withdrawal ─────────────────────────────────────────────────────

export const WITHDRAWAL_PURPOSES = ["retirement_lump_sum", "pillar3a_payout", "home_purchase"] as const;
export type WithdrawalPurpose = (typeof WITHDRAWAL_PURPOSES)[number];

export type CapitalWithdrawalOutput =
  | (MissingOutput & { purpose: WithdrawalPurpose })
  | {
      status: "ok";
      purpose: WithdrawalPurpose;
      amount: number;
      amountSource: ValueSource | "default";
      paymentAge: number;
      paymentYear: number;
      location: string | null;
      tax: {
        total: number;
        federal: number;
        cantonal: number;
        communal: number;
        church: number;
        netCapital: number;
        /** Tax as a percentage of the amount. */
        percent: number;
      };
      /** How long the net capital lasts with a monthly withdrawal (lump sums only). */
      drawdown: {
        monthlyWithdrawal: number;
        /** customer: the amount they named; calculated: what lasts until `lastsUntilAge`. */
        withdrawalSource: "customer" | "calculated";
        years: number;
        months: number;
        /** Remaining capital at the start of each year, from the payout on. */
        capitalByYear: number[];
        lastsUntilAge: number;
        interestRate: number;
      } | null;
    };

// ─── References ─────────────────────────────────────────────────────────────

export interface ReferencesOutput {
  articles: PaxArticleId[];
}

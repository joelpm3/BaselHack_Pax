import type { ProductCode } from "@/lib/domain/products";

export interface QuoteInput {
  productCode: ProductCode;
  pillar: "3a" | "3b";
  birthDate: string; // ISO yyyy-mm-dd
  sex: "male" | "female";
  smoker: boolean;
  /** Contract end age, e.g. 65. Kinderversicherung: the child's end age. */
  endAge: number;
  /** Todesfall: death benefit. */
  sumInsured?: number;
  /** Erwerbsunfähigkeit: annual disability pension. */
  annualPension?: number;
  /** Savings products: annual premium the customer wants to pay. */
  annualPremium?: number;
  /** Savings products / Auszahlungsplan: one-off premium. */
  singlePremium?: number;
  /** Disability: waiting period in months (12 or 24). */
  waitingPeriodMonths?: 12 | 24;
  /** Disability: occupation risk group 1–4. */
  occupationGroup?: 1 | 2 | 3 | 4;
  premiumWaiver?: boolean;
  /** LifeStar / Auszahlungsplan: guaranteed share of the premium in percent (LifeStar 10–100). */
  guaranteedSharePercent?: number;
  /** Unit-linked products: fund chosen after the suitability check (Pax fund name). */
  fundName?: string;
  /** Contract start (ISO, first of a month); default: the first of next month. */
  startDate?: string;
}

/**
 * Machine-readable pricing issues, so the UI can translate them. `warnings` carries the same
 * information as German text for the model and the audit trail.
 */
export type QuoteIssueCode =
  | "entry_age_below_min"
  | "entry_age_above_max"
  | "end_age_out_of_range"
  | "duration_too_short"
  | "sum_below_min"
  | "sum_above_max"
  | "pension_above_sum_insurance"
  | "premium_below_min"
  | "premium_above_3a_max"
  | "single_premium_below_min"
  | "single_premium_above_max"
  | "amount_missing"
  | "quicksale_unavailable"
  | "quicksale_warning";

export interface QuoteIssue {
  code: QuoteIssueCode;
  /** Blocking issues mean the product cannot be written with these inputs. */
  blocking: boolean;
  params?: Record<string, string | number>;
}

export interface QuoteRider {
  /** Quicksale tariff code, e.g. "I" (premium waiver), "PFZ", "IR". */
  code?: string;
  name: string;
  premiumAnnual: number;
}

export interface ScenarioValues {
  guaranteed?: number;
  low?: number;
  medium?: number;
  high?: number;
}

export interface Quote {
  productCode: ProductCode;
  premiumAnnualGross: number;
  premiumAnnualNet: number;
  /** "quicksale" = live Pax tariff, "estimate" = fallback model. */
  source: "quicksale" | "estimate";
  sumInsured?: number;
  annualPension?: number;
  /** One-off premium (savings products, Auszahlungsplan). */
  singlePremium?: number;
  /** Savings products: projected values by scenario (low/medium/high) and guaranteed. */
  maturity?: ScenarioValues;
  /** Auszahlungsplan: projected annual payout by scenario and guaranteed. */
  payoutAnnual?: ScenarioValues;
  /** Contract start (ISO, first of next month) and duration in years. */
  startDate?: string;
  durationYears?: number;
  /** Unit-linked: fund and guaranteed share actually used for the projection. */
  fundName?: string;
  guaranteedSharePercent?: number;
  riders: QuoteRider[];
  warnings: string[];
  issues: QuoteIssue[];
  inputs: QuoteInput;
}

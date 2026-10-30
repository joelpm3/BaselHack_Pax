import type { ProductCode } from "@/lib/domain/products";

export interface QuoteInput {
  productCode: ProductCode;
  pillar: "3a" | "3b";
  birthDate: string; // ISO yyyy-mm-dd
  sex: "male" | "female";
  smoker: boolean;
  /** Contract end age, e.g. 65. */
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
}

export interface Quote {
  productCode: ProductCode;
  premiumAnnualGross: number;
  premiumAnnualNet: number;
  /** "quicksale" = live Pax tariff, "estimate" = fallback model. */
  source: "quicksale" | "estimate";
  sumInsured?: number;
  annualPension?: number;
  /** Savings products: projected values by scenario (low/medium/high) and guaranteed. */
  maturity?: { guaranteed?: number; low?: number; medium?: number; high?: number };
  riders: Array<{ name: string; premiumAnnual: number }>;
  warnings: string[];
  inputs: QuoteInput;
}

/**
 * Client-safe types shared by the advisor tools (server) and their widgets (client).
 * Amounts are CHF per year unless a name says otherwise.
 */

import type { ContactChannel, DocumentType } from "@/lib/domain/taxonomy";

/** Income in one situation (retirement, disability, death) split by source, as Logismata returns it. */
export interface IncomeBreakdown {
  /** Gross income today (reference). */
  grossIncome: number;
  need: number;
  pillar1: number;
  pillar2: number;
  /** Retirement: asset drawdown incl. 3rd pillar. Risk: always 0. */
  other: number;
  /** Income of the partner who keeps working. */
  partner: number;
  total: number;
  gap: number;
  surplus: number;
  /** The gap capitalised (what a lump sum would have to be). */
  capitalGap: number;
}

export type PictureKind = "retirement" | "disability" | "death";
export type RiskCause = "illness" | "accident";

export interface AdvisorMessageMetadata {
  inputMode?: "text" | "voice" | "upload" | "widget";
  documentIds?: string[];
  /** Opening message written when the conversation was created. */
  kind?: "greeting";
  variant?: "default" | "upload" | "existing" | "hint";
  /** Cockpit hint the conversation was opened from (greeting only). */
  hintId?: string;
  createdAt?: number;
  model?: string;
}

// ─── Tool outputs ───────────────────────────────────────────────────────────

export interface ProfileFieldChange {
  path: string;
  value: unknown;
}

export interface UpdateProfileOutput {
  status: "ok" | "invalid";
  /** Paths and new values that were stored with this call. */
  changes: ProfileFieldChange[];
  completeness: number;
  location: { zip: string; city: string; canton: string; taxLocationId: number } | null;
  /** The place the customer named but which could not be resolved to a tax location. */
  locationNotFound: string | null;
  /** Core fields still needed for the analyses (profile paths). */
  missingForAnalysis: string[];
  error: string | null;
}

export interface Assumptions {
  needPercent: number;
  deathNeedPercent?: number;
  interestRate: number;
  retirementAge?: number;
  /** True if 2nd-pillar values are Logismata estimates (no pension certificate yet). */
  pillar2Estimated: boolean;
}

export type MissingOutput = { status: "missing"; missing: string[] };

export type PensionOverviewOutput =
  | MissingOutput
  | {
      status: "ok";
      household: boolean;
      retirementAge: number;
      retirementYear: number;
      breakdown: IncomeBreakdown;
      availableFortune: number;
      capitalNeed: number;
      pillar3a: { balance: number | null; annualContribution: number | null };
      assumptions: Assumptions;
    };

export interface RiskScenarioResult {
  event: "disability" | "death";
  cause: RiskCause;
  breakdown: IncomeBreakdown;
}

export interface RiskPersonResult {
  person: 1 | 2;
  firstName: string | null;
  /** Logismata reports the person as (almost) retired: no risk figures. */
  retired: boolean;
  scenarios: RiskScenarioResult[];
}

export type RiskAnalysisOutput =
  | MissingOutput
  | {
      status: "ok";
      persons: RiskPersonResult[];
      dependentChildren: number;
      assumptions: Assumptions;
    };

export const SCENARIO_KINDS = ["child", "home_purchase", "early_retirement", "pillar3a"] as const;
export type ScenarioKind = (typeof SCENARIO_KINDS)[number];

export interface ScenarioParams {
  /** child: number of additional children. */
  children?: number;
  /** early_retirement: age to stop working. */
  retirementAge?: number;
  /** pillar3a: yearly 3a contribution. */
  yearlyAmount?: number;
  /** home_purchase: withdrawal from the pension fund (WEF). */
  pensionFundWithdrawal?: number;
  /** home_purchase: withdrawal from 3a. */
  pillar3aWithdrawal?: number;
}

export interface ScenarioComparison {
  kind: PictureKind;
  /** Whose situation: the customer (1) or the partner (2). Retirement is the household. */
  person: 1 | 2;
  firstName: string | null;
  before: IncomeBreakdown;
  after: IncomeBreakdown;
}

export type ScenarioOutput =
  | (MissingOutput & { scenario: ScenarioKind })
  | {
      status: "ok";
      scenario: ScenarioKind;
      params: ScenarioParams;
      comparisons: ScenarioComparison[];
      /** pillar3a: yearly tax saving at the chosen amount. home_purchase: lost yearly pension. */
      extra: { yearlyTaxSavings?: number; lostPension?: number; max3a?: number } | null;
      limits: { minRetirementAge: number; maxRetirementAge: number; max3a: number };
      assumptions: Assumptions;
    };

export type TaxSavingsOutput =
  | MissingOutput
  | {
      status: "ok";
      saving3a: {
        yearlyAmount: number;
        max3a: number;
        duration: number;
        yearlyTaxSavings: number;
        overallTaxSavings: number;
        grossCapital: number;
        netCapital: number;
        capitalTax: number;
      };
      buyIn: {
        amount: number;
        years: number;
        taxSavings: number;
        netInvestment: number;
        additionalPension: number;
        additionalCapital: number;
      } | null;
      assumptions: Assumptions;
    };

export interface DocumentUploadPromptOutput {
  documentTypes: DocumentType[];
}

export interface HandoverOutput {
  handoverId: string;
  reason: string;
  ruleIds: string[];
  urgency: "normal" | "high";
  phone: string | null;
  booked: { channel: ContactChannel; preferredTime: string } | null;
}

export interface FeedbackOutput {
  submitted: { nps: number; comment: string | null } | null;
}

export interface QuickRepliesOutput {
  options: string[];
}

// ─── Vorsorgebild ───────────────────────────────────────────────────────────

export interface PictureScenario {
  kind: PictureKind;
  breakdown: IncomeBreakdown;
  calculatedAt: number;
}

export interface VorsorgebildModel {
  firstName: string | null;
  completeness: number;
  /** Which of the core facts are known (profile paths), in display order. */
  facts: Array<{ key: string; known: boolean }>;
  scenarios: PictureScenario[];
  pillars: {
    /** Gross income today (person + partner). */
    incomeToday: number | null;
    hasPensionFund: boolean | null;
    pensionCapital: number | null;
    pillar3aBalance: number | null;
    pillar3aContribution: number | null;
    /** Pax and external 3rd-pillar policies on file (a pension-fund entry is not one). */
    policies: number;
  };
}

/**
 * Client-safe shapes shared by the sales tools (server) and their widgets (client).
 * Tool outputs are persisted in the chat; widget actions patch them (status, result, signature)
 * so a reloaded chat shows the current state.
 */
import type { ProductCode } from "@/lib/domain/products";
import type { GapType } from "@/lib/domain/taxonomy";
import type { QuoteIssue, QuoteRider, ScenarioValues } from "@/lib/pricing/types";
import type { SuitabilityAnswers, SuitabilityResult } from "./suitability";

export interface Criterion {
  criterion: string;
  value: string;
  met: boolean;
}

export interface PriceView {
  annualGross: number;
  annualNet: number;
  source: "quicksale" | "estimate";
  singlePremium?: number;
  maturity?: ScenarioValues;
  payoutAnnual?: ScenarioValues;
  riders: QuoteRider[];
  startDate?: string;
  durationYears?: number;
  fundName?: string;
  guaranteedSharePercent?: number;
  issues: QuoteIssue[];
}

export interface CoverView {
  sumInsured?: number;
  annualPension?: number;
  annualPremium?: number;
  singlePremium?: number;
  endAge: number;
  durationYears: number;
  waitingPeriodMonths?: number;
  occupationGroup?: number;
}

export type RecommendationStatus = "shown" | "accepted" | "declined";

export interface RecommendationView {
  id: string;
  productCode: ProductCode;
  productName: string;
  pillar: "3a" | "3b" | null;
  gap: GapType;
  /** Further gaps the same product closes (e.g. tax next to retirement). */
  alsoCloses: GapType[];
  headline: string;
  rationale: string;
  criteria: Criterion[];
  cover: CoverView;
  price: PriceView | null;
  /** Unit-linked: only "after the suitability check". */
  requiresSuitability: boolean;
  alternatives: Array<{ code: string; label: string; reason: string }>;
  /** Company rules (flag) that apply to this recommendation. */
  flags: Array<{ ruleId: string; text: string }>;
  url: string;
}

export interface ExcludedProduct {
  productCode: ProductCode;
  productName: string;
  reason: string;
  ruleId?: string;
}

export interface RecommendOutput {
  status: "ok" | "needs_info";
  /** Profile fields the advisor must ask for first. */
  missing: string[];
  recommendations: RecommendationView[];
  excluded: ExcludedProduct[];
  ruleSetVersion: number;
  /** Patched by widget actions ("Nicht passend"). */
  statuses?: Record<string, RecommendationStatus>;
  /** For the advisor: how the offer terms were applied (start date, premium, 3a room). */
  notes?: string[];
}

export interface SuitabilityRecord {
  answers: SuitabilityAnswers;
  result: SuitabilityResult;
  /** The fund the customer picked from the funds of their profile. */
  fund: string;
  completedAt: string;
}

export interface SuitabilityOutput {
  status: "ok" | "not_applicable";
  applicationId: string | null;
  recommendationId: string | null;
  productCode: ProductCode;
  productName: string;
  plannedAnnualPremium: number | null;
  plannedSinglePremium: number | null;
  guarantee: { min: number; max: number; default: number } | null;
  /** Patched after the customer submitted the check. */
  record?: SuitabilityRecord;
}

export interface OfferView {
  productCode: ProductCode;
  productName: string;
  pillar: "3a" | "3b" | null;
  insured: {
    who: "self" | "partner";
    name: string | null;
    birthDate: string;
    sex: "male" | "female";
    smoker: boolean;
    /** Birth date derived from the birth year (1 January) until the form gives the exact one. */
    birthDateAssumed?: boolean;
    /** Smoker status never stated: priced as non-smoker until the customer answers in the form. */
    smokerAssumed?: boolean;
  };
  cover: CoverView;
  price: PriceView;
  startDate: string;
  endDate: string;
  fund?: string;
  guaranteedSharePercent?: number;
  suitability?: { total: number; profile: SuitabilityResult["profile"] };
}

export interface ContactPrefill {
  firstName: string;
  lastName: string;
  birthDate: string;
  email: string;
  phone: string;
}

export interface SignedInfo {
  policyId: string;
  policyNumber: string;
  startDate: string;
  /** Signed, but a Pax advisor still has to check and release it before the policy starts. */
  inReview: boolean;
}

export type OfferStatus = "ok" | "suitability_required" | "not_suitable" | "not_found";

export interface OfferOutput {
  status: OfferStatus;
  applicationId: string | null;
  recommendationId: string;
  offer: OfferView | null;
  /**
   * The form with contact details, birth date and smoker status comes before signing: for
   * customers without contact details and whenever the smoker status is only assumed.
   */
  needsContact: boolean;
  contact: ContactPrefill;
  /** Patched by the widget actions. */
  contactSaved?: boolean;
  signed?: SignedInfo;
}

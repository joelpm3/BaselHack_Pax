import type { ProductCode } from "@/lib/domain/products";
import type { GapType, Locale, PolicyCategory, PolicyStatus } from "@/lib/domain/taxonomy";
import type { QuoteRider, ScenarioValues } from "@/lib/pricing/types";
import type { Criterion, SuitabilityRecord } from "@/lib/sales/types";

/** The two contract documents a customer can download from the cockpit. */
export const CONTRACT_DOCUMENTS = ["offer", "policy"] as const;
export type ContractDocumentKind = (typeof CONTRACT_DOCUMENTS)[number];

export interface Party {
  name: string;
  birthDate?: string | null;
  email?: string | null;
  phone?: string | null;
  /** Postcode and place from the profile (the app stores no street address). */
  place?: string | null;
}

/** Insured benefits and premium, from the signed offer or (seeded policies) the policy row. */
export interface Coverage {
  productCode: ProductCode | null;
  productName: string;
  category: PolicyCategory;
  pillar: "3a" | "3b" | null;
  insured: { name: string; birthDate?: string | null; smoker?: boolean | null };
  startDate: string | null;
  endDate: string | null;
  durationYears?: number | null;
  endAge?: number | null;
  sumInsured?: number | null;
  annualPension?: number | null;
  waitingPeriodMonths?: number | null;
  /** Gross premium per year (paid annually). */
  premiumAnnual?: number | null;
  /** Premium after the current, non-guaranteed surplus. */
  premiumNet?: number | null;
  singlePremium?: number | null;
  fund?: string | null;
  guaranteedSharePercent?: number | null;
  riders: QuoteRider[];
  maturity?: ScenarioValues;
  payoutAnnual?: ScenarioValues;
  priceSource?: "quicksale" | "estimate" | null;
}

export interface RecommendationReasons {
  gap: GapType;
  alsoCloses: GapType[];
  gapAnnual: number | null;
  headline: string;
  rationale: string;
  criteria: Criterion[];
  alternatives: Array<{ label: string; reason: string }>;
}

interface DocumentBase {
  locale: Locale;
  policyNumber: string;
  policyholder: Party;
  coverage: Coverage;
}

/** Antrag: what the customer signed (status offer = in review, active = released). */
export interface OfferDocument extends DocumentBase {
  kind: "offer";
  status: PolicyStatus;
  signature: { name: string; signedAt: string };
  suitability: SuitabilityRecord | null;
  recommendation: RecommendationReasons | null;
}

/** Police: the active contract. */
export interface PolicyDocument extends DocumentBase {
  kind: "policy";
  status: PolicyStatus;
  beneficiaries: string[];
  approval: { advisorName: string | null; approvedAt: string | null } | null;
  signature: { name: string; signedAt: string } | null;
  /** The day the document was produced (ISO date). */
  issuedOn: string;
}

export type ContractDocument = OfferDocument | PolicyDocument;

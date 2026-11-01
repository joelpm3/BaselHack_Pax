import type { schema } from "@/lib/db";
import type { GapType, Locale } from "@/lib/domain/taxonomy";
import type { QuoteRider, ScenarioValues } from "@/lib/pricing/types";
import type { OfferView, SuitabilityRecord } from "@/lib/sales/types";
import type {
  ContractDocumentKind,
  Coverage,
  OfferDocument,
  Party,
  PolicyDocument,
  RecommendationReasons,
} from "./types";

type Policy = typeof schema.policies.$inferSelect;
type Application = typeof schema.applications.$inferSelect;
type Recommendation = typeof schema.recommendations.$inferSelect;
type Customer = typeof schema.customers.$inferSelect;

/**
 * Which documents a policy has: the Antrag once a Pax application behind it is signed (in
 * review or released), the Police once it is active. External policies have neither.
 */
export function contractDocumentsFor(
  policy: Pick<Policy, "isExternal" | "status" | "applicationId">,
): ContractDocumentKind[] {
  if (policy.isExternal) return [];
  const kinds: ContractDocumentKind[] = [];
  if (policy.applicationId && (policy.status === "offer" || policy.status === "active"))
    kinds.push("offer");
  if (policy.status === "active") kinds.push("policy");
  return kinds;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

function fullName(customer: Customer): string | null {
  return str([customer.firstName, customer.lastName].filter(Boolean).join(" "));
}

export function partyOf(customer: Customer, place: string | null, fallbackName: string): Party {
  return {
    name: fullName(customer) ?? fallbackName,
    birthDate: customer.birthDate,
    email: customer.email,
    phone: customer.phone,
    place,
  };
}

/** Benefits as signed: the offer snapshot, with the policy's (final) dates. */
export function coverageFromOffer(offer: OfferView, policy: Policy, holderName: string): Coverage {
  return {
    productCode: offer.productCode,
    productName: offer.productName,
    category: policy.category,
    pillar: offer.pillar,
    insured: {
      name: policy.insuredPerson ?? offer.insured.name ?? holderName,
      birthDate: offer.insured.birthDate,
      smoker: offer.insured.smoker,
    },
    startDate: policy.startDate ?? offer.startDate,
    endDate: policy.endDate ?? offer.endDate,
    durationYears: offer.cover.durationYears,
    endAge: offer.cover.endAge,
    sumInsured: offer.cover.sumInsured,
    annualPension: offer.cover.annualPension,
    waitingPeriodMonths: offer.cover.waitingPeriodMonths,
    premiumAnnual: offer.price.annualGross,
    premiumNet: offer.price.annualNet,
    singlePremium: offer.price.singlePremium ?? offer.cover.singlePremium,
    fund: offer.fund,
    guaranteedSharePercent: offer.guaranteedSharePercent,
    riders: offer.price.riders,
    maturity: offer.price.maturity,
    payoutAnnual: offer.price.payoutAnnual,
    priceSource: offer.price.source,
  };
}

/** Benefits of a policy without a signed offer behind it (e.g. seeded Pax policies). */
export function coverageFromPolicy(policy: Policy, holderName: string): Coverage {
  const d = policy.details ?? {};
  return {
    productCode: policy.productCode,
    productName: policy.productName,
    category: policy.category,
    pillar: policy.pillar,
    insured: { name: policy.insuredPerson ?? holderName },
    startDate: policy.startDate,
    endDate: policy.endDate,
    durationYears: num(d.durationYears),
    sumInsured: policy.sumInsured,
    annualPension: policy.annuityAnnual,
    waitingPeriodMonths: num(d.waitingPeriodMonths),
    premiumAnnual: policy.premiumAnnual,
    premiumNet: num(d.premiumNet),
    singlePremium: num(d.singlePremium),
    fund: str(d.fund),
    guaranteedSharePercent: num(d.guaranteedSharePercent),
    riders: Array.isArray(d.riders) ? (d.riders as QuoteRider[]) : [],
    maturity: (d.maturity as ScenarioValues | undefined) ?? undefined,
    payoutAnnual: (d.payoutAnnual as ScenarioValues | undefined) ?? undefined,
    priceSource:
      d.priceSource === "quicksale" || d.priceSource === "estimate" ? d.priceSource : null,
  };
}

export function reasonsOf(rec: Recommendation): RecommendationReasons {
  const params = rec.parameters ?? {};
  return {
    gap: rec.gap,
    alsoCloses: Array.isArray(params.alsoCloses) ? (params.alsoCloses as GapType[]) : [],
    gapAnnual: num(params.gapAnnual),
    headline: rec.headline,
    rationale: rec.rationale,
    criteria: rec.criteria,
    alternatives: (rec.alternatives ?? []).map((a) => ({ code: a.productCode, reason: a.reason })),
  };
}

/** Beneficiaries as written on an uploaded policy (text or list). */
export function beneficiariesOf(policy: Policy): string[] {
  const value = policy.details?.beneficiaries;
  if (Array.isArray(value)) return value.map(str).filter((b): b is string => Boolean(b));
  const text = str(value);
  return text ? [text] : [];
}

export interface ContractSources {
  policy: Policy;
  customer: Customer;
  place: string | null;
  application: Application | null;
  recommendation: Recommendation | null;
  advisorName: string | null;
  today: string;
}

/** Assembles the document, or null when this policy does not have it (yet). */
export function contractDocument(
  kind: ContractDocumentKind,
  s: ContractSources,
): OfferDocument | PolicyDocument | null {
  const { policy, customer, application } = s;
  if (!contractDocumentsFor(policy).includes(kind)) return null;
  const policyNumber = policy.policyNumber ?? policy.id.slice(0, 8);
  const holder = partyOf(customer, s.place, policy.insuredPerson ?? "–");
  const offer =
    application?.status === "signed" ? (application.offer as unknown as OfferView) : null;
  const coverage = offer?.price
    ? coverageFromOffer(offer, policy, holder.name)
    : coverageFromPolicy(policy, holder.name);
  const signature =
    application?.signatureName && application.signedAt
      ? { name: application.signatureName, signedAt: application.signedAt.toISOString() }
      : null;
  const locale = customer.locale as Locale;

  if (kind === "offer") {
    if (!offer?.price || !signature) return null;
    return {
      kind,
      locale,
      policyNumber,
      status: policy.status,
      policyholder: holder,
      coverage,
      signature,
      suitability: (application?.suitability as SuitabilityRecord | null) ?? null,
      recommendation: s.recommendation ? reasonsOf(s.recommendation) : null,
    };
  }
  return {
    kind,
    locale,
    policyNumber,
    status: policy.status,
    policyholder: holder,
    coverage,
    beneficiaries: beneficiariesOf(policy),
    approval:
      typeof policy.details?.approvedAt === "string"
        ? { advisorName: s.advisorName, approvedAt: policy.details.approvedAt }
        : null,
    signature,
    issuedOn: s.today,
  };
}

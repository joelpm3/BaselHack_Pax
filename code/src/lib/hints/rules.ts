import type { RiskPersonResult } from "@/lib/advisor/types";
import { type PolicySubject, subjectOfPolicy } from "@/lib/domain/policy-subject";
import { type LifeSituation, type Person, pillar2Of } from "@/lib/domain/profile";
import type { HintSeverity, HintType, PolicyCategory, PolicyStatus } from "@/lib/domain/taxonomy";
import type { QuoteInput } from "@/lib/pricing/types";

/**
 * Rule-based detection of cockpit hints. Pure and unit-tested: the model only phrases the
 * explanation afterwards. Each hint states what is off with the current cover; products are
 * never the trigger.
 */

export interface PolicyFacts {
  id: string;
  insurer: string;
  isExternal: boolean;
  category: PolicyCategory;
  productName: string;
  pillar: "3a" | "3b" | null;
  status: PolicyStatus;
  startDate: string | null;
  endDate: string | null;
  noticeDate: string | null;
  premiumAnnual: number | null;
  sumInsured: number | null;
  annuityAnnual: number | null;
  insuredPerson: string | null;
  details: Record<string, unknown> | null;
}

export interface HintFacts {
  profile: LifeSituation;
  policies: PolicyFacts[];
  /** ISO date. */
  today: string;
  limits3a: { withPensionFund: number; withoutPensionFund: number };
  /**
   * The stored Logismata risk check incl. the household's policies, when it still matches the
   * profile. Gap hints use it; only without it do they fall back to rules of thumb.
   */
  risk?: { persons: RiskPersonResult[] } | null;
}

export interface DetectedHint {
  type: HintType;
  severity: HintSeverity;
  policyId: string | null;
  /** Stable identity of the finding within one customer (upsert key). */
  key: string;
  /** Facts the explanation and the UI may use. Amounts in CHF per year unless named otherwise. */
  data: Record<string, unknown>;
}

export const HINT_WINDOW_DAYS = 183;
/** Rule of thumb for families: death cover of about three gross annual incomes. */
export const DEATH_COVER_INCOME_MULTIPLE = 3;
/** Disability need as in the Pax Vorsorgecheck: 80% of gross income. */
export const DISABILITY_NEED_SHARE = 0.8;
/** Maximum full IV pension (CHF 2'520 per month); real IV pensions are often lower. */
export const MAX_IV_PENSION = 30_240;
/** IV child pension: 40% of the IV pension per child. */
export const MAX_IV_CHILD_PENSION = Math.round(MAX_IV_PENSION * 0.4);
/** A calculated gap below this share of the need is not worth a hint. */
export const MIN_CALCULATED_GAP_SHARE = 0.1;

type Subject = PolicySubject;

interface Adult {
  subject: Subject;
  person: Person;
  name: string | undefined;
}

const DAY_MS = 86_400_000;
const daysUntil = (today: string, date: string) =>
  Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
const yearOfIso = (iso: string) => Number(iso.slice(0, 4));
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const fold = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

function adultsOf(profile: LifeSituation): Adult[] {
  const adults: Adult[] = [
    { subject: "self", person: profile.person, name: profile.person.firstName },
  ];
  if (profile.partner)
    adults.push({ subject: "partner", person: profile.partner, name: profile.partner.firstName });
  return adults;
}

function activePolicies(facts: HintFacts): PolicyFacts[] {
  return facts.policies.filter((p) => p.status === "active");
}

function policiesOf(facts: HintFacts, subject: Subject, category?: PolicyCategory) {
  return activePolicies(facts).filter(
    (p) =>
      (category === undefined || p.category === category) &&
      subjectOfPolicy(p, facts.profile) === subject,
  );
}

function dependentChildren(profile: LifeSituation, year: number): number {
  return profile.children.filter(
    (c) => year - c.birthYear < 18 || (c.educationUntil !== undefined && c.educationUntil >= year),
  ).length;
}

function otherAdultIncome(adults: Adult[], adult: Adult): number | undefined {
  const other = adults.find((a) => a.subject !== adult.subject);
  return other ? (other.person.grossIncome ?? 0) : undefined;
}

// ─── contract_ending ────────────────────────────────────────────────────────

export function detectContractEnding(facts: HintFacts): DetectedHint[] {
  const hints: DetectedHint[] = [];
  for (const policy of activePolicies(facts)) {
    const notice =
      policy.noticeDate !== null ? daysUntil(facts.today, policy.noticeDate) : Number.NaN;
    const end = policy.endDate !== null ? daysUntil(facts.today, policy.endDate) : Number.NaN;
    const base = {
      insurer: policy.insurer,
      productName: policy.productName,
      isExternal: policy.isExternal,
      category: policy.category,
      endDate: policy.endDate,
      noticeDate: policy.noticeDate,
    };
    if (notice >= 0 && notice <= HINT_WINDOW_DAYS) {
      hints.push({
        type: "contract_ending",
        severity: notice <= 60 ? "warning" : "info",
        policyId: policy.id,
        key: `contract_ending:${policy.id}`,
        data: { ...base, kind: "notice", days: notice },
      });
    } else if (end >= 0 && end <= HINT_WINDOW_DAYS) {
      hints.push({
        type: "contract_ending",
        severity: "info",
        policyId: policy.id,
        key: `contract_ending:${policy.id}`,
        data: { ...base, kind: "end", days: end },
      });
    }
  }
  return hints;
}

// ─── pillar3a_not_maxed ─────────────────────────────────────────────────────

export function detectPillar3aNotMaxed(facts: HintFacts): DetectedHint[] {
  const { person, pillar2, pillar3a } = facts.profile;
  const income = person.grossIncome ?? 0;
  const year = yearOfIso(facts.today);
  const earning =
    income > 0 &&
    (person.employment === undefined ||
      person.employment === "employed" ||
      person.employment === "self_employed");
  const age = person.birthYear !== undefined ? year - person.birthYear : undefined;
  if (!earning || (age !== undefined && age >= 65)) return [];

  const withPensionFund = pillar2.hasPensionFund !== false;
  const limit = withPensionFund
    ? facts.limits3a.withPensionFund
    : Math.min(Math.round(income * 0.2), facts.limits3a.withoutPensionFund);
  const policies3a = policiesOf(facts, "self").filter(
    (p) => p.category === "pillar3a" || p.pillar === "3a",
  );
  const known = pillar3a.annualContribution !== undefined || policies3a.length > 0;
  const contribution = Math.max(
    pillar3a.annualContribution ?? 0,
    policies3a.reduce((sum, p) => sum + num(p.premiumAnnual), 0),
  );
  if (known && contribution >= limit - 100) return [];
  return [
    {
      type: "pillar3a_not_maxed",
      severity: "opportunity",
      policyId: null,
      key: "pillar3a_not_maxed:self",
      data: {
        limit,
        withPensionFund,
        contribution: known ? contribution : null,
        gap: known ? limit - contribution : null,
      },
    },
  ];
}

// ─── coverage_mismatch ──────────────────────────────────────────────────────

function deathCoverOf(facts: HintFacts, subject: Subject): number {
  const own = policiesOf(facts, subject);
  const risk = own
    .filter((p) => p.category === "risk_death")
    .reduce((s, p) => s + num(p.sumInsured), 0);
  const pensionFund = own.filter((p) => p.category === "pension_fund");
  const lumpSum =
    pensionFund.length > 0
      ? pensionFund.reduce((s, p) => s + num(p.details?.deathLumpSum), 0)
      : num(pillar2Of(facts.profile, subject).deathLumpSum);
  return risk + lumpSum;
}

function pensionFundBenefitOf(
  facts: HintFacts,
  subject: Subject,
  field: "disabilityPension" | "childPension",
): number | undefined {
  const fund = policiesOf(facts, subject, "pension_fund").find(
    (p) => typeof p.details?.[field] === "number",
  );
  if (fund) return num(fund.details?.[field]);
  return pillar2Of(facts.profile, subject)[field];
}

/** The stored risk check for this adult, unless Logismata reports them as retired. */
function calculatedFor(facts: HintFacts, subject: Subject): RiskPersonResult | undefined {
  const number = subject === "self" ? 1 : 2;
  const person = facts.risk?.persons.find((p) => p.person === number);
  return person && !person.retired ? person : undefined;
}

/** A gap from the stored risk check: the same figures the risk card and the Vorsorgebild show. */
function calculatedGapHint(
  adult: Adult,
  person: RiskPersonResult,
  event: "death" | "disability",
  severity: HintSeverity,
  policyId: string | null,
): DetectedHint | null {
  // Illness is the typical gap (accidents add UVG benefits); the Vorsorgebild shows it too.
  const b = person.scenarios.find((s) => s.event === event && s.cause === "illness")?.breakdown;
  if (!b || b.need <= 0 || b.gap < b.need * MIN_CALCULATED_GAP_SHARE) return null;
  return {
    type: "coverage_mismatch",
    severity,
    policyId,
    key: `coverage_mismatch:${event}:${adult.subject}`,
    data: {
      risk: event,
      source: "calculation",
      subject: adult.subject,
      name: adult.name ?? null,
      need: b.need,
      coveredIncome: b.total,
      policies: b.policies,
      gap: b.gap,
      monthlyNeed: Math.round(b.need / 12),
      monthlyGap: Math.round(b.gap / 12),
    },
  };
}

export function detectCoverageMismatch(facts: HintFacts): DetectedHint[] {
  const hints: DetectedHint[] = [];
  const year = yearOfIso(facts.today);
  const children = dependentChildren(facts.profile, year);
  const adults = adultsOf(facts.profile);

  for (const adult of adults) {
    const income = adult.person.grossIncome ?? 0;
    const partnerIncome = otherAdultIncome(adults, adult);
    const partnerDepends = partnerIncome !== undefined && partnerIncome < income * 0.5;
    const hasDependants = children > 0 || partnerDepends;
    const deathPolicies = policiesOf(facts, adult.subject, "risk_death");
    const mainDeathPolicy = deathPolicies.toSorted(
      (a, b) => num(b.sumInsured) - num(a.sumInsured),
    )[0];
    const calculated = calculatedFor(facts, adult.subject);

    if (calculated) {
      const found = [
        calculatedGapHint(adult, calculated, "death", "warning", mainDeathPolicy?.id ?? null),
        calculatedGapHint(
          adult,
          calculated,
          "disability",
          hasDependants ? "warning" : "info",
          null,
        ),
      ];
      hints.push(...found.filter((h): h is DetectedHint => h !== null));
    }

    if (!calculated && income > 0 && hasDependants) {
      const cover = deathCoverOf(facts, adult.subject);
      const need = income * DEATH_COVER_INCOME_MULTIPLE;
      if (cover < need * 0.8) {
        hints.push({
          type: "coverage_mismatch",
          severity: "warning",
          policyId: mainDeathPolicy?.id ?? null,
          key: `coverage_mismatch:death:${adult.subject}`,
          data: {
            risk: "death",
            source: "rule_of_thumb",
            subject: adult.subject,
            name: adult.name ?? null,
            income,
            cover,
            need,
            gap: need - cover,
            dependentChildren: children,
            partnerDepends,
            incomeMultiple: DEATH_COVER_INCOME_MULTIPLE,
          },
        });
      }
    }

    if (!hasDependants && partnerIncome === undefined && mainDeathPolicy) {
      hints.push({
        type: "coverage_mismatch",
        severity: "info",
        policyId: mainDeathPolicy.id,
        key: `coverage_mismatch:death_without_dependants:${adult.subject}`,
        data: {
          risk: "death_without_dependants",
          subject: adult.subject,
          name: adult.name ?? null,
          cover: deathPolicies.reduce((s, p) => s + num(p.sumInsured), 0),
          premiumAnnual: deathPolicies.reduce((s, p) => s + num(p.premiumAnnual), 0),
          insurer: mainDeathPolicy.insurer,
        },
      });
    }

    const pensionFundDisability = pensionFundBenefitOf(facts, adult.subject, "disabilityPension");
    if (!calculated && income > 0 && pensionFundDisability !== undefined) {
      const privateDisability = policiesOf(facts, adult.subject, "risk_disability").reduce(
        (s, p) => s + num(p.annuityAnnual),
        0,
      );
      // Child pensions are part of the cover, as in Logismata's calculation.
      const childPensions =
        children *
        (MAX_IV_CHILD_PENSION + (pensionFundBenefitOf(facts, adult.subject, "childPension") ?? 0));
      const need = Math.round(income * DISABILITY_NEED_SHARE);
      const cover = MAX_IV_PENSION + childPensions + pensionFundDisability + privateDisability;
      if (cover < need * 0.9) {
        hints.push({
          type: "coverage_mismatch",
          severity: hasDependants ? "warning" : "info",
          policyId: null,
          key: `coverage_mismatch:disability:${adult.subject}`,
          data: {
            risk: "disability",
            source: "estimate",
            subject: adult.subject,
            name: adult.name ?? null,
            income,
            need,
            ivPensionMax: MAX_IV_PENSION,
            childPensions,
            pensionFundDisability,
            privateDisability,
            gap: need - cover,
          },
        });
      }
    }
  }
  return hints;
}

// ─── double_cover ───────────────────────────────────────────────────────────

/** Indemnity insurance pays a loss only once: two contracts are paid for nothing. */
const INDEMNITY_CATEGORIES: PolicyCategory[] = ["nonlife_household", "nonlife_liability"];
const PERSONAL_RISK_CATEGORIES: PolicyCategory[] = ["risk_death", "risk_disability"];

function summarize(policies: PolicyFacts[]) {
  return policies.map((p) => ({
    insurer: p.insurer,
    productName: p.productName,
    premiumAnnual: p.premiumAnnual,
    sumInsured: p.sumInsured,
    annuityAnnual: p.annuityAnnual,
  }));
}

/** The newest external contract is the natural one to question. */
function focusPolicy(policies: PolicyFacts[]): PolicyFacts {
  return (
    policies
      .filter((p) => p.isExternal)
      .toSorted((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""))[0] ?? policies[0]
  );
}

export function detectDoubleCover(facts: HintFacts): DetectedHint[] {
  const hints: DetectedHint[] = [];
  const active = activePolicies(facts);
  for (const category of INDEMNITY_CATEGORIES) {
    const same = active.filter((p) => p.category === category);
    if (same.length < 2) continue;
    hints.push({
      type: "double_cover",
      severity: "warning",
      policyId: focusPolicy(same).id,
      key: `double_cover:${category}`,
      data: {
        category,
        kind: "indemnity",
        policies: summarize(same),
        premiumTotal: same.reduce((s, p) => s + num(p.premiumAnnual), 0),
      },
    });
  }
  for (const category of PERSONAL_RISK_CATEGORIES) {
    for (const adult of adultsOf(facts.profile)) {
      const same = policiesOf(facts, adult.subject, category);
      if (same.length < 2 || new Set(same.map((p) => fold(p.insurer))).size < 2) continue;
      hints.push({
        type: "double_cover",
        severity: "info",
        policyId: focusPolicy(same).id,
        key: `double_cover:${category}:${adult.subject}`,
        data: {
          category,
          kind: "personal",
          subject: adult.subject,
          name: adult.name ?? null,
          policies: summarize(same),
          premiumTotal: same.reduce((s, p) => s + num(p.premiumAnnual), 0),
          coverTotal: same.reduce(
            (s, p) => s + num(category === "risk_death" ? p.sumInsured : p.annuityAnnual),
            0,
          ),
        },
      });
    }
  }
  return hints;
}

// ─── cheaper_equivalent (needs a Pax quote) ─────────────────────────────────

export interface CheaperCandidate {
  policy: PolicyFacts;
  subject: Subject;
  quoteInput: QuoteInput;
}

function birthDateFor(policy: PolicyFacts, person: Person): string | undefined {
  const fromDocument = policy.details?.insuredBirthDate;
  if (typeof fromDocument === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fromDocument))
    return fromDocument;
  return person.birthYear !== undefined ? `${person.birthYear}-07-01` : undefined;
}

/** External term-life and disability contracts we can price like-for-like at Pax. */
export function cheaperEquivalentCandidates(facts: HintFacts): CheaperCandidate[] {
  const candidates: CheaperCandidate[] = [];
  for (const adult of adultsOf(facts.profile)) {
    for (const policy of policiesOf(facts, adult.subject)) {
      if (!policy.isExternal || !policy.premiumAnnual) continue;
      const birthDate = birthDateFor(policy, adult.person);
      if (!birthDate || !adult.person.sex) continue;
      const birthYear = yearOfIso(birthDate);
      const endAge = Math.min(
        70,
        Math.max(
          yearOfIso(facts.today) - birthYear + 5,
          policy.endDate ? yearOfIso(policy.endDate) - birthYear : 65,
        ),
      );
      const base = {
        pillar: policy.pillar === "3a" ? ("3a" as const) : ("3b" as const),
        birthDate,
        sex: adult.person.sex,
        smoker: adult.person.smoker ?? false,
        endAge,
      };
      if (policy.category === "risk_death" && policy.sumInsured) {
        candidates.push({
          policy,
          subject: adult.subject,
          quoteInput: { ...base, productCode: "todesfall", sumInsured: policy.sumInsured },
        });
      } else if (policy.category === "risk_disability" && policy.annuityAnnual) {
        const waiting = policy.details?.waitingPeriodMonths === 12 ? 12 : 24;
        candidates.push({
          policy,
          subject: adult.subject,
          quoteInput: {
            ...base,
            pillar: "3b",
            productCode: "erwerbsunfaehigkeit",
            annualPension: policy.annuityAnnual,
            waitingPeriodMonths: waiting,
          },
        });
      }
    }
  }
  return candidates;
}

/** A hint only when Pax is clearly cheaper (≥10% and ≥ CHF 100 a year). */
export function cheaperEquivalentHint(
  candidate: CheaperCandidate,
  quote: { premiumAnnualNet: number; source: "quicksale" | "estimate" },
): DetectedHint | null {
  const external = num(candidate.policy.premiumAnnual);
  const saving = Math.round(external - quote.premiumAnnualNet);
  if (quote.premiumAnnualNet <= 0 || saving < 100 || quote.premiumAnnualNet > external * 0.9)
    return null;
  return {
    type: "cheaper_equivalent",
    severity: "opportunity",
    policyId: candidate.policy.id,
    key: `cheaper_equivalent:${candidate.policy.id}`,
    data: {
      insurer: candidate.policy.insurer,
      productName: candidate.policy.productName,
      productCode: candidate.quoteInput.productCode,
      subject: candidate.subject,
      externalPremium: external,
      paxPremium: Math.round(quote.premiumAnnualNet),
      saving,
      savingPercent: Math.round((saving / external) * 100),
      sumInsured: candidate.quoteInput.sumInsured ?? null,
      annualPension: candidate.quoteInput.annualPension ?? null,
      endAge: candidate.quoteInput.endAge,
      quoteSource: quote.source,
      noticeDate: candidate.policy.noticeDate,
    },
  };
}

// ─── pension_buyin (tax figure from Logismata) ──────────────────────────────

export interface BuyInCandidate {
  subject: Subject;
  name: string | null;
  maxBuyIn: number;
  income: number;
  birthYear: number;
  sex: "male" | "female";
}

const MIN_BUY_IN = 5_000;

export function pensionBuyInCandidates(facts: HintFacts): BuyInCandidate[] {
  const year = yearOfIso(facts.today);
  const candidates: BuyInCandidate[] = [];
  for (const adult of adultsOf(facts.profile)) {
    const fund = policiesOf(facts, adult.subject, "pension_fund").find(
      (p) => typeof p.details?.maxBuyIn === "number",
    );
    const maxBuyIn =
      fund !== undefined
        ? num(fund.details?.maxBuyIn)
        : (pillar2Of(facts.profile, adult.subject).maxBuyIn ?? 0);
    const { birthYear, grossIncome, sex } = adult.person;
    if (maxBuyIn < MIN_BUY_IN || !grossIncome || birthYear === undefined) continue;
    if (year - birthYear >= 62) continue;
    candidates.push({
      subject: adult.subject,
      name: adult.name ?? null,
      maxBuyIn,
      income: grossIncome,
      birthYear,
      sex: sex ?? "male",
    });
  }
  return candidates;
}

export function pensionBuyInHint(
  candidate: BuyInCandidate,
  tax: { taxSavings: number; investment: number; years: number } | null,
): DetectedHint {
  return {
    type: "pension_buyin",
    severity: "opportunity",
    policyId: null,
    key: `pension_buyin:${candidate.subject}`,
    data: {
      subject: candidate.subject,
      name: candidate.name,
      maxBuyIn: candidate.maxBuyIn,
      income: candidate.income,
      taxSavings: tax ? Math.round(tax.taxSavings) : null,
      investment: tax?.investment ?? null,
      years: tax?.years ?? null,
      source: tax ? "logismata" : null,
    },
  };
}

/** All hints that need no external calculation. */
export function detectRuleHints(facts: HintFacts): DetectedHint[] {
  return [
    ...detectCoverageMismatch(facts),
    ...detectDoubleCover(facts),
    ...detectContractEnding(facts),
    ...detectPillar3aNotMaxed(facts),
  ];
}

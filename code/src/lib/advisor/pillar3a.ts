import { subjectOfPolicy } from "@/lib/domain/policy-subject";
import type { LifeSituation } from "@/lib/domain/profile";
import type { PolicyCategory, PolicyStatus } from "@/lib/domain/taxonomy";

/**
 * The customer's pillar 3a over time, from the profile figure and their 3a policies. Pure.
 *
 * `pillar3a.annualContribution` is what the customer says they pay into 3a in total; their 3a
 * policies are part of it. A policy pays in each calendar year from its start to its end year,
 * so a policy cancelled as of 31.12.2026 still uses the 2026 room and none of 2027. Insurance
 * 3a policies (stated in the chat as `details.kind = "insurance_3a"`) only save their savings
 * share: the rest of the premium buys death and disability cover.
 */

export interface Pillar3aPolicy {
  category: PolicyCategory;
  status: PolicyStatus;
  startDate: string | null;
  endDate: string | null;
  premiumAnnual: number | null;
  insuredPerson: string | null;
  details?: Record<string, unknown> | null;
}

export const INSURANCE_3A = "insurance_3a";

const yearOf = (iso: string | null) => (iso ? Number(iso.slice(0, 4)) : undefined);

function ownPolicies(policies: Pillar3aPolicy[], profile: LifeSituation): Pillar3aPolicy[] {
  return policies.filter(
    (p) =>
      p.category === "pillar3a" &&
      p.status === "active" &&
      subjectOfPolicy(p, profile) === "self" &&
      (p.premiumAnnual ?? 0) > 0,
  );
}

/** True when the policy pays premiums in this calendar year. */
export function paysIn(policy: Pillar3aPolicy, year: number): boolean {
  const start = yearOf(policy.startDate);
  const end = yearOf(policy.endDate);
  return (start === undefined || start <= year) && (end === undefined || end >= year);
}

const premiumsIn = (policies: Pillar3aPolicy[], year: number) =>
  policies.filter((p) => paysIn(p, year)).reduce((s, p) => s + (p.premiumAnnual ?? 0), 0);

/**
 * 3a contributions without a policy behind them (bank 3a), assumed to continue. The stated
 * figure includes every 3a policy that has started, also one that has ended since (its premium
 * must not turn into bank saving once the policy is over).
 */
function otherContributions(
  profile: LifeSituation,
  own: Pillar3aPolicy[],
  currentYear: number,
): number {
  const started = own.filter((p) => (yearOf(p.startDate) ?? currentYear) <= currentYear);
  const premiums = started.reduce((s, p) => s + (p.premiumAnnual ?? 0), 0);
  return Math.max(0, (profile.pillar3a.annualContribution ?? 0) - premiums);
}

/** The customer's 3a contributions in a calendar year (for the 3a room of that year). */
export function pillar3aContributionIn(
  year: number,
  profile: LifeSituation,
  policies: Pillar3aPolicy[],
  currentYear: number,
): number {
  const own = ownPolicies(policies, profile);
  return otherContributions(profile, own, currentYear) + premiumsIn(own, year);
}

export type SavingAssumption = "savings_share_unknown" | "mostly_risk";

export interface Pillar3aSaving {
  /** Yearly amount the retirement projection counts as saved. */
  annualSaving: number;
  /** Yearly 3a contribution on file (profile or policies). */
  annualContribution: number;
  /** Insurance 3a premiums not counted as saving (risk cover, costs, or an assumed share). */
  notCounted: number;
  /** Policies whose premiums stop before next year (cancelled or ending). */
  ending: Array<{ endDate: string; premiumAnnual: number }>;
  /** How an unknown savings share was treated; empty when everything was known. */
  assumptions: SavingAssumption[];
}

function savingsShare(policy: Pillar3aPolicy): {
  share: number;
  assumption?: SavingAssumption;
} {
  const details = policy.details ?? {};
  if (details.kind !== INSURANCE_3A) return { share: 1 };
  const percent = details.savingsSharePercent;
  if (typeof percent === "number") return { share: Math.min(100, Math.max(0, percent)) / 100 };
  // Conservative: an unknown share of an insurance 3a counts as not saved.
  return { share: 0, assumption: details.mostlyRisk ? "mostly_risk" : "savings_share_unknown" };
}

/**
 * What the retirement projection counts as yearly 3a saving from next year on: bank 3a
 * contributions plus the savings share of policies that keep running.
 */
export function pillar3aSaving(
  profile: LifeSituation,
  policies: Pillar3aPolicy[],
  currentYear: number,
): Pillar3aSaving {
  const own = ownPolicies(policies, profile);
  let annualSaving = otherContributions(profile, own, currentYear);
  let notCounted = 0;
  const assumptions = new Set<SavingAssumption>();
  const ending: Pillar3aSaving["ending"] = [];
  for (const policy of own) {
    const premium = policy.premiumAnnual ?? 0;
    if (!paysIn(policy, currentYear + 1)) {
      if (policy.endDate && paysIn(policy, currentYear))
        ending.push({ endDate: policy.endDate, premiumAnnual: premium });
      continue;
    }
    const { share, assumption } = savingsShare(policy);
    annualSaving += premium * share;
    notCounted += premium * (1 - share);
    if (assumption) assumptions.add(assumption);
  }
  return {
    annualSaving: Math.round(annualSaving),
    annualContribution: pillar3aContributionIn(currentYear, profile, policies, currentYear),
    notCounted: Math.round(notCounted),
    ending,
    assumptions: [...assumptions],
  };
}

/** What the advisor must say about the 3a figure in the overview (null when nothing special). */
export function pillar3aSavingNote(saving: Pillar3aSaving): string | null {
  const notes: string[] = [];
  for (const end of saving.ending)
    notes.push(
      `A 3a policy (premium CHF ${end.premiumAnnual}/year) ends on ${end.endDate}: the projection counts no saving from it afterwards.`,
    );
  if (saving.assumptions.includes("mostly_risk"))
    notes.push(
      `The customer said the insurance 3a premium goes mostly into risk cover: none of it (CHF ${saving.notCounted}/year) counts as saving. This is an assumption: say so.`,
    );
  else if (saving.assumptions.includes("savings_share_unknown"))
    notes.push(
      `The savings share of the insurance 3a is unknown: none of its premium (CHF ${saving.notCounted}/year) counts as saving. This is a conservative assumption: say so; the policy statement makes it exact.`,
    );
  if (notes.length === 0) return null;
  notes.push(`Counted as yearly 3a saving: CHF ${saving.annualSaving}.`);
  return notes.join(" ");
}

import { subjectOfPolicy } from "@/lib/domain/insured";
import type { LifeSituation, Person } from "@/lib/domain/profile";
import type { PolicyCategory, PolicyStatus } from "@/lib/domain/taxonomy";
import { deathSupportYears } from "@/lib/sales/sizing";
import { hasPartner, REGULAR_RETIREMENT_AGE } from "./logismata/mapping";
import type { IncomeBreakdown, PolicyCover, RiskPersonResult } from "./types";

/**
 * Private cover from the household's own policies (Pax and other insurers), counted on top of
 * what Logismata calculates for AHV/IV and the pension fund. Pensions count as they are; a
 * lump-sum death capital is spread evenly over the survivors' support period, the same period
 * a new death cover is sized over, so a cover sized to close the gap shows it as closed.
 */

export interface CoverPolicy {
  category: PolicyCategory;
  status: PolicyStatus;
  sumInsured: number | null;
  annuityAnnual: number | null;
  insuredPerson: string | null;
}

const amount = (value: number | null) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;

function youngestChild(profile: LifeSituation): number | undefined {
  const years = profile.children.map((c) => c.birthYear);
  return years.length ? Math.max(...years) : undefined;
}

function coverOf(
  person: 1 | 2,
  insured: Person | undefined,
  policies: CoverPolicy[],
  profile: LifeSituation,
  year: number,
): PolicyCover | null {
  const subject = person === 1 ? "self" : "partner";
  const own = policies.filter(
    (p) => p.status === "active" && subjectOfPolicy(p, profile) === subject,
  );
  const sum = (category: PolicyCategory, field: "sumInsured" | "annuityAnnual") =>
    own.filter((p) => p.category === category).reduce((s, p) => s + amount(p[field]), 0);
  const deathCapital = sum("risk_death", "sumInsured");
  const deathAnnuity = sum("risk_death", "annuityAnnual");
  const disabilityAnnuity = sum("risk_disability", "annuityAnnual");
  if (deathCapital + deathAnnuity + disabilityAnnuity === 0) return null;
  const support = deathSupportYears({
    age: year - (insured?.birthYear ?? year - 40),
    currentYear: year,
    // As in the recommendation's sizing, any partner on file counts.
    hasPartner: Boolean(profile.partner),
    youngestChildBirthYear: youngestChild(profile),
  });
  return {
    person,
    deathCapital,
    deathAnnuity,
    disabilityAnnuity,
    supportYears: support.years,
    supportPeriod: support.method,
  };
}

/** Cover per person (1 = customer, 2 = partner); persons without such policies are left out. */
export function policyCoverFor(
  policies: CoverPolicy[],
  profile: LifeSituation,
  year: number,
): PolicyCover[] {
  const covers = [coverOf(1, profile.person, policies, profile, year)];
  if (hasPartner(profile) && profile.partner)
    covers.push(coverOf(2, profile.partner, policies, profile, year));
  return covers.filter((c): c is PolicyCover => c !== null);
}

/** Yearly income the policies provide in this event. */
export function policyIncome(cover: PolicyCover, event: "disability" | "death"): number {
  if (event === "disability") return cover.disabilityAnnuity;
  return cover.deathAnnuity + cover.deathCapital / cover.supportYears;
}

/** The same amounts as a lump sum, to set against the capitalised gap. */
function policyCapital(
  cover: PolicyCover,
  event: "disability" | "death",
  insured: Person | undefined,
  year: number,
): number {
  if (event === "death") return cover.deathCapital + cover.deathAnnuity * cover.supportYears;
  const age = year - (insured?.birthYear ?? year - 40);
  return cover.disabilityAnnuity * Math.max(0, REGULAR_RETIREMENT_AGE - age);
}

/** Adds the policies as an income source: the gap shrinks, anything beyond it is surplus. */
export function withPolicyCover(
  breakdown: IncomeBreakdown,
  event: "disability" | "death",
  cover: PolicyCover | undefined,
  insured: Person | undefined,
  year: number,
): IncomeBreakdown {
  const income = cover ? Math.round(policyIncome(cover, event)) : 0;
  if (!cover || income <= 0) return breakdown;
  return {
    ...breakdown,
    policies: breakdown.policies + income,
    total: breakdown.total + income,
    gap: Math.max(0, breakdown.gap - income),
    surplus: breakdown.surplus + Math.max(0, income - breakdown.gap),
    capitalGap: Math.max(
      0,
      breakdown.capitalGap - Math.round(policyCapital(cover, event, insured, year)),
    ),
  };
}

/** The risk check's results with each person's own policies included. */
export function applyPolicyCover(
  persons: RiskPersonResult[],
  covers: PolicyCover[],
  profile: LifeSituation,
  year: number,
): RiskPersonResult[] {
  return persons.map((entry) => {
    const cover = covers.find((c) => c.person === entry.person);
    if (!cover) return entry;
    const insured = entry.person === 1 ? profile.person : profile.partner;
    return {
      ...entry,
      scenarios: entry.scenarios.map((s) => ({
        ...s,
        breakdown: withPolicyCover(s.breakdown, s.event, cover, insured, year),
      })),
    };
  });
}

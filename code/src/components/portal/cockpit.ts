import type { policies } from "@/lib/db/schema";
import { addMonths } from "@/lib/documents/dates";
import { subjectOfPolicy } from "@/lib/domain/policy-subject";
import type { LifeSituation } from "@/lib/domain/profile";
import { LIFE_AND_PENSION_CATEGORIES } from "@/lib/domain/taxonomy";

/**
 * Pure cockpit arithmetic (grouping, key figures, upcoming dates), shared by the portal
 * sections. Amounts are CHF per year unless named otherwise.
 */

export type PolicyRow = typeof policies.$inferSelect;
export type PolicyGroup = "pillar2" | "pillar3a" | "pillar3b" | "other";

export const POLICY_GROUPS: PolicyGroup[] = ["pillar2", "pillar3a", "pillar3b", "other"];

export function groupOf(policy: Pick<PolicyRow, "category" | "pillar">): PolicyGroup {
  if (policy.category === "pension_fund") return "pillar2";
  if (policy.category === "pillar3a" || policy.pillar === "3a") return "pillar3a";
  if (LIFE_AND_PENSION_CATEGORIES.includes(policy.category)) return "pillar3b";
  return "other";
}

/** Policies shown in the cockpit: everything except cancelled contracts, active first. */
export function visiblePolicies(policies: PolicyRow[]): PolicyRow[] {
  return policies
    .filter((p) => p.status !== "cancelled")
    .toSorted(
      (a, b) =>
        Number(a.status !== "active") - Number(b.status !== "active") ||
        Number(a.isExternal) - Number(b.isExternal) ||
        a.productName.localeCompare(b.productName),
    );
}

const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

export interface KeyFigures {
  premiums: number;
  paxPremiums: number;
  deathCover: number;
  disabilityPension: number;
  retirementPension: number;
  retirementAge: number;
  contracts: number;
}

/** Pension-fund benefits are the customer's own: a partner's certificate never counts here. */
export function keyFigures(policies: PolicyRow[], profile: LifeSituation): KeyFigures {
  const active = policies.filter((p) => p.status === "active");
  const funds = active.filter(
    (p) => p.category === "pension_fund" && subjectOfPolicy(p, profile) === "self",
  );
  const fundPension = funds.reduce((s, p) => s + num(p.annuityAnnual), 0);
  const retirementAge = funds.map((p) => num(p.details?.retirementAge)).find((age) => age > 0);
  return {
    premiums: active.reduce((s, p) => s + num(p.premiumAnnual), 0),
    paxPremiums: active.filter((p) => !p.isExternal).reduce((s, p) => s + num(p.premiumAnnual), 0),
    deathCover:
      active.filter((p) => p.category === "risk_death").reduce((s, p) => s + num(p.sumInsured), 0) +
      funds.reduce((s, p) => s + num(p.details?.deathLumpSum), 0),
    disabilityPension:
      active
        .filter((p) => p.category === "risk_disability")
        .reduce((s, p) => s + num(p.annuityAnnual), 0) +
      (funds.length > 0
        ? funds.reduce((s, p) => s + num(p.details?.disabilityPension), 0)
        : num(profile.pillar2.disabilityPension)),
    retirementPension: fundPension || num(profile.pillar2.projectedPensionAtRetirement),
    retirementAge: retirementAge ?? 65,
    contracts: active.length,
  };
}

export interface UpcomingDate {
  policyId: string;
  date: string;
  kind: "notice" | "end";
  insurer: string;
  productName: string;
  isExternal: boolean;
}

/** Notice deadlines and contract ends from today to `months` ahead, soonest first. */
export function upcomingDates(policies: PolicyRow[], today: string, months = 24): UpcomingDate[] {
  const until = addMonths(today, months);
  const dates: UpcomingDate[] = [];
  for (const p of policies) {
    if (p.status !== "active") continue;
    const base = {
      policyId: p.id,
      insurer: p.insurer,
      productName: p.productName,
      isExternal: p.isExternal,
    };
    if (p.noticeDate && p.noticeDate >= today && p.noticeDate <= until)
      dates.push({ ...base, date: p.noticeDate, kind: "notice" });
    if (p.endDate && p.endDate >= today && p.endDate <= until)
      dates.push({ ...base, date: p.endDate, kind: "end" });
  }
  return dates.toSorted((a, b) => a.date.localeCompare(b.date));
}

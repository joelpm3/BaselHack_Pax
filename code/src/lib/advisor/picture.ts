import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { LifeSituation } from "@/lib/domain/profile";
import { type PolicyCategory, THIRD_PILLAR_CATEGORIES } from "@/lib/domain/taxonomy";
import { getProfile } from "@/lib/profile/service";
import { latestCalculation } from "./logismata/latest";
import {
  householdRiskScenarios,
  isJointlyTaxed,
  missingForPicture,
  type RetirementResponse,
  type RiskScenarioSummary,
  retirementBreakdown,
} from "./logismata/mapping";
import { outdatedChecks, PICTURE_CALCULATIONS } from "./picture-refresh";
import type { PictureScenario, VorsorgebildModel } from "./types";

/**
 * The Vorsorgebild is derived, never stored: profile + the latest real (non-scenario)
 * retirement and risk calculations of the customer.
 */

const FACTS: Array<{ key: string; known: (p: LifeSituation) => boolean }> = [
  { key: "age", known: (p) => p.person.birthYear !== undefined },
  { key: "family", known: (p) => p.person.maritalStatus !== undefined },
  { key: "work", known: (p) => p.person.employment !== undefined },
  { key: "income", known: (p) => p.person.grossIncome !== undefined },
  // A postcode or town is enough: the tax location is resolved from it when a tax check needs it.
  {
    key: "residence",
    known: (p) =>
      p.residence.taxLocationId !== undefined || Boolean(p.residence.zip || p.residence.city),
  },
  { key: "goals", known: (p) => p.goals.length > 0 || p.concerns.length > 0 },
  { key: "assets", known: (p) => p.assets.total !== undefined || p.assets.liquid !== undefined },
  { key: "pillar2", known: (p) => p.pillar2.hasPensionFund !== undefined },
  {
    key: "pillar3a",
    known: (p) => p.pillar3a.balance !== undefined || p.pillar3a.annualContribution !== undefined,
  },
];

function completenessOf(profile: LifeSituation): number {
  return Math.round((FACTS.filter((f) => f.known(profile)).length / FACTS.length) * 100);
}

function scenarios(customerId: string, profile: LifeSituation): PictureScenario[] {
  const result: PictureScenario[] = [];
  const retirement = latestCalculation(customerId, PICTURE_CALCULATIONS.retirement);
  if (retirement?.output) {
    result.push({
      kind: "retirement",
      person: 1,
      partnerName: null,
      breakdown: retirementBreakdown(retirement.output as RetirementResponse),
      calculatedAt: retirement.createdAt.getTime(),
    });
  }
  const risk = latestCalculation(customerId, PICTURE_CALCULATIONS.risk);
  if (!risk) return result;
  const summaries =
    (risk.output as { RiskScenarioSummaries?: RiskScenarioSummary[] } | null)
      ?.RiskScenarioSummaries ?? [];
  for (const scenario of householdRiskScenarios(summaries)) {
    result.push({
      kind: scenario.event,
      person: scenario.person,
      partnerName: scenario.person === 2 ? (profile.partner?.firstName ?? null) : null,
      breakdown: scenario.breakdown,
      calculatedAt: risk.createdAt.getTime(),
    });
  }
  return result;
}

export function buildVorsorgebild(customerId: string): VorsorgebildModel {
  const profile = getProfile(customerId);
  const policies = db
    .select({ id: schema.policies.id })
    .from(schema.policies)
    .where(
      and(
        eq(schema.policies.customerId, customerId),
        eq(schema.policies.status, "active"),
        inArray(schema.policies.category, THIRD_PILLAR_CATEGORIES as PolicyCategory[]),
      ),
    )
    .all();
  const own = profile.person.grossIncome;
  const partner = isJointlyTaxed(profile) ? profile.partner?.grossIncome : undefined;
  return {
    firstName: profile.person.firstName ?? null,
    completeness: completenessOf(profile),
    facts: FACTS.map((f) => ({ key: f.key, known: f.known(profile) })),
    missing: missingForPicture(profile),
    pending: outdatedChecks(customerId, profile).length > 0,
    scenarios: scenarios(customerId, profile),
    pillars: {
      incomeToday: own === undefined && partner === undefined ? null : (own ?? 0) + (partner ?? 0),
      hasPensionFund: profile.pillar2.hasPensionFund ?? null,
      pensionCapital: profile.pillar2.currentCapital ?? null,
      pillar3aBalance: profile.pillar3a.balance ?? null,
      pillar3aContribution: profile.pillar3a.annualContribution ?? null,
      policies: policies.length,
    },
  };
}

import "server-only";
import type { LifeSituation } from "@/lib/domain/profile";
import { THIRD_PILLAR_CATEGORIES } from "@/lib/domain/taxonomy";
import { getProfile } from "@/lib/profile/service";
import { currentYear } from "./logismata/checks";
import { latestCalculation } from "./logismata/latest";
import {
  hasPartner,
  householdRiskScenarios,
  missingForPicture,
  type RetirementResponse,
  type RiskScenarioSummary,
  retirementBreakdown,
  retirementPensionsEstimated,
  riskInputEstimated,
} from "./logismata/mapping";
import { outdatedChecks, PICTURE_CALCULATIONS } from "./picture-refresh";
import { activeLifePolicies } from "./policies";
import { type CoverPolicy, policyCoverFor, withPolicyCover } from "./policy-cover";
import type { PictureScenario, VorsorgebildModel } from "./types";

/**
 * The Vorsorgebild is derived, never stored: profile + the latest real (non-scenario)
 * retirement and risk calculations of the customer, with the death and disability policies of
 * the person a scenario is about counted on top of the risk figures.
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

function scenarios(
  customerId: string,
  profile: LifeSituation,
  policies: CoverPolicy[],
): PictureScenario[] {
  const result: PictureScenario[] = [];
  const retirement = latestCalculation(customerId, PICTURE_CALCULATIONS.retirement);
  if (retirement?.output) {
    result.push({
      kind: "retirement",
      person: 1,
      partnerName: null,
      personName: null,
      breakdown: retirementBreakdown(retirement.output as RetirementResponse),
      calculatedAt: retirement.createdAt.getTime(),
      policyCover: null,
      estimated: retirementPensionsEstimated(profile),
      survivor: null,
    });
  }
  const risk = latestCalculation(customerId, PICTURE_CALCULATIONS.risk);
  if (!risk) return result;
  const summaries =
    (risk.output as { RiskScenarioSummaries?: RiskScenarioSummary[] } | null)
      ?.RiskScenarioSummaries ?? [];
  const year = currentYear();
  const covers = policyCoverFor(policies, profile, year);
  const estimated = riskInputEstimated(risk.input, profile);
  const couple = hasPartner(profile) && profile.partner !== undefined;
  for (const scenario of householdRiskScenarios(summaries)) {
    const cover = covers.find((c) => c.person === scenario.person);
    const insured = scenario.person === 1 ? profile.person : profile.partner;
    const survivor = scenario.person === 1 ? profile.partner : profile.person;
    const breakdown = withPolicyCover(scenario.breakdown, scenario.event, cover, insured, year);
    result.push({
      kind: scenario.event,
      person: scenario.person,
      partnerName: scenario.person === 2 ? (profile.partner?.firstName ?? null) : null,
      personName: insured?.firstName ?? null,
      breakdown,
      calculatedAt: risk.createdAt.getTime(),
      policyCover: breakdown.policies > 0 ? (cover ?? null) : null,
      estimated,
      survivor:
        scenario.event === "death" && couple && (survivor?.grossIncome ?? 0) > 0
          ? { name: survivor?.firstName ?? null, income: survivor?.grossIncome ?? 0 }
          : null,
    });
  }
  return result;
}

export function buildVorsorgebild(customerId: string): VorsorgebildModel {
  const profile = getProfile(customerId);
  const policies = activeLifePolicies(customerId);
  const own = profile.person.grossIncome;
  // Same household as the retirement calculation, so the pre-calculation need matches it.
  const partner = hasPartner(profile) ? profile.partner?.grossIncome : undefined;
  return {
    firstName: profile.person.firstName ?? null,
    completeness: completenessOf(profile),
    facts: FACTS.map((f) => ({ key: f.key, known: f.known(profile) })),
    missing: missingForPicture(profile),
    pending: outdatedChecks(customerId, profile).length > 0,
    scenarios: scenarios(customerId, profile, policies),
    pillars: {
      incomeToday: own === undefined && partner === undefined ? null : (own ?? 0) + (partner ?? 0),
      hasPensionFund: profile.pillar2.hasPensionFund ?? null,
      pensionCapital: profile.pillar2.currentCapital ?? null,
      pillar3aBalance: profile.pillar3a.balance ?? null,
      pillar3aContribution: profile.pillar3a.annualContribution ?? null,
      // A pension certificate is a 2nd-pillar entry, never a 3rd-pillar policy.
      policies: policies.filter((p) => THIRD_PILLAR_CATEGORIES.includes(p.category)).length,
    },
  };
}

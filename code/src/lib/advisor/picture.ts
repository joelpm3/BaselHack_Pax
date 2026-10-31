import "server-only";
import type { LifeSituation } from "@/lib/domain/profile";
import { getProfile } from "@/lib/profile/service";
import { latestCalculation } from "./calculations";
import { currentYear } from "./logismata/checks";
import {
  describeRiskScenario,
  isJointlyTaxed,
  type RetirementResponse,
  type RiskScenarioSummary,
  retirementBreakdown,
  riskBreakdown,
} from "./logismata/mapping";
import { activeLifePolicies } from "./policies";
import { type CoverPolicy, policyCoverFor, withPolicyCover } from "./policy-cover";
import type { PictureScenario, VorsorgebildModel } from "./types";

/**
 * The Vorsorgebild is derived, never stored: profile + the latest real (non-scenario)
 * retirement and risk calculations of the customer, with the customer's own death and
 * disability policies counted on top of the risk figures.
 */

const FACTS: Array<{ key: string; known: (p: LifeSituation) => boolean }> = [
  { key: "age", known: (p) => p.person.birthYear !== undefined },
  { key: "family", known: (p) => p.person.maritalStatus !== undefined },
  { key: "work", known: (p) => p.person.employment !== undefined },
  { key: "income", known: (p) => p.person.grossIncome !== undefined },
  { key: "residence", known: (p) => p.residence.taxLocationId !== undefined },
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
  const retirement = latestCalculation(customerId, "APICalc_calculateRetirement");
  if (retirement?.output) {
    result.push({
      kind: "retirement",
      breakdown: retirementBreakdown(retirement.output as RetirementResponse),
      calculatedAt: retirement.createdAt.getTime(),
      policyCover: null,
    });
  }
  const risk = latestCalculation(customerId, "APICalc_calculateRisk");
  const summaries =
    (risk?.output as { RiskScenarioSummaries?: RiskScenarioSummary[] } | null)
      ?.RiskScenarioSummaries ?? [];
  const year = currentYear();
  const cover = policyCoverFor(policies, profile, year).find((c) => c.person === 1);
  for (const summary of summaries) {
    const scenario = describeRiskScenario(summary.Scenario ?? 0);
    if (!risk || scenario?.person !== 1 || scenario.cause !== "illness") continue;
    const breakdown = withPolicyCover(
      riskBreakdown(summary),
      scenario.event,
      cover,
      profile.person,
      year,
    );
    result.push({
      kind: scenario.event,
      breakdown,
      calculatedAt: risk.createdAt.getTime(),
      policyCover: breakdown.policies > 0 ? (cover ?? null) : null,
    });
  }
  return result;
}

export function buildVorsorgebild(customerId: string): VorsorgebildModel {
  const profile = getProfile(customerId);
  const policies = activeLifePolicies(customerId);
  const own = profile.person.grossIncome;
  const partner = isJointlyTaxed(profile) ? profile.partner?.grossIncome : undefined;
  return {
    firstName: profile.person.firstName ?? null,
    completeness: completenessOf(profile),
    facts: FACTS.map((f) => ({ key: f.key, known: f.known(profile) })),
    scenarios: scenarios(customerId, profile, policies),
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

import "server-only";
import type { LifeSituation } from "@/lib/domain/profile";
import { latestCalculation } from "./logismata/latest";
import { type RiskScenarioSummary, riskPersons, riskRequestMatches } from "./logismata/mapping";
import { applyPolicyCover, type CoverPolicy, policyCoverFor } from "./policy-cover";
import type { PolicyCover, RiskPersonResult } from "./types";

export interface StoredRiskResult {
  calculationId: string;
  calculatedAt: Date;
  /** As in the risk card: Logismata's figures plus the household's own policies. */
  persons: RiskPersonResult[];
  policyCover: PolicyCover[];
}

/** The latest risk check, if it was calculated for the profile as it is now. */
export function currentRiskResult(
  customerId: string,
  profile: LifeSituation,
  policies: CoverPolicy[],
): StoredRiskResult | null {
  const risk = latestCalculation(customerId, "APICalc_calculateRisk");
  if (!risk) return null;
  const year = risk.createdAt.getFullYear();
  if (!riskRequestMatches(risk.input, profile, year)) return null;
  const summaries =
    (risk.output as { RiskScenarioSummaries?: RiskScenarioSummary[] } | null)
      ?.RiskScenarioSummaries ?? [];
  const policyCover = policyCoverFor(policies, profile, year);
  return {
    calculationId: risk.id,
    calculatedAt: risk.createdAt,
    persons: applyPolicyCover(riskPersons(summaries, profile), policyCover, profile, year),
    policyCover,
  };
}

import "server-only";
import { and, desc, eq, isNull, notLike, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { LifeSituation } from "@/lib/domain/profile";
import { SCENARIO_SUFFIX } from "./logismata/checks";
import { type RiskScenarioSummary, riskPersons, riskRequestMatches } from "./logismata/mapping";
import { applyPolicyCover, type CoverPolicy, policyCoverFor } from "./policy-cover";
import type { PolicyCover, RiskPersonResult } from "./types";

/** The customer's latest successful real (non-scenario) Logismata calculation of one kind. */
export function latestCalculation(customerId: string, operation: string) {
  return db
    .select()
    .from(schema.calculations)
    .where(
      and(
        eq(schema.calculations.customerId, customerId),
        eq(schema.calculations.operation, operation),
        eq(schema.calculations.status, "ok"),
        or(
          isNull(schema.calculations.toolCallId),
          notLike(schema.calculations.toolCallId, `%${SCENARIO_SUFFIX}`),
        ),
      ),
    )
    .orderBy(desc(schema.calculations.createdAt))
    .limit(1)
    .get();
}

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

import type { LifeSituation } from "@/lib/domain/profile";
import { missingFor } from "./logismata/mapping";

/**
 * What the advisor still needs before it shows the analyses. Products come last: the advisor
 * first gets to know the customer, including the cover they already have, so the risk card
 * never shows a gap that an existing policy already closes.
 *
 * - `missing`: required. The calculation inputs, plus the question about existing private
 *   death/disability cover (unless such policies are on file). The risk analysis refuses to
 *   run while it is open.
 * - `askFirst`: worth one question each before the first analysis (savings, spending, 3a),
 *   skipped when the customer declines or wants the numbers right away.
 */

export interface AnalysisReadiness {
  missing: string[];
  askFirst: string[];
}

export interface ReadinessFacts {
  /** Active death or disability policies on file (Pax or other insurers). */
  hasRiskPolicies: boolean;
}

/** True once the advisor knows whether the household has private death/disability cover. */
export function privateCoverKnown(profile: LifeSituation, facts: ReadinessFacts): boolean {
  return profile.privateCover !== undefined || facts.hasRiskPolicies;
}

export function analysisReadiness(
  profile: LifeSituation,
  facts: ReadinessFacts,
): AnalysisReadiness {
  const missing = [...new Set([...missingFor(profile, "risk"), ...missingFor(profile, "tax")])];
  if (!privateCoverKnown(profile, facts)) missing.push("privateCover");
  const askFirst: string[] = [];
  const { assets, pillar3a } = profile;
  if (assets.total === undefined && assets.liquid === undefined && assets.securities === undefined)
    askFirst.push("assets.liquid");
  if (pillar3a.balance === undefined && pillar3a.annualContribution === undefined)
    askFirst.push("pillar3a");
  if (profile.monthlySpending === undefined) askFirst.push("monthlySpending");
  return { missing, askFirst };
}

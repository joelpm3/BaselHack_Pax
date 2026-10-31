import { advanceStage, type FunnelStage } from "@/lib/domain/taxonomy";

/**
 * Which funnel stage a completed turn reaches. Stages only move forward (advanceStage); the
 * sales tools from the pricing area map onto the later stages.
 */

const TOOL_STAGES: Record<string, FunnelStage> = {
  showPensionOverview: "analysis_shown",
  showRiskAnalysis: "analysis_shown",
  calculateTaxSavings: "analysis_shown",
  calculateCapitalPayoutTax: "analysis_shown",
  simulateScenario: "scenario_explored",
  calculateSavingsPlan: "scenario_explored",
  recommendProducts: "recommendation_shown",
  startSuitabilityCheck: "recommendation_shown",
  prepareOffer: "offer_viewed",
};

/** Profile completeness from which the situation counts as captured. */
export const SITUATION_CAPTURED_AT = 70;

export interface TurnFacts {
  /** Names of tools that returned a result in this turn. */
  completedTools: string[];
  completeness: number;
  /** The customer wrote at least one message in this conversation. */
  hasUserMessage: boolean;
}

export function stageAfterTurn(current: FunnelStage, facts: TurnFacts): FunnelStage {
  let stage = current;
  if (facts.hasUserMessage) stage = advanceStage(stage, "getting_to_know");
  if (facts.completeness >= SITUATION_CAPTURED_AT)
    stage = advanceStage(stage, "situation_captured");
  for (const tool of facts.completedTools) {
    const next = TOOL_STAGES[tool];
    if (next) stage = advanceStage(stage, next);
  }
  return stage;
}

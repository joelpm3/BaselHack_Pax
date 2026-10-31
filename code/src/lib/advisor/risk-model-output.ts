import type { JSONValue } from "ai";
import type { IncomeBreakdown, RiskAnalysisOutput } from "./types";

/**
 * What the advisor model reads from showRiskAnalysis. The widget gets yearly breakdowns; the
 * model gets the figures the card shows (monthly, with the card's own covered/gap verdict), so
 * its text cannot contradict the card. The cumulative gap stays available, clearly named.
 */

export const RISK_READING_GUIDE =
  "Amounts are CHF per month today, exactly as the risk card shows them. card is the card's " +
  "verdict and gapPerMonth the gap to quote. cumulativeGapUntilRetirement adds up all yearly " +
  "gaps until retirement, including later years (e.g. once child pensions end): only mention " +
  "it named as such, never as 'the gap'; when card is 'covered' say it is covered today and " +
  "a gap opens later. policies already includes the household's own policies.";

const perMonth = (annual: number | undefined) => Math.round((annual || 0) / 12);

/** The card's verdict, as BreakdownRow derives it. */
export function cardVerdict(b: IncomeBreakdown): "no_need" | "gap" | "covered" {
  if (b.need === 0) return "no_need";
  return perMonth(b.gap) > 0 ? "gap" : "covered";
}

function scenarioForModel(b: IncomeBreakdown) {
  return {
    card: cardVerdict(b),
    needPerMonth: perMonth(b.need),
    gapPerMonth: perMonth(b.gap),
    incomePerMonth: {
      ahvIv: perMonth(b.pillar1),
      pensionFundUvg: perMonth(b.pillar2),
      policies: perMonth(b.policies),
      partner: perMonth(b.partner),
      total: perMonth(b.total),
    },
    cumulativeGapUntilRetirement: Math.round(b.capitalGap || 0),
  };
}

export function riskResultForModel(output: RiskAnalysisOutput): JSONValue {
  if (output.status !== "ok") return output;
  return {
    status: "ok",
    readingGuide: RISK_READING_GUIDE,
    persons: output.persons.map((p) => ({
      person: p.person,
      firstName: p.firstName,
      retired: p.retired,
      scenarios: p.scenarios.map((s) => ({
        event: s.event,
        cause: s.cause,
        ...scenarioForModel(s.breakdown),
      })),
    })),
    policyCover: (output.policyCover ?? []).map((c) => ({
      person: c.person,
      deathCapital: c.deathCapital,
      deathCapitalSpreadOverYears: c.supportYears,
      deathCapitalPerMonth: perMonth(c.deathCapital / c.supportYears),
      survivorsPensionPerMonth: perMonth(c.deathAnnuity),
      disabilityPensionPerMonth: perMonth(c.disabilityAnnuity),
    })),
    dependentChildren: output.dependentChildren,
    assumptions: { ...output.assumptions },
  };
}

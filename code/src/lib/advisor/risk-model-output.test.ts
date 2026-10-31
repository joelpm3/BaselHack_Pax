import { describe, expect, it } from "vitest";
import { emptyBreakdown } from "./logismata/mapping";
import { cardVerdict, riskResultForModel } from "./risk-model-output";
import type { IncomeBreakdown, RiskAnalysisOutput } from "./types";

const breakdown = (values: Partial<IncomeBreakdown>): IncomeBreakdown => ({
  ...emptyBreakdown(),
  ...values,
});

describe("cardVerdict", () => {
  it("matches what the risk card shows", () => {
    expect(cardVerdict(breakdown({ need: 0 }))).toBe("no_need");
    expect(cardVerdict(breakdown({ need: 80000, gap: 5 }))).toBe("covered");
    expect(cardVerdict(breakdown({ need: 80000, gap: 2400 }))).toBe("gap");
  });
});

describe("riskResultForModel", () => {
  it("gives monthly figures and keeps the cumulative gap apart (Jane: covered today)", () => {
    const output: RiskAnalysisOutput = {
      status: "ok",
      dependentChildren: 1,
      policyCover: [
        {
          person: 2,
          deathCapital: 150000,
          deathAnnuity: 0,
          disabilityAnnuity: 0,
          supportYears: 25,
          supportPeriod: "until_youngest_child_25",
        },
      ],
      assumptions: {
        needPercent: 80,
        deathNeedPercent: 70,
        interestRate: 1,
        pillar2Estimated: true,
      },
      persons: [
        {
          person: 2,
          firstName: "May",
          retired: false,
          scenarios: [
            {
              event: "disability",
              cause: "illness",
              breakdown: breakdown({
                need: 80000,
                pillar1: 50000,
                pillar2: 31000,
                total: 81000,
                surplus: 1000,
                capitalGap: 210000,
              }),
            },
          ],
        },
      ],
    };
    expect(riskResultForModel(output)).toMatchObject({
      persons: [
        {
          firstName: "May",
          scenarios: [
            {
              event: "disability",
              card: "covered",
              gapPerMonth: 0,
              needPerMonth: 6667,
              incomePerMonth: { ahvIv: 4167, pensionFundUvg: 2583, total: 6750 },
              cumulativeGapUntilRetirement: 210000,
            },
          ],
        },
      ],
      policyCover: [{ person: 2, deathCapitalSpreadOverYears: 25, deathCapitalPerMonth: 500 }],
    });
  });

  it("passes missing facts through", () => {
    const missing: RiskAnalysisOutput = { status: "missing", missing: ["person.birthYear"] };
    expect(riskResultForModel(missing)).toEqual(missing);
  });
});

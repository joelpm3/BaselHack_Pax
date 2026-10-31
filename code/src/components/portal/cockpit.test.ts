import { describe, expect, it } from "vitest";
import { lifeSituationSchema } from "@/lib/domain/profile";
import {
  adviceEntries,
  calculatedFigures,
  groupOf,
  keyFigures,
  type PolicyRow,
  upcomingDates,
  visiblePolicies,
} from "./cockpit";

let n = 0;
function row(overrides: Partial<PolicyRow>): PolicyRow {
  n += 1;
  return {
    id: `p${n}`,
    customerId: "c",
    policyNumber: null,
    insurer: "Pax",
    isExternal: false,
    category: "risk_death",
    productCode: null,
    productName: `Policy ${n}`,
    pillar: null,
    status: "active",
    startDate: null,
    endDate: null,
    noticeDate: null,
    premiumAnnual: null,
    sumInsured: null,
    annuityAnnual: null,
    insuredPerson: null,
    details: null,
    source: "seed",
    documentId: null,
    applicationId: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

const profile = lifeSituationSchema.parse({});

describe("cockpit", () => {
  it("groups policies by pillar", () => {
    expect(groupOf({ category: "pension_fund", pillar: null })).toBe("pillar2");
    expect(groupOf({ category: "pillar3a", pillar: null })).toBe("pillar3a");
    expect(groupOf({ category: "risk_death", pillar: "3a" })).toBe("pillar3a");
    expect(groupOf({ category: "risk_death", pillar: "3b" })).toBe("pillar3b");
    expect(groupOf({ category: "nonlife_household", pillar: null })).toBe("other");
  });

  it("sums premiums and cover of active contracts", () => {
    const policies = [
      row({ premiumAnnual: 1384.8, sumInsured: 150000 }),
      row({ isExternal: true, premiumAnnual: 2640, sumInsured: 200000 }),
      row({ category: "risk_disability", premiumAnnual: 700, annuityAnnual: 12000 }),
      row({
        category: "pension_fund",
        isExternal: true,
        annuityAnnual: 32934,
        details: { deathLumpSum: 50000, disabilityPension: 29420, retirementAge: 65 },
      }),
      row({ status: "ended", premiumAnnual: 999, sumInsured: 1 }),
    ];
    expect(keyFigures(policies, profile)).toEqual({
      premiums: 4724.8,
      paxPremiums: 2084.8,
      death: { kind: "capital", value: 400000, note: "allContracts" },
      disability: { value: 41420, note: "perYear" },
      retirement: { value: 32934, note: "perYear", age: 65 },
      contracts: 4,
      estimated: false,
    });
  });

  it("falls back to the profile and then to the advice calculations", () => {
    const fromChat = lifeSituationSchema.parse({
      pillar2: { hasPensionFund: true, currentCapital: 80000 },
    });
    const calculated = calculatedFigures({
      retirementBase: { Person1: { Pension: 37044 } },
      risk: {
        RiskScenarioSummaries: [
          { Scenario: 1, ErrorCode: 0, IncomePillar1: 29268, IncomePillar2: 18000 },
          { Scenario: 3, ErrorCode: 0, IncomePillar1: 0, IncomePillar2: 0 },
          { Scenario: 5, ErrorCode: 0, IncomePillar1: 1, IncomePillar2: 1 },
        ],
      },
    });
    expect(calculated).toEqual({
      retirementPension: 37044,
      disabilityPension: 47268,
      survivorsPension: 0,
    });
    const figures = keyFigures(
      [row({ category: "risk_disability", annuityAnnual: 12000 })],
      {
        ...fromChat,
        pillar2: { ...fromChat.pillar2, deathLumpSum: 120000 },
      },
      calculated,
    );
    expect(figures.death).toEqual({ kind: "capital", value: 120000, note: "fromProfile" });
    expect(figures.disability).toEqual({ value: 59268, note: "estimatedWithState" });
    expect(figures.retirement).toEqual({ value: 37044, note: "estimated", age: 65 });
    expect(figures.estimated).toBe(true);

    const survivors = keyFigures([], fromChat, calculated);
    expect(survivors.death).toEqual({ kind: "survivorsPension", value: 0, note: "estimated" });
    expect(keyFigures([], profile).death).toBeNull();
  });

  it("knows when there is no pension fund and ignores retired risk figures", () => {
    const noFund = lifeSituationSchema.parse({ pillar2: { hasPensionFund: false } });
    expect(keyFigures([], noFund, { retirementPension: 1000 }).retirement).toEqual({
      value: 0,
      note: "noPensionFund",
      age: 65,
    });
    expect(
      calculatedFigures({ risk: { RiskScenarioSummaries: [{ Scenario: 1, ErrorCode: 8 }] } }),
    ).toEqual({});
  });

  it("shows pillars known from the advice when no contract covers them", () => {
    const fromChat = lifeSituationSchema.parse({
      pillar2: { hasPensionFund: true, currentCapital: 80000 },
      pillar3a: { annualContribution: 7258 },
    });
    expect(adviceEntries([], fromChat)).toEqual({
      pillar2: { kind: "pensionFundCapital", amount: 80000 },
      pillar3: { kind: "pillar3aContribution", amount: 7258 },
    });
    const covered = [row({ category: "pension_fund" }), row({ category: "pillar3a" })];
    expect(adviceEntries(covered, fromChat)).toEqual({ pillar2: null, pillar3: null });
    const noFund = lifeSituationSchema.parse({ pillar2: { hasPensionFund: false } });
    expect(adviceEntries([], noFund).pillar2).toEqual({ kind: "noPensionFund" });
  });

  it("lists upcoming deadlines soonest first and hides cancelled contracts", () => {
    const a = row({ noticeDate: "2027-01-31", endDate: "2049-04-30" });
    const b = row({ endDate: "2027-03-31" });
    const c = row({ noticeDate: "2026-01-01" });
    expect(upcomingDates([a, b, c], "2026-10-30").map((d) => [d.policyId, d.kind])).toEqual([
      [a.id, "notice"],
      [b.id, "end"],
    ]);
    expect(visiblePolicies([row({ status: "cancelled" }), a]).map((p) => p.id)).toEqual([a.id]);
  });
});

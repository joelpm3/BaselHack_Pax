import { describe, expect, it } from "vitest";
import { lifeSituationSchema } from "@/lib/domain/profile";
import { groupOf, keyFigures, type PolicyRow, upcomingDates, visiblePolicies } from "./cockpit";

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
      deathCover: 400000,
      disabilityPension: 41420,
      retirementPension: 32934,
      retirementAge: 65,
      contracts: 4,
    });
  });

  it("never shows the partner's pension-fund benefits as the customer's own", () => {
    const mueller = lifeSituationSchema.parse({
      person: { firstName: "Jane" },
      partner: { firstName: "May" },
      pillar2: { hasPensionFund: false },
    });
    const figures = keyFigures(
      [
        row({
          category: "pension_fund",
          isExternal: true,
          annuityAnnual: 32934,
          insuredPerson: "May Müller",
          details: { subject: "partner", deathLumpSum: 50000, disabilityPension: 29416 },
        }),
      ],
      mueller,
    );
    expect(figures).toMatchObject({ deathCover: 0, disabilityPension: 0, retirementPension: 0 });
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

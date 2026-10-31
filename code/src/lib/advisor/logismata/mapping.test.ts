import { describe, expect, it } from "vitest";
import { type LifeSituation, lifeSituationSchema } from "@/lib/domain/profile";
import {
  buildPurchaseP2Request,
  buildRetirementRequest,
  buildRiskRequest,
  buildSaving3aRequest,
  currentFortune,
  DEATH_NEED_PERCENT,
  dependentChildren,
  describeRiskScenario,
  householdIncome,
  max3a,
  mergeRiskPensions,
  missingFor,
  NEED_PERCENT,
  relationshipCode,
  relationshipSinceYear,
  retirementBreakdown,
  riskBreakdown,
  riskPersons,
  riskRequestMatches,
  withBvg,
  yearsUntilRetirement,
} from "./mapping";

const YEAR = 2026;

function profile(data: unknown): LifeSituation {
  return lifeSituationSchema.parse(data);
}

const single = profile({
  person: {
    birthYear: 1995,
    sex: "male",
    maritalStatus: "single",
    employment: "employed",
    grossIncome: 100000,
  },
  residence: { zip: "8004", taxLocationId: 800400000 },
  assets: { total: 50000 },
  pillar3a: { balance: 45000, annualContribution: 7258 },
});

const youngFamily = profile({
  person: {
    birthYear: 1986,
    sex: "female",
    maritalStatus: "married",
    employment: "homemaker",
  },
  partner: { birthYear: 1984, sex: "male", employment: "employed", grossIncome: 100000 },
  children: [{ birthYear: 2026 }, { birthYear: 2000 }],
  residence: { taxLocationId: 405300000 },
});

describe("relationship", () => {
  it("maps marital status to Logismata codes", () => {
    expect(relationshipCode(single)).toBe(1);
    expect(relationshipCode(youngFamily)).toBe(2);
    expect(relationshipCode(profile({ person: { maritalStatus: "cohabiting" } }))).toBe(3);
    expect(relationshipCode(profile({ person: { maritalStatus: "divorced" } }))).toBe(1);
  });

  it("assumes a five-year relationship, never before adulthood or the future", () => {
    expect(relationshipSinceYear(youngFamily, YEAR)).toBe(2021);
    const young = profile({ person: { birthYear: 2006 }, partner: { birthYear: 2010 } });
    expect(relationshipSinceYear(young, YEAR)).toBe(YEAR);
  });
});

describe("derived values", () => {
  it("counts only children still entitled to an orphan's pension", () => {
    expect(dependentChildren(youngFamily, YEAR)).toBe(1);
  });

  it("assumes a pension fund for employees above the BVG threshold", () => {
    expect(withBvg(single.person)).toBe(true);
    expect(withBvg({ employment: "employed", grossIncome: 15000 })).toBe(false);
    expect(withBvg({ employment: "self_employed", grossIncome: 150000 })).toBe(false);
    expect(withBvg(single.person, false)).toBe(false);
  });

  it("adds the 3a balance to the fortune", () => {
    expect(currentFortune(single)).toBe(95000);
  });

  it("taxes married couples jointly", () => {
    expect(householdIncome(youngFamily)).toBe(100000);
    expect(householdIncome(single)).toBe(100000);
  });

  it("knows the 3a maximum with and without a pension fund", () => {
    expect(max3a(single)).toBe(7258);
    const selfEmployed = profile({ person: { employment: "self_employed", grossIncome: 80000 } });
    expect(max3a(selfEmployed)).toBe(16000);
  });

  it("never returns less than one year to retirement", () => {
    expect(yearsUntilRetirement(single, YEAR)).toBe(34);
    expect(yearsUntilRetirement(profile({ person: { birthYear: 1960 } }), YEAR)).toBe(1);
  });
});

describe("missingFor", () => {
  it("is empty for a complete single profile", () => {
    expect(missingFor(single, "retirement")).toEqual([]);
    expect(missingFor(single, "tax")).toEqual([]);
  });

  it("treats homemakers as having no income instead of a missing one", () => {
    expect(missingFor(youngFamily, "risk")).toEqual([]);
  });

  it("asks for the partner and the place of residence when needed", () => {
    const p = profile({
      person: { birthYear: 1990, sex: "female", maritalStatus: "married", grossIncome: 80000 },
    });
    expect(missingFor(p, "risk")).toEqual([
      "partner.birthYear",
      "partner.sex",
      "partner.grossIncome",
    ]);
    expect(missingFor(p, "tax")).toEqual(["partner.grossIncome", "residence.zip"]);
  });
});

describe("requests", () => {
  it("builds a retirement request with the 80% need and the 3a saving", () => {
    const request = buildRetirementRequest(single, YEAR, { person1: 30000 });
    expect(request).toMatchObject({
      Relationship: 1,
      Person1: {
        Sex: 1,
        BirthYear: 1995,
        GrossIncome: 100000,
        WithBVG: true,
        RetirementPillar2: { Pension: 30000 },
      },
      CurrentFortune: 95000,
      Saving: 7258,
      NeedInPcRetirement: true,
      NeedRetirement: NEED_PERCENT,
    });
    expect(request).not.toHaveProperty("Person2");
  });

  it("applies scenario overrides to the retirement request", () => {
    const request = buildRetirementRequest(
      single,
      YEAR,
      { person1: 30000 },
      { retirementAge: 62, fortuneDelta: -100000, saving: 3000 },
    );
    expect(request).toMatchObject({
      Person1: { DesiredRetirementAge: 62 },
      CurrentFortune: 0,
      Saving: 3000,
    });
  });

  it("puts joint children on the household and adds the partner", () => {
    const request = buildRiskRequest(youngFamily, YEAR);
    expect(request).toMatchObject({
      Relationship: 2,
      NumberOfChildren: 1,
      WithChildren: true,
      Person1: { Sex: 2, GrossIncome: 0, WithBVG: false, NumberOfChildren: 0 },
      Person2: { Sex: 1, GrossIncome: 100000, WithBVG: true, NeedDeath: DEATH_NEED_PERCENT },
    });
  });

  it("sets no survivors' need for a single person without children", () => {
    const request = buildRiskRequest(single, YEAR);
    expect(request).toMatchObject({
      NumberOfChildren: 0,
      WithChildren: false,
      Person1: { NumberOfChildren: 0, NeedDeath: 0, NeedDisability: NEED_PERCENT },
    });
    expect(buildRiskRequest(single, YEAR, { extraChildren: 1 })).toMatchObject({
      Person1: { NumberOfChildren: 1, NeedDeath: DEATH_NEED_PERCENT },
      WithChildren: true,
    });
  });

  it("reuses a stored risk request only while it still describes the profile", () => {
    const stored = JSON.parse(JSON.stringify(buildRiskRequest(youngFamily, YEAR)));
    expect(riskRequestMatches(stored, youngFamily, YEAR)).toBe(true);
    // Unrelated facts do not matter; income, children and family do.
    expect(riskRequestMatches(stored, { ...youngFamily, goals: ["buy_home"] }, YEAR)).toBe(true);
    const raise = profile({ ...youngFamily, partner: { ...youngFamily.partner, grossIncome: 1 } });
    expect(riskRequestMatches(stored, raise, YEAR)).toBe(false);
    const baby = { ...youngFamily, children: [...youngFamily.children, { birthYear: 2026 }] };
    expect(riskRequestMatches(stored, baby, YEAR)).toBe(false);
    expect(riskRequestMatches(null, youngFamily, YEAR)).toBe(false);
  });

  it("checks stored pillar 2 pensions against the certificate on file", () => {
    const known = profile({ ...single, pillar2: { disabilityPension: 30000 } });
    const pensions = { Disability: 30000, DisabilityChildren: 4000, Widow: 12000, Orphan: 4000 };
    const stored = JSON.parse(
      JSON.stringify(buildRiskRequest(known, YEAR, { pillar2Pensions: pensions })),
    );
    expect(riskRequestMatches(stored, known, YEAR)).toBe(true);
    const newCertificate = profile({ ...single, pillar2: { disabilityPension: 32000 } });
    expect(riskRequestMatches(stored, newCertificate, YEAR)).toBe(false);
    expect(riskRequestMatches(stored, single, YEAR)).toBe(false);
  });

  it("only sends pillar 2 pensions when known", () => {
    expect(buildRiskRequest(single, YEAR).Person1).not.toHaveProperty("Pillar2Pensions");
    const known = profile({ ...single, pillar2: { disabilityPension: 30000 } });
    const merged = mergeRiskPensions(known, {
      Disability: 20000,
      DisabilityChildren: 4000,
      Widow: 12000,
      Orphan: 4000,
    });
    expect(merged).toEqual({
      Disability: 30000,
      DisabilityChildren: 4000,
      Widow: 12000,
      Orphan: 4000,
    });
  });

  it("builds tax requests from the household and the tax location", () => {
    expect(buildSaving3aRequest(single, YEAR, { yearlyAmount: 7258 })).toMatchObject({
      Duration: 34,
      InitialInvestment: 45000,
      YearlyInvestment: 7258,
      IncomeType: 1,
      Income: 100000,
      TaxLocationID: 800400000,
      Confession1: 4,
    });
    expect(buildPurchaseP2Request(single, YEAR, { amount: 20000, years: 0 })).toMatchObject({
      Investment: 20000,
      PaymentDuration: 1,
    });
  });
});

describe("responses", () => {
  it("maps retirement and risk results to breakdowns", () => {
    const retirement = retirementBreakdown({
      GrossIncome: 120000,
      IncomeNeed: 96000,
      IncomeGap: 0,
      IncomeTotal: 100000,
      IncomePillar1: 32760,
      IncomePillar2: 40000,
      IncomeWithdrawal: 27240,
    });
    expect(retirement).toMatchObject({ need: 96000, other: 27240, surplus: 4000 });
    const risk = riskBreakdown({ IncomeNeed: 76000, IncomeGap: 27134, IncomePartner: 1000 });
    expect(risk).toMatchObject({ need: 76000, gap: 27134, partner: 1000, pillar1: 0 });
  });

  it("groups risk scenarios by person and marks retired persons", () => {
    const persons = riskPersons(
      [
        { Scenario: 1, IncomeNeed: 80000, IncomeGap: 1000 },
        { Scenario: 3, IncomeNeed: 70000 },
        { Scenario: 5, ErrorCode: 8 },
      ],
      youngFamily,
    );
    expect(persons).toHaveLength(2);
    expect(persons[0].scenarios.map((s) => [s.event, s.cause])).toEqual([
      ["disability", "illness"],
      ["death", "illness"],
    ]);
    expect(persons[1]).toMatchObject({ person: 2, retired: true, scenarios: [] });
  });

  it("decodes the eight risk scenarios", () => {
    expect(describeRiskScenario(1)).toEqual({ person: 1, event: "disability", cause: "illness" });
    expect(describeRiskScenario(4)).toEqual({ person: 1, event: "death", cause: "accident" });
    expect(describeRiskScenario(7)).toEqual({ person: 2, event: "death", cause: "illness" });
    expect(describeRiskScenario(9)).toBeNull();
  });
});

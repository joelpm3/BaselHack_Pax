import { describe, expect, it } from "vitest";
import {
  type InsuredFacts,
  occupationGroup,
  pillar3aRoom,
  sizeDeathCover,
  sizeDisabilityCover,
  sizeSavings,
} from "./sizing";

/** Persona "young family": Mr. Müller, born 1984, baby born 2026, partner at home. */
const family: InsuredFacts = {
  age: 42,
  currentYear: 2026,
  grossIncome: 100_000,
  employment: "employed",
  hasPartner: true,
  youngestChildBirthYear: 2026,
  hasPensionFund: true,
  retirementAge: 65,
};

describe("sizeDeathCover", () => {
  it("covers the gap until the youngest child is 25", () => {
    const cover = sizeDeathCover(20_660, family);
    expect(cover).toMatchObject({ years: 25, endAge: 67, method: "until_youngest_child_25" });
    // 20'660 × 25 = 516'500 → rounded up to 520'000
    expect(cover.sumInsured).toBe(520_000);
  });

  it("falls back to 10 years with a partner, 5 without", () => {
    const couple = { ...family, youngestChildBirthYear: undefined };
    expect(sizeDeathCover(10_000, couple)).toMatchObject({ years: 10, sumInsured: 100_000 });
    expect(sizeDeathCover(10_000, { ...couple, hasPartner: false }).years).toBe(5);
  });

  it("uses three salaries when no gap amount is known", () => {
    const cover = sizeDeathCover(null, family);
    expect(cover).toMatchObject({ sumInsured: 300_000, fromIncome: true });
  });

  it("stays within the tariff's sum range", () => {
    expect(
      sizeDeathCover(500, { ...family, youngestChildBirthYear: undefined, hasPartner: false })
        .sumInsured,
    ).toBe(10_000);
    expect(sizeDeathCover(200_000, family).sumInsured).toBe(2_000_000);
  });
});

describe("sizeDisabilityCover", () => {
  it("rounds the gap up and waits 24 months for employees, 12 for self-employed", () => {
    expect(sizeDisabilityCover(14_029, family)).toEqual({
      annualPension: 15_000,
      waitingPeriodMonths: 24,
      endAge: 65,
      aboveSumInsurance: false,
    });
    expect(sizeDisabilityCover(40_000, { ...family, employment: "self_employed" })).toMatchObject({
      waitingPeriodMonths: 12,
      aboveSumInsurance: true,
    });
  });
});

describe("occupationGroup", () => {
  it("reads the risk group from the occupation", () => {
    expect(occupationGroup("Treuhänderin")).toEqual({ group: 1, assumed: false });
    expect(occupationGroup("Kaufmännische Angestellte")).toEqual({ group: 2, assumed: false });
    expect(occupationGroup("Verkäufer im Detailhandel")).toEqual({ group: 3, assumed: false });
    expect(occupationGroup("Verkäuferin")).toEqual({ group: 3, assumed: false });
    expect(occupationGroup("Schreiner")).toEqual({ group: 4, assumed: false });
    expect(occupationGroup(undefined)).toEqual({ group: 2, assumed: true });
  });
});

describe("sizeSavings", () => {
  it("fills the 3a room for a tax gap", () => {
    expect(pillar3aRoom(family)).toBe(7258);
    expect(sizeSavings(null, true, family)).toMatchObject({
      annualPremium: 7258,
      pillar: "3a",
      endAge: 65,
    });
  });

  it("subtracts existing 3a payments and respects the budget", () => {
    const paying = { ...family, pillar3aContribution: 3000 };
    expect(sizeSavings(null, true, paying).annualPremium).toBe(4258);
    const plan = sizeSavings(23_641, false, family, 3000);
    expect(plan).toMatchObject({
      annualPremium: 3000,
      limitedByBudget: true,
      closesGapFully: false,
    });
  });

  it("switches to 3b when the 3a room is used up", () => {
    const plan = sizeSavings(10_000, false, { ...family, pillar3aContribution: 7258 });
    expect(plan.pillar).toBe("3b");
    expect(plan.annualPremium).toBeGreaterThan(1200);
  });

  it("uses 20 % of income without a pension fund", () => {
    expect(pillar3aRoom({ ...family, hasPensionFund: false })).toBe(20_000);
  });
});

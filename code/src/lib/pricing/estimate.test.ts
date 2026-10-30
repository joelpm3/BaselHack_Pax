import { describe, expect, it } from "vitest";
import { estimateQuote, fundRiskScale } from "./estimate";
import { normalizeQuoteInput } from "./normalize";
import type { QuoteInput } from "./types";

const START = "2026-11-01";
const person = { birthDate: "1987-01-01", sex: "male", smoker: false, endAge: 65 } as const;
const quote = (input: Omit<QuoteInput, keyof typeof person> & Partial<QuoteInput>) =>
  estimateQuote(normalizeQuoteInput({ ...person, ...input } as QuoteInput), START);

/** Live Quicksale results the model was fitted on (30.10.2026). */
describe("estimate model vs. live Quicksale", () => {
  it("term life matches the sample offer (113.60 gross / 111.20 net)", () => {
    const q = quote({ productCode: "todesfall", pillar: "3b", sumInsured: 10_000 });
    expect(q.premiumAnnualGross).toBeCloseTo(113.6, 0);
    expect(q.premiumAnnualNet).toBeCloseTo(111.2, 0);
    expect(q.durationYears).toBe(25);
  });

  it("term life scales with sum, age, smoking and waiver within 5 %", () => {
    const cases: Array<[Partial<QuoteInput>, number]> = [
      [{ sumInsured: 200_000 }, 656.8],
      [{ sumInsured: 200_000, birthDate: "1972-01-01" }, 1088.3],
      [{ sumInsured: 10_000, smoker: true, premiumWaiver: true }, 178.3],
      [{ sumInsured: 10_000, smoker: true, premiumWaiver: true, birthDate: "1995-01-01" }, 158.1],
    ];
    for (const [overrides, live] of cases) {
      const q = quote({ productCode: "todesfall", pillar: "3b", ...overrides });
      expect(Math.abs(q.premiumAnnualGross / live - 1)).toBeLessThan(0.05);
    }
  });

  it("disability pension matches the sample offer for occupation group 3", () => {
    const q = quote({
      productCode: "erwerbsunfaehigkeit",
      pillar: "3b",
      annualPension: 10_000,
      occupationGroup: 3,
    });
    expect(q.premiumAnnualGross).toBeCloseTo(811.5, 0);
    expect(Math.abs(q.premiumAnnualNet / 704.7 - 1)).toBeLessThan(0.01);
    expect(q.annualPension).toBe(10_000);
  });

  it("disability premiums rise with the occupation group", () => {
    const groups = ([1, 2, 3, 4] as const).map(
      (g) =>
        quote({
          productCode: "erwerbsunfaehigkeit",
          pillar: "3b",
          annualPension: 10_000,
          occupationGroup: g,
        }).premiumAnnualGross,
    );
    expect(groups).toEqual([...groups].sort((a, b) => a - b));
    expect(groups[0]).toBeCloseTo(442.6, 0);
    expect(groups[3]).toBeCloseTo(909.4, 0);
  });

  it("LifeStar 3a projections are within 10 % of Quicksale (7'258/yr, 50 % guaranteed)", () => {
    const q = quote({
      productCode: "lifestar",
      pillar: "3a",
      annualPremium: 7258,
      guaranteedSharePercent: 50,
    });
    const live = { guaranteed: 88_257.9, low: 143_363.2, medium: 219_184.1, high: 273_436.1 };
    for (const key of ["guaranteed", "low", "medium", "high"] as const) {
      expect(Math.abs((q.maturity?.[key] ?? 0) / live[key] - 1)).toBeLessThan(0.1);
    }
    expect(q.premiumAnnualGross).toBe(7258);
  });

  it("FondsStar 3a projections are within 10 % of Quicksale (5'000/yr)", () => {
    const q = quote({ productCode: "fondsstar", pillar: "3a", annualPremium: 5000 });
    const live = { low: 75_723.2, medium: 185_743.7, high: 262_815.3 };
    for (const key of ["low", "medium", "high"] as const) {
      expect(Math.abs((q.maturity?.[key] ?? 0) / live[key] - 1)).toBeLessThan(0.1);
    }
    expect(q.maturity?.guaranteed).toBeUndefined();
  });

  it("Auszahlungsplan projects annual payouts from the single premium", () => {
    const q = quote({
      productCode: "auszahlungsplan",
      pillar: "3b",
      singlePremium: 100_000,
      endAge: 85,
      birthDate: "1962-01-01",
    });
    expect(q.premiumAnnualGross).toBe(0);
    expect(q.singlePremium).toBe(100_000);
    const p = q.payoutAnnual;
    expect(p?.guaranteed).toBeGreaterThan(0);
    expect((p?.low ?? 0) < (p?.medium ?? 0) && (p?.medium ?? 0) < (p?.high ?? 0)).toBe(true);
  });

  it("lower-risk funds damp the scenarios", () => {
    expect(fundRiskScale("Pax (CH) Sustainable Portfolio 25 ALV T")).toBeLessThan(
      fundRiskScale("Pax (CH) Sustainable Portfolio 100 ALV T"),
    );
  });
});

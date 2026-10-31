import { describe, expect, it } from "vitest";
import {
  checkQuoteInput,
  contractStartDate,
  describeIssue,
  resolveStartDate,
  technicalAge,
} from "./limits";
import type { QuoteInput } from "./types";

const base: QuoteInput = {
  productCode: "todesfall",
  pillar: "3b",
  birthDate: "1987-01-01",
  sex: "male",
  smoker: false,
  endAge: 65,
  sumInsured: 10_000,
};
const START = "2026-11-01";

describe("contractStartDate", () => {
  it("is the first of the next month", () => {
    expect(contractStartDate(new Date("2026-10-30T12:00:00Z"))).toBe("2026-11-01");
    expect(contractStartDate(new Date("2026-12-15T12:00:00Z"))).toBe("2027-01-01");
  });
});

describe("resolveStartDate", () => {
  const today = new Date("2026-10-31T12:00:00Z");

  it("defaults to the first of next month and accepts later firsts up to 12 months ahead", () => {
    expect(resolveStartDate(undefined, today)).toEqual({ startDate: "2026-11-01" });
    expect(resolveStartDate("2027-01-01", today)).toEqual({ startDate: "2027-01-01" });
    expect(resolveStartDate("2027-10-01", today)).toEqual({ startDate: "2027-10-01" });
  });

  it("moves other days to the next first and refuses past or far starts", () => {
    expect(resolveStartDate("2027-01-15", today)).toEqual({
      startDate: "2027-02-01",
      problem: "not_first_of_month",
    });
    expect(resolveStartDate("2026-12-31", today)).toEqual({
      startDate: "2027-01-01",
      problem: "not_first_of_month",
    });
    expect(resolveStartDate("2026-10-01", today)).toEqual({
      startDate: "2026-11-01",
      problem: "in_the_past",
    });
    expect(resolveStartDate("2027-11-01", today).problem).toBe("too_far_ahead");
    expect(resolveStartDate("2027-12-01", today)).toEqual({
      startDate: "2026-11-01",
      problem: "too_far_ahead",
    });
    expect(resolveStartDate("1.1.2027", today).problem).toBe("invalid");
  });
});

describe("technicalAge", () => {
  it("rounds to the nearest year like Quicksale", () => {
    expect(technicalAge("1987-01-01", START)).toBe(40);
    expect(technicalAge("1995-01-01", START)).toBe(32);
    expect(technicalAge("1972-01-01", START)).toBe(55);
    expect(technicalAge("1990-06-15", START)).toBe(36);
  });
});

describe("checkQuoteInput", () => {
  it("accepts the sample offer", () => {
    expect(checkQuoteInput(base, START)).toEqual([]);
  });

  it("blocks entry ages outside the tariff sheet", () => {
    const issues = checkQuoteInput(
      {
        ...base,
        productCode: "erwerbsunfaehigkeit",
        annualPension: 12_000,
        birthDate: "1964-01-01",
      },
      START,
    );
    expect(issues.map((i) => i.code)).toContain("entry_age_above_max");
    expect(issues.every((i) => i.blocking)).toBe(true);
  });

  it("checks sum and premium ranges", () => {
    expect(checkQuoteInput({ ...base, sumInsured: 5_000 }, START)[0].code).toBe("sum_below_min");
    const savings: QuoteInput = {
      ...base,
      productCode: "lifestar",
      pillar: "3a",
      annualPremium: 900,
    };
    expect(checkQuoteInput(savings, START)[0].code).toBe("premium_below_min");
    const above = checkQuoteInput({ ...savings, annualPremium: 9_000 }, START)[0];
    expect(above).toMatchObject({ code: "premium_above_3a_max", blocking: false });
  });

  it("limits the 3a end age and the minimum duration", () => {
    expect(checkQuoteInput({ ...base, pillar: "3a", endAge: 70 }, START)[0].code).toBe(
      "end_age_out_of_range",
    );
    expect(checkQuoteInput({ ...base, endAge: 43 }, START)[0].code).toBe("duration_too_short");
  });

  it("warns, without blocking, above the disability sum-insurance limit", () => {
    const issues = checkQuoteInput(
      { ...base, productCode: "erwerbsunfaehigkeit", annualPension: 48_000 },
      START,
    );
    expect(issues).toEqual([
      {
        code: "pension_above_sum_insurance",
        blocking: false,
        params: { pension: 48_000, max: 36_000 },
      },
    ]);
    expect(describeIssue(issues[0])).toContain("36000");
  });
});

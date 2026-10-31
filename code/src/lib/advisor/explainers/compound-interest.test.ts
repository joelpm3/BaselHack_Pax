import { describe, expect, it } from "vitest";
import {
  clampCompound,
  columnYears,
  compoundColumns,
  compoundGrowth,
  compoundSummary,
  squareUnit,
} from "./compound-interest";

describe("compoundGrowth", () => {
  it("only adds deposits at 0%", () => {
    const s = compoundSummary({ startAmount: 1000, monthlySaving: 100, ratePercent: 0, years: 10 });
    expect(s.total).toBe(1000 + 100 * 12 * 10);
    expect(s.interest).toBe(0);
    expect(s.interestOnInterest).toBe(0);
  });

  it("grows a start amount like yearly compounding", () => {
    const rows = compoundGrowth({ startAmount: 10_000, monthlySaving: 0, ratePercent: 5, years: 20 });
    const last = rows.at(-1);
    expect(last?.total).toBeCloseTo(10_000 * 1.05 ** 20, 6);
    expect(rows[1]?.total).toBeCloseTo(10_500, 6);
  });

  it("splits interest into simple interest on deposits and interest on interest", () => {
    const r = 1.05 ** (1 / 12) - 1;
    const s = compoundGrowth({ startAmount: 10_000, monthlySaving: 0, ratePercent: 5, years: 20 }).at(
      -1,
    );
    // Simple interest on 10'000 for 240 months at the monthly rate.
    expect(s?.interest).toBeCloseTo(10_000 * r * 240, 6);
    expect(s?.interestOnInterest).toBeCloseTo((s?.total ?? 0) - 10_000 - 10_000 * r * 240, 6);
  });

  it("keeps the parts consistent and never negative", () => {
    const rows = compoundGrowth({ startAmount: 0, monthlySaving: 300, ratePercent: 3, years: 25 });
    for (const row of rows) {
      expect(row.interest).toBeGreaterThanOrEqual(0);
      expect(row.interestOnInterest).toBeGreaterThanOrEqual(0);
      expect(row.deposits + row.interest + row.interestOnInterest).toBeCloseTo(row.total, 6);
    }
    expect(rows).toHaveLength(26);
    expect(rows[25]?.deposits).toBe(300 * 12 * 25);
  });

  it("makes interest on interest grow faster than simple interest over time", () => {
    const s10 = compoundSummary({ startAmount: 0, monthlySaving: 200, ratePercent: 4, years: 10 });
    const s40 = compoundSummary({ startAmount: 0, monthlySaving: 200, ratePercent: 4, years: 40 });
    expect(s40.interestOnInterestShare).toBeGreaterThan(s10.interestOnInterestShare);
  });

  it("matches the annuity-due formula for monthly savings", () => {
    const r = 1.02 ** (1 / 12) - 1;
    const n = 12 * 30;
    const expected = 200 * (((1 + r) ** n - 1) / r) * (1 + r);
    const s = compoundGrowth({ startAmount: 0, monthlySaving: 200, ratePercent: 2, years: 30 }).at(-1);
    expect(s?.total).toBeCloseTo(expected, 4);
  });
});

describe("clampCompound", () => {
  it("keeps values inside limits and on steps", () => {
    expect(
      clampCompound({ startAmount: -5, monthlySaving: 123, ratePercent: 2.1, years: 99 }),
    ).toEqual({ startAmount: 0, monthlySaving: 100, ratePercent: 2, years: 50 });
    expect(
      clampCompound({ startAmount: Number.NaN, monthlySaving: 605, ratePercent: 20, years: 0 }),
    ).toEqual({ startAmount: 0, monthlySaving: 600, ratePercent: 8, years: 1 });
  });
});

describe("square chart", () => {
  it("picks a round unit that fits", () => {
    expect(squareUnit(9_000, 18)).toBe(500);
    expect(squareUnit(150_000, 18)).toBe(10_000);
  });

  it("spreads columns evenly and always ends with the last year", () => {
    expect(columnYears(5, 12)).toEqual([1, 2, 3, 4, 5]);
    const years = columnYears(30, 10);
    expect(years).toHaveLength(10);
    expect(years.at(-1)).toBe(30);
  });

  it("keeps each column's squares equal to its rounded total", () => {
    const rows = compoundGrowth({ startAmount: 10_000, monthlySaving: 200, ratePercent: 2, years: 30 });
    const { unit, columns } = compoundColumns(rows, { maxColumns: 10, maxSquares: 18 });
    for (const column of columns) {
      const row = rows[column.year];
      const count = column.squares.deposits + column.squares.interest + column.squares.interestOnInterest;
      expect(count).toBe(Math.round((row?.total ?? 0) / unit));
    }
    expect(Math.max(...columns.map((c) => Object.values(c.squares).reduce((a, b) => a + b)))).toBeLessThanOrEqual(18);
  });
});

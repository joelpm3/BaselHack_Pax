import { describe, expect, it } from "vitest";
import type { IncomeBreakdown } from "@/lib/advisor/types";
import { buildSquares, MAX_SQUARES, sourceSquareCounts, squaresFor, summarize } from "./grid";

function breakdown(values: Partial<IncomeBreakdown>): IncomeBreakdown {
  return {
    grossIncome: 0,
    need: 0,
    pillar1: 0,
    pillar2: 0,
    other: 0,
    partner: 0,
    policies: 0,
    total: 0,
    gap: 0,
    surplus: 0,
    capitalGap: 0,
    ...values,
  };
}

describe("squaresFor", () => {
  it("draws one square per CHF 500 a month", () => {
    expect(squaresFor(6000)).toBe(1);
    expect(squaresFor(96000)).toBe(16);
    expect(squaresFor(2999)).toBe(0);
    expect(squaresFor(-1000)).toBe(0);
  });
});

describe("sourceSquareCounts", () => {
  it("keeps the total exact when every source rounds down alone", () => {
    // 3 × CHF 400/month: each rounds to 1 square alone (0.8), together 1'200 = 2.4 → 2.
    const counts = sourceSquareCounts(breakdown({ pillar1: 4800, pillar2: 4800, other: 4800 }));
    expect(counts.pillar1 + counts.pillar2 + counts.other + counts.partner).toBe(2);
  });
});

describe("buildSquares", () => {
  it("fills the need by source and leaves the gap empty", () => {
    // Need 76'000 (≈13 squares), IV 26'856 (≈4) + BVG 22'010 (≈4) → 8 filled, 5 gap.
    const squares = buildSquares(
      breakdown({ need: 76000, pillar1: 26856, pillar2: 22010, total: 48866, gap: 27134 }),
    );
    expect(squares).toHaveLength(13);
    expect(squares.filter((s) => s.kind === "pillar1")).toHaveLength(4);
    expect(squares.filter((s) => s.kind === "pillar2")).toHaveLength(4);
    expect(squares.filter((s) => s.kind === "gap")).toHaveLength(5);
    expect(squares.some((s) => s.surplus)).toBe(false);
  });

  it("marks income above the need as surplus", () => {
    const squares = buildSquares(breakdown({ need: 60000, pillar1: 30000, pillar2: 42000 }));
    expect(squares).toHaveLength(12);
    expect(squares.filter((s) => s.surplus)).toHaveLength(2);
    expect(squares.every((s) => s.kind !== "gap")).toBe(true);
  });

  it("caps very large incomes", () => {
    expect(buildSquares(breakdown({ need: 1_000_000, pillar1: 900_000 }))).toHaveLength(
      MAX_SQUARES,
    );
  });
});

describe("summarize", () => {
  it("reports coverage of the need", () => {
    const summary = summarize(breakdown({ need: 120000, pillar1: 30000, pillar2: 30000 }));
    expect(summary).toEqual({
      needSquares: 20,
      coveredSquares: 10,
      gapSquares: 10,
      surplusSquares: 0,
      coverage: 0.5,
    });
  });

  it("treats a zero need as fully covered", () => {
    expect(summarize(breakdown({})).coverage).toBe(1);
  });
});

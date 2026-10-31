import type { IncomeBreakdown } from "@/lib/advisor/types";

/**
 * Square-unit maths for the Vorsorgebild: one square is CHF 500 of monthly income, the unit is
 * the logo's square dot. Sources fill squares in a fixed order; the uncovered part of the need is
 * drawn as empty squares; income above the need is marked as surplus.
 */

export const CHF_PER_SQUARE = 500;
export const SQUARES_PER_ROW = 10;
/** Above this the grid stops growing (CHF 50'000 per month) and shows the rest as a number. */
export const MAX_SQUARES = 100;

export const SOURCES = ["pillar1", "pillar2", "policies", "other", "partner"] as const;
export type Source = (typeof SOURCES)[number];
export type SquareKind = Source | "gap";

export interface Square {
  kind: SquareKind;
  /** Covers income above the need. */
  surplus: boolean;
}

export function monthly(annual: number): number {
  return annual / 12;
}

export function squaresFor(annual: number): number {
  return Math.max(0, Math.round(monthly(annual) / CHF_PER_SQUARE));
}

/**
 * Cumulative rounding keeps the total exact: the source squares always add up to the rounded
 * total income, even when every single source would round down on its own.
 */
export function sourceSquareCounts(breakdown: IncomeBreakdown): Record<Source, number> {
  const counts = { pillar1: 0, pillar2: 0, policies: 0, other: 0, partner: 0 } as Record<
    Source,
    number
  >;
  let cumulative = 0;
  let previous = 0;
  for (const source of SOURCES) {
    // `|| 0`: tool results stored before a source existed lack that field.
    cumulative += Math.max(0, breakdown[source] || 0);
    const boundary = squaresFor(cumulative);
    counts[source] = boundary - previous;
    previous = boundary;
  }
  return counts;
}

export function buildSquares(breakdown: IncomeBreakdown): Square[] {
  const need = squaresFor(breakdown.need);
  const counts = sourceSquareCounts(breakdown);
  const squares: Square[] = [];
  for (const source of SOURCES) {
    for (let i = 0; i < counts[source]; i++) {
      squares.push({ kind: source, surplus: squares.length >= need });
    }
  }
  while (squares.length < need) squares.push({ kind: "gap", surplus: false });
  return squares.slice(0, MAX_SQUARES);
}

export interface GridSummary {
  needSquares: number;
  coveredSquares: number;
  gapSquares: number;
  surplusSquares: number;
  /** 0–1 share of the need that is covered. */
  coverage: number;
}

export function summarize(breakdown: IncomeBreakdown): GridSummary {
  const squares = buildSquares(breakdown);
  const needSquares = squaresFor(breakdown.need);
  const gapSquares = squares.filter((s) => s.kind === "gap").length;
  const surplusSquares = squares.filter((s) => s.surplus).length;
  const coveredSquares = needSquares - gapSquares;
  return {
    needSquares,
    coveredSquares,
    gapSquares,
    surplusSquares,
    coverage: needSquares === 0 ? 1 : coveredSquares / needSquares,
  };
}

/** Monthly CHF rounded to whole francs for display. */
export function monthlyChf(annual: number): number {
  return Math.round(monthly(annual));
}

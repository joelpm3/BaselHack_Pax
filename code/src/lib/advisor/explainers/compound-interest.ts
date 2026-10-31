/**
 * Compound interest, split so a customer can see where the money comes from: their own
 * deposits, interest earned on those deposits, and interest earned on earlier interest.
 * Pure and client-safe: the widget recalculates in the browser when the sliders move.
 *
 * Model: a yearly rate r compounds monthly at the equivalent monthly rate (1 + r)^(1/12) − 1,
 * so a start amount alone grows exactly like yearly compounding. The monthly saving is paid at
 * the start of each month. "Interest on deposits" is what the deposits alone would earn per
 * month (simple interest); everything above it is interest on interest.
 */

export interface CompoundParams {
  startAmount: number;
  monthlySaving: number;
  /** Yearly interest in percent (2 = 2%). */
  ratePercent: number;
  years: number;
}

export interface CompoundYear {
  year: number;
  deposits: number;
  interest: number;
  interestOnInterest: number;
  total: number;
}

export const COMPOUND_LIMITS = {
  startAmount: { min: 0, max: 500_000, step: 1_000 },
  monthlySaving: { min: 0, max: 5_000, step: 50 },
  ratePercent: { min: 0, max: 8, step: 0.25 },
  years: { min: 1, max: 50, step: 1 },
} as const satisfies Record<keyof CompoundParams, { min: number; max: number; step: number }>;

/** Example values for a general question; the widget labels them as an example. */
export const EXAMPLE_PARAMS: CompoundParams = {
  startAmount: 10_000,
  monthlySaving: 200,
  ratePercent: 2,
  years: 30,
};

export function clampCompound(params: CompoundParams): CompoundParams {
  const clamp = (key: keyof CompoundParams) => {
    const { min, max, step } = COMPOUND_LIMITS[key];
    const value = Number.isFinite(params[key]) ? params[key] : min;
    const stepped = Math.round(value / step) * step;
    return Math.min(max, Math.max(min, Number(stepped.toFixed(2))));
  };
  return {
    startAmount: clamp("startAmount"),
    monthlySaving: clamp("monthlySaving"),
    ratePercent: clamp("ratePercent"),
    years: clamp("years"),
  };
}

/** One entry per year, starting with year 0 (today). Amounts are not rounded. */
export function compoundGrowth(params: CompoundParams): CompoundYear[] {
  const { startAmount, monthlySaving, ratePercent, years } = params;
  const monthlyRate = (1 + ratePercent / 100) ** (1 / 12) - 1;
  let deposits = startAmount;
  let interest = 0;
  let interestOnInterest = 0;
  const rows: CompoundYear[] = [
    { year: 0, deposits, interest, interestOnInterest, total: deposits },
  ];
  for (let year = 1; year <= years; year++) {
    for (let month = 0; month < 12; month++) {
      deposits += monthlySaving;
      const earnedOnDeposits = deposits * monthlyRate;
      // Earned only because earlier interest stayed invested.
      const earnedOnInterest = (interest + interestOnInterest) * monthlyRate;
      interest += earnedOnDeposits;
      interestOnInterest += earnedOnInterest;
    }
    rows.push({
      year,
      deposits,
      interest,
      interestOnInterest,
      total: deposits + interest + interestOnInterest,
    });
  }
  return rows;
}

export interface CompoundSummary {
  params: CompoundParams;
  deposits: number;
  interest: number;
  interestOnInterest: number;
  total: number;
  /** Share of the final amount that is interest on interest, 0–1. */
  interestOnInterestShare: number;
}

export function compoundSummary(params: CompoundParams): CompoundSummary {
  const last = compoundGrowth(params).at(-1) as CompoundYear;
  const round = (v: number) => Math.round(v);
  return {
    params,
    deposits: round(last.deposits),
    interest: round(last.interest),
    interestOnInterest: round(last.interestOnInterest),
    total: round(last.total),
    interestOnInterestShare: last.total > 0 ? last.interestOnInterest / last.total : 0,
  };
}

// ─── Square chart ───────────────────────────────────────────────────────────

export const COMPOUND_PARTS = ["deposits", "interest", "interestOnInterest"] as const;
export type CompoundPart = (typeof COMPOUND_PARTS)[number];

export interface CompoundColumn {
  year: number;
  /** Squares per part, bottom to top in COMPOUND_PARTS order. */
  squares: Record<CompoundPart, number>;
}

const NICE_UNITS = [
  100, 200, 250, 500, 1_000, 2_000, 2_500, 5_000, 10_000, 20_000, 25_000, 50_000, 100_000,
  200_000, 250_000, 500_000, 1_000_000,
];

/** The smallest round CHF amount per square that keeps the tallest column within maxSquares. */
export function squareUnit(maxTotal: number, maxSquares: number): number {
  return NICE_UNITS.find((unit) => maxTotal / unit <= maxSquares) ?? (NICE_UNITS.at(-1) as number);
}

/** Which years get a column: every year up to `maxColumns`, otherwise evenly spaced. */
export function columnYears(years: number, maxColumns: number): number[] {
  if (years <= maxColumns) return Array.from({ length: years }, (_, i) => i + 1);
  const picked = new Set<number>();
  for (let i = 1; i <= maxColumns; i++) picked.add(Math.round((i * years) / maxColumns));
  return [...picked].sort((a, b) => a - b);
}

/**
 * Columns of squares for the chart. Cumulative rounding keeps each column's height equal to
 * its rounded total, so small parts may show no square while the column stays honest.
 */
export function compoundColumns(
  rows: CompoundYear[],
  options: { maxColumns: number; maxSquares: number },
): { unit: number; columns: CompoundColumn[] } {
  const years = rows.length - 1;
  const total = rows.at(-1)?.total ?? 0;
  const unit = squareUnit(total, options.maxSquares);
  const columns = columnYears(years, options.maxColumns).map((year) => {
    const row = rows[year] as CompoundYear;
    const squares = { deposits: 0, interest: 0, interestOnInterest: 0 };
    let cumulative = 0;
    let previous = 0;
    for (const part of COMPOUND_PARTS) {
      cumulative += Math.max(0, row[part]);
      const boundary = Math.round(cumulative / unit);
      squares[part] = boundary - previous;
      previous = boundary;
    }
    return { year, squares };
  });
  return { unit, columns };
}

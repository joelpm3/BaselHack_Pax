import { FUNNEL_STAGES, type FunnelStage } from "@/lib/domain/taxonomy";

/** Which conversations a dashboard view counts. */
export const SCOPES = ["all", "real", "simulated"] as const;
export type Scope = (typeof SCOPES)[number];

export function parseScope(value: unknown): Scope {
  return SCOPES.includes(value as Scope) ? (value as Scope) : "all";
}

/** Reporting periods of the overview, in days; "all" counts everything. */
export const PERIODS = ["7", "30", "all"] as const;
export type Period = (typeof PERIODS)[number];

export function parsePeriod(value: unknown): Period {
  return PERIODS.includes(value as Period) ? (value as Period) : "30";
}

/** Lists show this many rows and grow by the same step ("show more"). */
export const PAGE_SIZE = 50;
const MAX_ROWS = 1000;

export function parseLimit(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= PAGE_SIZE) return PAGE_SIZE;
  return Math.min(MAX_ROWS, Math.ceil(n / PAGE_SIZE) * PAGE_SIZE);
}

export interface FunnelRow {
  stage: FunnelStage;
  /** Conversations that reached at least this stage. */
  reached: number;
  /** Share of all started conversations (0–1). */
  shareOfStarted: number;
  /** Conversations whose furthest stage is this one (they went no further). */
  stoppedHere: number;
}

/**
 * A conversation's `stage` is the furthest stage it reached (it only moves forward), so the
 * number that reached stage i is the number whose stage index is ≥ i.
 */
export function buildFunnel(stageCounts: Partial<Record<FunnelStage, number>>): FunnelRow[] {
  const counts = FUNNEL_STAGES.map((stage) => stageCounts[stage] ?? 0);
  const reached = counts.map((_, i) => counts.slice(i).reduce((sum, n) => sum + n, 0));
  const started = reached[0];
  return FUNNEL_STAGES.map((stage, i) => ({
    stage,
    reached: reached[i],
    shareOfStarted: started ? reached[i] / started : 0,
    stoppedHere: counts[i],
  }));
}

/**
 * The stage after which most conversations went no further. The last stage (signed) is the goal
 * and never counts as a drop-off. Null when nothing stopped early.
 */
export function biggestDropOff(
  funnel: FunnelRow[],
): { stage: FunnelStage; count: number; share: number } | null {
  const started = funnel[0]?.reached ?? 0;
  let best: FunnelRow | null = null;
  for (const row of funnel.slice(0, -1)) {
    if (row.stoppedHere > 0 && (!best || row.stoppedHere > best.stoppedHere)) best = row;
  }
  return best && started
    ? { stage: best.stage, count: best.stoppedHere, share: best.stoppedHere / started }
    : null;
}

export interface NpsSummary {
  responses: number;
  /** Net Promoter Score, −100…100 (promoters 9–10 minus detractors 0–6), null without data. */
  nps: number | null;
  average: number | null;
}

export function summariseNps(scores: number[]): NpsSummary {
  if (scores.length === 0) return { responses: 0, nps: null, average: null };
  const promoters = scores.filter((s) => s >= 9).length;
  const detractors = scores.filter((s) => s <= 6).length;
  return {
    responses: scores.length,
    nps: Math.round(((promoters - detractors) / scores.length) * 100),
    average: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
  };
}

const clockFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Zurich",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Midnight (Zurich) of the day `now` falls on. */
export function startOfZurichDay(now: Date): Date {
  const [h, m, s] = clockFormat.format(now).split(":").map(Number);
  return new Date(now.getTime() - ((h * 60 + m) * 60 + s) * 1000 - now.getMilliseconds());
}

/** Start of a reporting period: midnight `days - 1` days before today, or null for "all". */
export function periodStart(period: Period, now: Date): Date | null {
  if (period === "all") return null;
  return new Date(startOfZurichDay(now).getTime() - (Number(period) - 1) * 86_400_000);
}

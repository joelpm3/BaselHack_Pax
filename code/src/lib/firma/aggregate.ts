import { FUNNEL_STAGES, type FunnelStage } from "@/lib/domain/taxonomy";

/** Which conversations a dashboard view counts. */
export const SCOPES = ["all", "real", "simulated"] as const;
export type Scope = (typeof SCOPES)[number];

export function parseScope(value: unknown): Scope {
  return SCOPES.includes(value as Scope) ? (value as Scope) : "all";
}

export interface FunnelRow {
  stage: FunnelStage;
  /** Conversations that reached at least this stage. */
  reached: number;
  /** Share of all started conversations (0–1). */
  shareOfStarted: number;
  /** Share lost since the previous stage (0–1); 0 for the first stage. */
  dropOff: number;
  /** Conversations that were abandoned exactly at this stage. */
  abandonedHere: number;
}

/**
 * A conversation's `stage` is the furthest stage it reached (it only moves forward), so the
 * number that reached stage i is the number whose stage index is ≥ i.
 */
export function buildFunnel(
  stageCounts: Partial<Record<FunnelStage, number>>,
  abandonedCounts: Partial<Record<FunnelStage, number>> = {},
): FunnelRow[] {
  const counts = FUNNEL_STAGES.map((stage) => stageCounts[stage] ?? 0);
  const reached = counts.map((_, i) => counts.slice(i).reduce((sum, n) => sum + n, 0));
  const started = reached[0];
  return FUNNEL_STAGES.map((stage, i) => ({
    stage,
    reached: reached[i],
    shareOfStarted: started ? reached[i] / started : 0,
    dropOff: i === 0 || reached[i - 1] === 0 ? 0 : 1 - reached[i] / reached[i - 1],
    abandonedHere: abandonedCounts[stage] ?? 0,
  }));
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

const TIME_ZONE = "Europe/Zurich";
const dayKeyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const clockFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** `YYYY-MM-DD` of the Zurich calendar day. */
export function zurichDayKey(date: Date): string {
  return dayKeyFormat.format(date);
}

/** Midnight (Zurich) of the day `now` falls on. */
export function startOfZurichDay(now: Date): Date {
  const [h, m, s] = clockFormat.format(now).split(":").map(Number);
  return new Date(now.getTime() - ((h * 60 + m) * 60 + s) * 1000 - now.getMilliseconds());
}

/** Counts per Zurich day for the last `days` days (oldest first, today last). */
export function bucketByDay(
  dates: Date[],
  days: number,
  now: Date,
): Array<{ day: string; count: number }> {
  const today = startOfZurichDay(now);
  const keys = Array.from({ length: days }, (_, i) =>
    zurichDayKey(new Date(today.getTime() - (days - 1 - i) * 86_400_000 + 12 * 3_600_000)),
  );
  const counts = new Map(keys.map((k) => [k, 0]));
  for (const date of dates) {
    const key = zurichDayKey(date);
    const current = counts.get(key);
    if (current !== undefined) counts.set(key, current + 1);
  }
  return keys.map((day) => ({ day, count: counts.get(day) ?? 0 }));
}

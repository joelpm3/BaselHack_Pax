import { describe, expect, it } from "vitest";
import {
  bucketByDay,
  buildFunnel,
  parseScope,
  startOfZurichDay,
  summariseNps,
  zurichDayKey,
} from "./aggregate";

describe("buildFunnel", () => {
  it("counts every conversation at all stages up to its furthest one", () => {
    const funnel = buildFunnel(
      { started: 2, getting_to_know: 3, analysis_shown: 4, recommendation_shown: 1 },
      { getting_to_know: 2 },
    );
    expect(funnel.map((r) => r.reached)).toEqual([10, 8, 5, 5, 1, 1, 0, 0, 0]);
    expect(funnel[0]).toMatchObject({ shareOfStarted: 1, dropOff: 0 });
    expect(funnel[1]).toMatchObject({ stage: "getting_to_know", abandonedHere: 2 });
    expect(funnel[1].dropOff).toBeCloseTo(0.2);
    expect(funnel[2].dropOff).toBeCloseTo(0.375);
    expect(funnel[4].dropOff).toBeCloseTo(0.8);
    expect(funnel[4].shareOfStarted).toBeCloseTo(0.1);
    // Nothing reached the previous stage: no drop-off to report.
    expect(funnel[7].dropOff).toBe(0);
  });

  it("handles an empty dashboard", () => {
    const funnel = buildFunnel({});
    expect(funnel).toHaveLength(9);
    expect(funnel.every((r) => r.reached === 0 && r.shareOfStarted === 0)).toBe(true);
  });
});

describe("summariseNps", () => {
  it("computes promoters minus detractors", () => {
    expect(summariseNps([10, 9, 8, 7, 3])).toEqual({ responses: 5, nps: 20, average: 7.4 });
    expect(summariseNps([])).toEqual({ responses: 0, nps: null, average: null });
    expect(summariseNps([0, 1]).nps).toBe(-100);
  });
});

describe("Zurich day helpers", () => {
  it("finds local midnight in winter and summer time", () => {
    // 2026-01-15 08:30 UTC = 09:30 CET → midnight is 2026-01-14 23:00 UTC
    expect(startOfZurichDay(new Date("2026-01-15T08:30:00Z")).toISOString()).toBe(
      "2026-01-14T23:00:00.000Z",
    );
    // 2026-07-15 08:30 UTC = 10:30 CEST → midnight is 2026-07-14 22:00 UTC
    expect(startOfZurichDay(new Date("2026-07-15T08:30:00Z")).toISOString()).toBe(
      "2026-07-14T22:00:00.000Z",
    );
    expect(zurichDayKey(new Date("2026-07-14T22:30:00Z"))).toBe("2026-07-15");
  });

  it("buckets dates into the last n Zurich days", () => {
    const now = new Date("2026-10-30T10:00:00Z");
    const buckets = bucketByDay(
      [
        new Date("2026-10-30T09:00:00Z"),
        new Date("2026-10-29T23:30:00Z"), // 00:30 local on the 30th
        new Date("2026-10-28T12:00:00Z"),
        new Date("2026-10-01T12:00:00Z"), // outside the window
      ],
      3,
      now,
    );
    expect(buckets).toEqual([
      { day: "2026-10-28", count: 1 },
      { day: "2026-10-29", count: 0 },
      { day: "2026-10-30", count: 2 },
    ]);
  });
});

describe("misc", () => {
  it("parses scopes", () => {
    expect(parseScope("simulated")).toBe("simulated");
    expect(parseScope("nope")).toBe("all");
    expect(parseScope(undefined)).toBe("all");
  });
});

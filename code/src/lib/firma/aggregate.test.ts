import { describe, expect, it } from "vitest";
import {
  biggestDropOff,
  buildFunnel,
  PAGE_SIZE,
  parseLimit,
  parsePeriod,
  parseScope,
  periodStart,
  startOfZurichDay,
  summariseNps,
} from "./aggregate";

describe("buildFunnel", () => {
  it("counts every conversation at all stages up to its furthest one", () => {
    const funnel = buildFunnel(
      { started: 2, getting_to_know: 3, analysis_shown: 4, recommendation_shown: 1 },
      { getting_to_know: 2 },
    );
    expect(funnel.map((r) => r.reached)).toEqual([10, 8, 5, 5, 1, 1, 0, 0, 0]);
    expect(funnel[0]).toMatchObject({ shareOfStarted: 1, stoppedHere: 0 });
    expect(funnel[1]).toMatchObject({ stage: "getting_to_know", stoppedHere: 2 });
    expect(funnel[4].shareOfStarted).toBeCloseTo(0.1);
  });

  it("handles an empty dashboard", () => {
    const funnel = buildFunnel({});
    expect(funnel).toHaveLength(9);
    expect(funnel.every((r) => r.reached === 0 && r.shareOfStarted === 0)).toBe(true);
    expect(biggestDropOff(funnel)).toBeNull();
  });
});

describe("biggestDropOff", () => {
  it("finds the stage most customers left at", () => {
    const drop = biggestDropOff(
      buildFunnel({ started: 2, analysis_shown: 5, signed: 3 }, { started: 1, analysis_shown: 5 }),
    );
    expect(drop).toEqual({ stage: "analysis_shown", count: 5, share: 0.5 });
  });

  it("ignores conversations nobody left", () => {
    expect(biggestDropOff(buildFunnel({ started: 4, signed: 4 }))).toBeNull();
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
  });

  it("starts a 7-day period six midnights before today", () => {
    const now = new Date("2026-01-15T08:30:00Z");
    expect(periodStart("7", now)?.toISOString()).toBe("2026-01-08T23:00:00.000Z");
    expect(periodStart("all", now)).toBeNull();
  });
});

describe("parsers", () => {
  it("parses scopes", () => {
    expect(parseScope("simulated")).toBe("simulated");
    expect(parseScope("nope")).toBe("all");
    expect(parseScope(undefined)).toBe("all");
  });

  it("parses periods", () => {
    expect(parsePeriod("7")).toBe("7");
    expect(parsePeriod("all")).toBe("all");
    expect(parsePeriod("12")).toBe("30");
  });

  it("rounds list limits to whole pages", () => {
    expect(parseLimit(undefined)).toBe(PAGE_SIZE);
    expect(parseLimit("-3")).toBe(PAGE_SIZE);
    expect(parseLimit(String(PAGE_SIZE + 1))).toBe(PAGE_SIZE * 2);
    expect(parseLimit("1001")).toBe(1050);
  });
});

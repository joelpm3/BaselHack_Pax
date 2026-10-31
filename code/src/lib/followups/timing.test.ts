import { describe, expect, it } from "vitest";
import { parseGermanTiming, resolveExpression, resolveTiming } from "./timing";

const OCT = "2026-10-15";
const MARCH = "2026-03-10";

const resolve = (phrase: string, ref = OCT) => resolveExpression(phrase, null, ref);

describe("German phrases relative to the conversation date", () => {
  it("in zwei Jahren → same month two years later", () => {
    expect(resolve("in zwei Jahren bin ich fertig")).toEqual({
      date: "2028-10-01",
      precision: "month",
    });
    expect(resolve("in 2 Jahren")).toEqual({ date: "2028-10-01", precision: "month" });
  });

  it("months, half years and weeks", () => {
    expect(resolve("in sechs Monaten")).toEqual({ date: "2027-04-01", precision: "month" });
    expect(resolve("in einem halben Jahr")).toEqual({ date: "2027-04-01", precision: "month" });
    expect(resolve("in anderthalb Jahren")).toEqual({ date: "2028-04-01", precision: "month" });
    expect(resolve("in drei Wochen")).toEqual({ date: "2026-11-05", precision: "day" });
  });

  it("nächsten Sommer is the coming summer, depending on when it was said", () => {
    expect(resolve("wir heiraten nächsten Sommer")).toEqual({
      date: "2027-06-01",
      precision: "season",
    });
    expect(resolve("wir heiraten nächsten Sommer", MARCH)).toEqual({
      date: "2026-06-01",
      precision: "season",
    });
    expect(resolve("diesen Sommer", MARCH)).toEqual({ date: "2026-06-01", precision: "season" });
    expect(resolve("übernächsten Sommer")).toEqual({ date: "2028-06-01", precision: "season" });
    expect(resolve("im Frühling 2028")).toEqual({ date: "2028-03-01", precision: "season" });
  });

  it("said during the season itself, nächsten Sommer means next year", () => {
    expect(resolve("nächsten Sommer", "2026-07-20")).toEqual({
      date: "2027-06-01",
      precision: "season",
    });
  });

  it("named months and dates", () => {
    expect(resolve("im März")).toEqual({ date: "2027-03-01", precision: "month" });
    expect(resolve("im März", "2026-01-05")).toEqual({ date: "2026-03-01", precision: "month" });
    expect(resolve("im Juni 2029")).toEqual({ date: "2029-06-01", precision: "month" });
    expect(resolve("am 15. März 2027")).toEqual({ date: "2027-03-15", precision: "day" });
  });

  it("years and parts of a year", () => {
    expect(resolve("nächstes Jahr")).toEqual({ date: "2027-01-01", precision: "year" });
    expect(resolve("übernächstes Jahr")).toEqual({ date: "2028-01-01", precision: "year" });
    expect(resolve("Ende Jahr")).toEqual({ date: "2026-12-01", precision: "month" });
    expect(resolve("Ende nächsten Jahres")).toEqual({ date: "2027-12-01", precision: "month" });
    expect(resolve("Anfang 2028")).toEqual({ date: "2028-01-01", precision: "month" });
    expect(resolve("2030")).toEqual({ date: "2030-01-01", precision: "year" });
  });

  it("returns null for phrases without a time", () => {
    expect(parseGermanTiming("irgendwann später")).toBeNull();
    expect(resolve("irgendwann später")).toBeNull();
  });
});

describe("structured timing from the extractor", () => {
  it("is the fallback when the phrase parser does not understand the words", () => {
    expect(
      resolveExpression("l'été prochain", { kind: "season", season: "summer", which: "next" }, OCT),
    ).toEqual({ date: "2027-06-01", precision: "season" });
  });

  it("the phrase parser wins over a wrong structure", () => {
    expect(
      resolveExpression("in zwei Jahren", { kind: "duration", amount: 3, unit: "years" }, OCT),
    ).toEqual({ date: "2028-10-01", precision: "month" });
  });

  it("ages: a child turning 18", () => {
    expect(resolveTiming({ kind: "age", age: 18, birthYear: 2012 }, OCT)).toEqual({
      date: "2030-01-01",
      precision: "year",
    });
  });

  it("rejects incomplete or impossible input", () => {
    expect(resolveTiming({ kind: "duration", amount: 0, unit: "years" }, OCT)).toBeNull();
    expect(resolveTiming({ kind: "month", month: 13 }, OCT)).toBeNull();
    expect(resolveTiming({ kind: "date", day: 31, month: 2, year: 2027 }, OCT)).toBeNull();
    expect(resolveTiming({ kind: "age", age: 18 }, OCT)).toBeNull();
  });
});

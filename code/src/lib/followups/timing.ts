import { addDays, addMonths } from "@/lib/documents/dates";
import type { DatePrecision } from "./taxonomy";

/**
 * Turns what a customer said about "when" into a calendar date, relative to the day of the
 * conversation. Pure and deterministic: the LLM only reports the expression and its structure,
 * the date arithmetic happens here.
 */

export interface ResolvedDate {
  /** ISO yyyy-mm-dd; the first of the month unless precision is "day". */
  date: string;
  precision: DatePrecision;
}

export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export type Season = (typeof SEASONS)[number];

/** Month a season is taken to start in (meteorological seasons). */
const SEASON_MONTH: Record<Season, number> = { spring: 3, summer: 6, autumn: 9, winter: 12 };

export const RELATIVE_WHICH = ["this", "next", "after_next"] as const;
export type RelativeWhich = (typeof RELATIVE_WHICH)[number];

/** Structured timing as the extractor reports it (all fields optional except `kind`). */
export interface Timing {
  kind: "duration" | "season" | "month" | "year" | "date" | "age";
  amount?: number | null;
  unit?: "weeks" | "months" | "years" | null;
  season?: Season | null;
  month?: number | null;
  day?: number | null;
  year?: number | null;
  which?: RelativeWhich | null;
  part?: "start" | "middle" | "end" | null;
  age?: number | null;
  birthYear?: number | null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const monthStart = (year: number, month: number) => `${year}-${pad(month)}-01`;

function parts(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return { year, month, day };
}

const isMonth = (m: number | null | undefined): m is number =>
  typeof m === "number" && Number.isInteger(m) && m >= 1 && m <= 12;

/**
 * The year of the next occurrence of `month` seen from `ref`: "nächsten Sommer" in March is this
 * summer, in July or October it is next year's. "this" keeps the current year, "after_next" skips
 * one occurrence.
 */
function yearForMonth(ref: string, month: number, which: RelativeWhich | null | undefined): number {
  const { year, month: refMonth } = parts(ref);
  if (which === "this") return year;
  const next = month > refMonth ? year : year + 1;
  return which === "after_next" ? next + 1 : next;
}

function yearOffset(which: RelativeWhich | null | undefined): number {
  return which === "this" ? 0 : which === "after_next" ? 2 : 1;
}

const PART_MONTH = { start: 1, middle: 6, end: 12 } as const;

export function resolveTiming(timing: Timing, conversationDate: string): ResolvedDate | null {
  const ref = conversationDate.slice(0, 10);
  switch (timing.kind) {
    case "duration": {
      const amount = timing.amount ?? 0;
      if (!(amount > 0) || !timing.unit) return null;
      if (timing.unit === "weeks")
        return { date: addDays(ref, Math.round(amount * 7)), precision: "day" };
      const months = Math.round(timing.unit === "years" ? amount * 12 : amount);
      const { year, month } = parts(addMonths(ref, months));
      return { date: monthStart(year, month), precision: "month" };
    }
    case "season": {
      if (!timing.season) return null;
      const month = SEASON_MONTH[timing.season];
      const year = timing.year ?? yearForMonth(ref, month, timing.which);
      return { date: monthStart(year, month), precision: "season" };
    }
    case "month": {
      if (!isMonth(timing.month)) return null;
      const year = timing.year ?? yearForMonth(ref, timing.month, timing.which);
      return { date: monthStart(year, timing.month), precision: "month" };
    }
    case "year": {
      const year = timing.year ?? parts(ref).year + yearOffset(timing.which);
      if (timing.part)
        return { date: monthStart(year, PART_MONTH[timing.part]), precision: "month" };
      return { date: monthStart(year, 1), precision: "year" };
    }
    case "date": {
      if (!isMonth(timing.month) || !timing.day) return null;
      const year = timing.year ?? yearForMonth(ref, timing.month, timing.which);
      const iso = `${year}-${pad(timing.month)}-${pad(timing.day)}`;
      // Reject impossible dates like 31 February.
      if (addDays(iso, 0) !== iso) return null;
      return { date: iso, precision: "day" };
    }
    case "age": {
      if (!timing.age || !timing.birthYear) return null;
      return { date: monthStart(timing.birthYear + timing.age, 1), precision: "year" };
    }
  }
}

// ─── German phrases ─────────────────────────────────────────────────────────

const NUMBER_WORDS: Record<string, number> = {
  ein: 1,
  eine: 1,
  einem: 1,
  einen: 1,
  einer: 1,
  zwei: 2,
  drei: 3,
  vier: 4,
  fünf: 5,
  sechs: 6,
  sieben: 7,
  acht: 8,
  neun: 9,
  zehn: 10,
  elf: 11,
  zwölf: 12,
  anderthalb: 1.5,
  eineinhalb: 1.5,
};

const MONTHS: Record<string, number> = {
  januar: 1,
  jänner: 1,
  februar: 2,
  märz: 3,
  april: 4,
  mai: 5,
  juni: 6,
  juli: 7,
  august: 8,
  september: 9,
  oktober: 10,
  november: 11,
  dezember: 12,
};

const SEASON_WORDS: Record<string, Season> = {
  frühling: "spring",
  frühjahr: "spring",
  sommer: "summer",
  herbst: "autumn",
  winter: "winter",
};

function whichFrom(word: string | undefined): RelativeWhich | null {
  if (!word) return null;
  if (word.startsWith("übernächst")) return "after_next";
  if (word.startsWith("dies")) return "this";
  return "next";
}

const NUM = `(\\d+(?:[.,]5)?|${Object.keys(NUMBER_WORDS).join("|")})`;
const WHICH = "(nächst\\w*|kommend\\w*|übernächst\\w*|dies\\w*)";

/**
 * Common German time expressions ("in zwei Jahren", "nächsten Sommer", "Ende Jahr",
 * "im März 2028") → structured timing. Returns null when the phrase is not recognised; the
 * extractor's own structure is used then.
 */
export function parseGermanTiming(phrase: string): Timing | null {
  const text = phrase.toLowerCase().replace(/\s+/g, " ");
  const toNumber = (raw: string) => NUMBER_WORDS[raw] ?? Number(raw.replace(",", "."));

  let m = text.match(
    new RegExp(`(?:in|nach) (?:etwa |ca\\. |rund )?${NUM} (halben )?(jahr|monat|woche)`),
  );
  if (m) {
    // "in einem halben Jahr": half of the unit.
    const amount = m[2] ? toNumber(m[1]) / 2 : toNumber(m[1]);
    const unit = m[3] === "jahr" ? "years" : m[3] === "monat" ? "months" : "weeks";
    return { kind: "duration", amount, unit };
  }

  const seasonNames = Object.keys(SEASON_WORDS).join("|");
  m = text.match(new RegExp(`(?:${WHICH} )?\\b(${seasonNames})(?: (\\d{4}))?`));
  if (m) {
    return {
      kind: "season",
      season: SEASON_WORDS[m[2]],
      year: m[3] ? Number(m[3]) : null,
      which: whichFrom(m[1]),
    };
  }

  const monthNames = Object.keys(MONTHS).join("|");
  m = text.match(new RegExp(`(\\d{1,2})\\. ?(${monthNames})(?: (\\d{4}))?`));
  if (m) {
    return {
      kind: "date",
      day: Number(m[1]),
      month: MONTHS[m[2]],
      year: m[3] ? Number(m[3]) : null,
    };
  }
  m = text.match(new RegExp(`(?:${WHICH} )?\\b(${monthNames})\\b(?: (\\d{4}))?`));
  if (m) {
    return {
      kind: "month",
      month: MONTHS[m[2]],
      year: m[3] ? Number(m[3]) : null,
      which: whichFrom(m[1]),
    };
  }

  const part = text.match(/\b(anfang|mitte|ende)\b/)?.[1];
  const partValue = part === "anfang" ? "start" : part === "mitte" ? "middle" : part ? "end" : null;
  m = text.match(/\b(20\d{2})\b/);
  if (m) return { kind: "year", year: Number(m[1]), part: partValue };
  m = text.match(new RegExp(`${WHICH} jahr`));
  if (m) return { kind: "year", which: whichFrom(m[1]), part: partValue };
  if (part && /\bjahr(es)?\b/.test(text)) return { kind: "year", which: "this", part: partValue };
  return null;
}

/** The phrase parser wins when it understands the words; otherwise the extractor's structure. */
export function resolveExpression(
  expression: string,
  structured: Timing | null,
  conversationDate: string,
): ResolvedDate | null {
  const parsed = parseGermanTiming(expression);
  return (
    (parsed && resolveTiming(parsed, conversationDate)) ??
    (structured && resolveTiming(structured, conversationDate))
  );
}

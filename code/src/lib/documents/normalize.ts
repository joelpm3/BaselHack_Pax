import type { ExtractedField } from "@/lib/db/schema";
import type { FieldDef } from "./fields";

/**
 * Turns raw model output and customer edits into clean field values. Model output is never
 * trusted as-is: numbers may arrive as "CHF 73'540.–", dates as "16.09.1984".
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const SWISS_DATE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;

export function parseSwissNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .replace(/CHF|Fr\.|%/gi, "")
    .replace(/[’'`\s  ]/g, "")
    .replace(/\.[-–—]$/, "")
    .replace(/[-–—]$/, "")
    .replace(/,(\d{1,2})$/, ".$1")
    .replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

export function parseDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  let y: number;
  let m: number;
  let d: number;
  const iso = ISO_DATE.exec(value);
  const swiss = SWISS_DATE.exec(value);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (swiss) [d, m, y] = [Number(swiss[1]), Number(swiss[2]), Number(swiss[3])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d)
    return null;
  if (y < 1900 || y > 2120) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Normalises one value for a field definition; null means "not usable". */
export function normalizeValue(def: FieldDef, raw: unknown): string | number | boolean | null {
  if (raw === null || raw === undefined || raw === "") return null;
  switch (def.kind) {
    case "chf": {
      const n = parseSwissNumber(raw);
      return n !== null && n >= 0 && n < 1e9 ? Math.round(n * 100) / 100 : null;
    }
    case "percent": {
      const n = parseSwissNumber(raw);
      if (n === null) return null;
      const pct = n > 0 && n <= 1 ? n * 100 : n;
      return pct >= 0 && pct <= 100 ? Math.round(pct * 10) / 10 : null;
    }
    case "integer": {
      const n = parseSwissNumber(raw);
      return n !== null && Number.isInteger(n) && n >= 0 && n <= 3000 ? n : null;
    }
    case "date":
      return parseDate(raw);
    case "text": {
      if (typeof raw !== "string" && typeof raw !== "number") return null;
      const text = String(raw).replace(/\s+/g, " ").trim().slice(0, 200);
      return text.length > 0 ? text : null;
    }
    case "enum":
      return typeof raw === "string" && def.options?.includes(raw) ? raw : null;
    case "boolean":
      if (typeof raw === "boolean") return raw;
      if (raw === "true") return true;
      if (raw === "false") return false;
      return null;
  }
}

export interface RawField {
  value: unknown;
  confidence?: unknown;
  page?: unknown;
  quote?: unknown;
}

/** Builds stored ExtractedFields from the model's per-field objects, dropping empty ones. */
export function normalizeExtractedFields(
  defs: FieldDef[],
  raw: Record<string, RawField | null | undefined>,
): ExtractedField[] {
  const fields: ExtractedField[] = [];
  for (const def of defs) {
    const item = raw[def.key];
    if (!item) continue;
    const value = normalizeValue(def, item.value);
    if (value === null) continue;
    const confidence = typeof item.confidence === "number" ? item.confidence : 0.5;
    const page = typeof item.page === "number" && item.page >= 1 ? Math.round(item.page) : null;
    const quote =
      typeof item.quote === "string" && item.quote.trim() ? item.quote.trim().slice(0, 240) : null;
    fields.push({
      path: def.key,
      value,
      confidence: Math.min(1, Math.max(0, confidence)),
      page,
      quote,
    });
  }
  return fields;
}

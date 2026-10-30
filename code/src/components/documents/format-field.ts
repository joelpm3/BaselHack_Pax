import { formatSwissDate } from "@/lib/documents/dates";
import type { FieldDef } from "@/lib/documents/fields";
import { formatChf } from "@/lib/utils";

type Translate = (key: string, values?: Record<string, string | number>) => string;

const percentFormatters = new Map<string, Intl.NumberFormat>();

function formatPercent(value: number, locale: string): string {
  let formatter = percentFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(`${locale}-CH`, {
      style: "percent",
      maximumFractionDigits: 1,
    });
    percentFormatters.set(locale, formatter);
  }
  return formatter.format(value / 100);
}

/** Human-readable value of an extracted field (t = the `documents` namespace). */
export function formatFieldValue(
  def: FieldDef,
  value: unknown,
  locale: string,
  t: Translate,
): string {
  if (value === null || value === undefined) return "–";
  switch (def.kind) {
    case "chf":
      return typeof value === "number"
        ? formatChf(value, locale, Number.isInteger(value) ? 0 : 2)
        : String(value);
    case "percent":
      return typeof value === "number" ? formatPercent(value, locale) : String(value);
    case "date":
      return formatSwissDate(String(value));
    case "integer":
      return def.key.endsWith("Months") && typeof value === "number"
        ? t("review.months", { count: value })
        : String(value);
    case "enum":
      if (def.key === "category") return t(`category.${String(value)}`);
      if (def.key === "pillar") return t(`pillar.${String(value)}`);
      if (def.key === "premiumFrequency") return t(`frequency.${String(value)}`);
      return String(value);
    case "boolean":
      return value === true ? t("review.yes") : t("review.no");
    case "text":
      return String(value);
  }
}

/** Initial text of the inline editor. */
export function editorValue(def: FieldDef, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (def.kind === "boolean") return value === true ? "true" : "false";
  return String(value);
}

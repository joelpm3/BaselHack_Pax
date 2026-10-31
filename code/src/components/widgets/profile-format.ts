import { EDITABLE_FIELDS, type FieldSpec, HIDDEN_FIELDS } from "@/lib/advisor/profile-fields";
import type { ProfileFieldChange } from "@/lib/advisor/types";

/** A `widgets` translator; shared by the chat card (client) and the company transcript (server). */
export type WidgetsTranslate = (key: string, values?: Record<string, string | number>) => string;

/** How a stored profile value reads to a person ("2 Kinder (2026, 2027)", "CHF 85'000"). */
export function formatProfileValue(
  path: string,
  value: unknown,
  t: WidgetsTranslate,
  chf: (amount: number) => string,
): string {
  if (value === null || value === undefined) return t("profile.removed");
  const spec = EDITABLE_FIELDS[path];
  if (spec) return formatSpec(spec, value, t, chf);
  if (path === "children" && Array.isArray(value)) {
    const years = value.map((c) => (isRecord(c) ? c.birthYear : null)).filter(Boolean);
    return t("profile.children", { count: value.length, years: years.join(", ") });
  }
  if (path === "goals" && Array.isArray(value))
    return value.map((g) => t(`enums.goal.${String(g)}`)).join(", ");
  if (path === "concerns" && Array.isArray(value))
    return value.map((c) => `«${String(c)}»`).join(", ");
  if (path === "plannedEvents" && Array.isArray(value)) {
    return value
      .filter(isRecord)
      .map((e) => {
        const label = t(`enums.plannedEvent.${String(e.type)}`);
        return e.year ? `${label} (${e.year})` : label;
      })
      .join(", ");
  }
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (isRecord(value)) return t("profile.updated");
  return String(value);
}

function formatSpec(
  spec: FieldSpec,
  value: unknown,
  t: WidgetsTranslate,
  chf: (amount: number) => string,
) {
  switch (spec.kind) {
    case "chf":
      return typeof value === "number" ? chf(value) : String(value);
    case "percent":
      return `${value} %`;
    case "boolean":
      return value ? t("common.yes") : t("common.no");
    case "enum":
      return t(`enums.${spec.enumName}.${String(value)}`);
    default:
      return String(value);
  }
}

/** `partner` alone (removed) has its own label; every other path maps to `fields.<path>`. */
export function profileFieldLabelKey(path: string) {
  return path === "partner" ? "fields.partnerEntry" : `fields.${path}`;
}

/** The changes worth showing, last write per path wins. */
export function visibleProfileChanges(changes: ProfileFieldChange[]): ProfileFieldChange[] {
  const byPath = new Map<string, ProfileFieldChange>();
  for (const change of changes) {
    if (HIDDEN_FIELDS.has(change.path)) continue;
    byPath.set(change.path, change);
  }
  return [...byPath.values()];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

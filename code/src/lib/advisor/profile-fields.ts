import {
  employmentSchema,
  maritalStatusSchema,
  privateCoverSchema,
  sexSchema,
} from "@/lib/domain/profile";

/**
 * Profile fields the customer can correct inline in the "Ihre Situation" card. Client-safe:
 * the card uses it to render inputs, the server action to whitelist paths. Labels live in
 * `widgets.fields.<path>` and enum labels in `widgets.enums.<enum>.<value>`.
 */

export type FieldKind = "text" | "year" | "chf" | "percent" | "age" | "count" | "enum" | "boolean";

export interface FieldSpec {
  kind: FieldKind;
  /** Enum name for labels (`widgets.enums.<name>`) and its values. */
  enumName?: "sex" | "maritalStatus" | "employment" | "riskAttitude" | "privateCover";
  options?: readonly string[];
}

const sex: FieldSpec = { kind: "enum", enumName: "sex", options: sexSchema.options };
const marital: FieldSpec = {
  kind: "enum",
  enumName: "maritalStatus",
  options: maritalStatusSchema.options,
};
const employment: FieldSpec = {
  kind: "enum",
  enumName: "employment",
  options: employmentSchema.options,
};
const chf: FieldSpec = { kind: "chf" };

function personFields(prefix: "person" | "partner"): Record<string, FieldSpec> {
  return {
    [`${prefix}.firstName`]: { kind: "text" },
    [`${prefix}.birthYear`]: { kind: "year" },
    [`${prefix}.sex`]: sex,
    ...(prefix === "person" ? { "person.maritalStatus": marital } : {}),
    [`${prefix}.employment`]: employment,
    [`${prefix}.workloadPercent`]: { kind: "percent" },
    [`${prefix}.grossIncome`]: chf,
    [`${prefix}.occupation`]: { kind: "text" },
    [`${prefix}.smoker`]: { kind: "boolean" },
  };
}

/** The customer's pension fund (`pillar2`) or the partner's (`partner.pillar2`). */
function pillar2Fields(prefix: "pillar2" | "partner.pillar2"): Record<string, FieldSpec> {
  return {
    [`${prefix}.hasPensionFund`]: { kind: "boolean" },
    [`${prefix}.insuredSalary`]: chf,
    [`${prefix}.currentCapital`]: chf,
    [`${prefix}.projectedCapitalAtRetirement`]: chf,
    [`${prefix}.projectedPensionAtRetirement`]: chf,
    [`${prefix}.disabilityPension`]: chf,
    [`${prefix}.partnerPension`]: chf,
    [`${prefix}.childPension`]: chf,
    [`${prefix}.deathLumpSum`]: chf,
    [`${prefix}.maxBuyIn`]: chf,
  };
}

export const EDITABLE_FIELDS: Record<string, FieldSpec> = {
  ...personFields("person"),
  ...personFields("partner"),
  "assets.liquid": chf,
  "assets.securities": chf,
  "assets.realEstateValue": chf,
  "assets.mortgage": chf,
  "assets.total": chf,
  "pillar1.contributionGapYears": { kind: "count" },
  ...pillar2Fields("pillar2"),
  ...pillar2Fields("partner.pillar2"),
  "pillar3a.balance": chf,
  "pillar3a.annualContribution": chf,
  desiredRetirementAge: { kind: "age" },
  riskAttitude: { kind: "enum", enumName: "riskAttitude", options: ["low", "medium", "high"] },
  privateCover: { kind: "enum", enumName: "privateCover", options: privateCoverSchema.options },
  monthlySpending: chf,
};

/** Fields the card shows but does not edit inline (lists, place of residence). */
export const READ_ONLY_FIELDS = [
  "children",
  "goals",
  "concerns",
  "plannedEvents",
  "residence.zip",
  "residence.city",
  "partner",
] as const;

/** Paths written as a side effect that the card never lists. */
export const HIDDEN_FIELDS = new Set([
  "residence.canton",
  "residence.taxLocationId",
  "person.healthNotes",
  "partner.healthNotes",
  "partner.maritalStatus",
]);

/** Parses a value typed into the card; returns undefined when it is not valid for the field. */
export function parseFieldValue(
  spec: FieldSpec,
  raw: string,
): string | number | boolean | null | undefined {
  const text = raw.trim();
  if (text === "") return null;
  switch (spec.kind) {
    case "text":
      return text;
    case "enum":
      return spec.options?.includes(text) ? text : undefined;
    case "boolean":
      return text === "true" ? true : text === "false" ? false : undefined;
    default: {
      const value = Number(text.replace(/['’\s]/g, "").replace(",", "."));
      if (!Number.isFinite(value) || value < 0) return undefined;
      return Math.round(value);
    }
  }
}

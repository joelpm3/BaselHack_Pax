import type { ExtractedField } from "@/lib/db/schema";
import type { LifeSituation } from "@/lib/domain/profile";
import type { PolicyCategory } from "@/lib/domain/taxonomy";
import type { ProfileChange } from "@/lib/profile/service";
import { addDays, addMonths, yearOf } from "./dates";
import {
  DESCRIPTION_PATH,
  type ExtractableDocumentType,
  fieldDef,
  type PremiumFrequency,
} from "./fields";
import { normalizeValue } from "./normalize";
import type { DocumentSubject } from "./types";

/**
 * From confirmed extraction values to profile changes and cockpit policies. Pure functions,
 * unit-tested: this is where "the number on the certificate" becomes "the number the advisor
 * uses", so every mapping is explicit.
 */

export type FieldValue = string | number | boolean;
export type FieldValues = Record<string, FieldValue>;
type Subject = DocumentSubject;

/** Applies the customer's edits (path → value, null/"" removes) on top of the extracted fields. */
export function applyEdits(
  docType: ExtractableDocumentType,
  fields: ExtractedField[],
  edits: Record<string, unknown> | null | undefined,
): { values: FieldValues; invalid: string[] } {
  const values: FieldValues = {};
  for (const field of fields) {
    if (field.path === DESCRIPTION_PATH) continue;
    if (
      typeof field.value === "string" ||
      typeof field.value === "number" ||
      typeof field.value === "boolean"
    )
      values[field.path] = field.value;
  }
  const invalid: string[] = [];
  for (const [path, raw] of Object.entries(edits ?? {})) {
    const def = fieldDef(docType, path);
    if (!def) {
      invalid.push(path);
      continue;
    }
    if (raw === null || raw === undefined || raw === "") {
      delete values[path];
      continue;
    }
    const value = normalizeValue(def, raw);
    if (value === null) invalid.push(path);
    else values[path] = value;
  }
  return { values, invalid };
}

interface ProfileTarget {
  /** `who` is replaced by `person` or `partner`. */
  path: string;
  /** Pension-fund figures exist only for the customer in LifeSituation. */
  selfOnly?: boolean;
  transform?: (value: FieldValue) => unknown;
}

const birthYear = (value: FieldValue) => (typeof value === "string" ? yearOf(value) : undefined);

/** Extraction field → LifeSituation path, per document type. */
export const PROFILE_TARGETS: Record<ExtractableDocumentType, Record<string, ProfileTarget>> = {
  pension_certificate: {
    grossSalary: { path: "who.grossIncome" },
    workloadPercent: { path: "who.workloadPercent" },
    birthDate: { path: "who.birthYear", transform: birthYear },
    insuredSalary: { path: "pillar2.insuredSalary", selfOnly: true },
    currentCapital: { path: "pillar2.currentCapital", selfOnly: true },
    projectedCapitalAtRetirement: { path: "pillar2.projectedCapitalAtRetirement", selfOnly: true },
    projectedPensionAtRetirement: { path: "pillar2.projectedPensionAtRetirement", selfOnly: true },
    disabilityPension: { path: "pillar2.disabilityPension", selfOnly: true },
    partnerPension: { path: "pillar2.partnerPension", selfOnly: true },
    childPension: { path: "pillar2.childPension", selfOnly: true },
    deathLumpSum: { path: "pillar2.deathLumpSum", selfOnly: true },
    maxBuyIn: { path: "pillar2.maxBuyIn", selfOnly: true },
  },
  salary_certificate: {
    grossSalary: { path: "who.grossIncome" },
  },
  insurance_policy: {},
};

const SALUTATION =
  /^(herr|frau|hr\.|fr\.|monsieur|madame|m\.|mme|signor|signora|sig\.|sig\.ra|mr\.?|mrs\.?|ms\.?)\s+/i;

/** "Herr May Müller" → "May", "Müller, May" → "May". */
export function firstNameOf(fullName: string | undefined): string | undefined {
  if (!fullName) return undefined;
  const name = fullName.trim().replace(SALUTATION, "");
  const part = name.includes(",") ? name.split(",")[1] : name;
  const first = part?.trim().split(/\s+/)[0];
  return first && /^\p{L}[\p{L}'-]*$/u.test(first) ? first : undefined;
}

function nameOnDocument(values: FieldValues): string | undefined {
  const name = values.insuredPerson ?? values.employeeName;
  return typeof name === "string" ? name : undefined;
}

function birthYearOnDocument(values: FieldValues): number | undefined {
  const date = values.birthDate ?? values.insuredBirthDate;
  return typeof date === "string" ? yearOf(date) : undefined;
}

function normalizeName(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Guesses whose document it is by comparing name and birth year with the profile. */
export function suggestSubject(values: FieldValues, profile: LifeSituation): Subject {
  const partner = profile.partner;
  if (!partner) return "self";
  const name = nameOnDocument(values);
  const year = birthYearOnDocument(values);
  const matches = (first: string | undefined, born: number | undefined) =>
    (first !== undefined &&
      name !== undefined &&
      normalizeName(name).includes(normalizeName(first))) ||
    (born !== undefined && year !== undefined && born === year);
  const selfMatch = matches(profile.person.firstName, profile.person.birthYear);
  const partnerMatch = matches(partner.firstName, partner.birthYear);
  return partnerMatch && !selfMatch ? "partner" : "self";
}

/** The profile changes a confirmed document implies. Only fills `employment`/`firstName` if unknown. */
export function profileChangesFor(
  docType: ExtractableDocumentType,
  values: FieldValues,
  subject: Subject,
  current: LifeSituation,
): ProfileChange[] {
  const who = subject === "self" ? "person" : "partner";
  const changes: ProfileChange[] = [];
  for (const [key, target] of Object.entries(PROFILE_TARGETS[docType])) {
    if (!(key in values)) continue;
    if (target.selfOnly && subject !== "self") continue;
    const value = target.transform ? target.transform(values[key]) : values[key];
    if (value === undefined) continue;
    changes.push({ path: target.path.replace(/^who\./, `${who}.`), value });
  }
  if (docType === "insurance_policy") return changes;

  const person = subject === "self" ? current.person : current.partner;
  if (docType === "pension_certificate" && subject === "self")
    changes.push({ path: "pillar2.hasPensionFund", value: true });
  if (!person?.employment) changes.push({ path: `${who}.employment`, value: "employed" });
  const firstName = firstNameOf(nameOnDocument(values));
  if (!person?.firstName && firstName) changes.push({ path: `${who}.firstName`, value: firstName });
  return changes;
}

const FREQUENCY_FACTOR: Record<PremiumFrequency, number | null> = {
  annual: 1,
  semiannual: 2,
  quarterly: 4,
  monthly: 12,
  single: null,
};

export function annualPremium(
  premium: number | undefined,
  frequency: PremiumFrequency | undefined,
): number | null {
  if (premium === undefined) return null;
  const factor = FREQUENCY_FACTOR[frequency ?? "annual"];
  return factor === null ? null : Math.round(premium * factor * 100) / 100;
}

/**
 * Last day the cancellation letter must arrive. With yearly cancellation the next insurance
 * anniversary counts, otherwise the expiry date. Returns null when nothing is known.
 */
export function noticeDeadline(
  terms: {
    startDate?: string;
    endDate?: string;
    noticePeriodMonths?: number;
    annualCancellation?: boolean;
  },
  today: string,
): string | null {
  const months = terms.noticePeriodMonths;
  if (months === undefined) return null;
  const deadlineFor = (effective: string) => addDays(addMonths(effective, -months), -1);

  if (terms.annualCancellation && terms.startDate) {
    const [, mm, dd] = terms.startDate.split("-");
    for (let year = Number(today.slice(0, 4)); year <= Number(today.slice(0, 4)) + 2; year++) {
      const anniversary = `${year}-${mm}-${dd}`;
      if (terms.endDate && anniversary > addDays(terms.endDate, 1)) break;
      const deadline = deadlineFor(anniversary);
      if (deadline >= today) return deadline;
    }
  }
  if (terms.endDate) {
    const deadline = deadlineFor(addDays(terms.endDate, 1));
    return deadline >= today ? deadline : null;
  }
  return null;
}

export interface PolicyDraft {
  policyNumber: string | null;
  insurer: string;
  isExternal: boolean;
  category: PolicyCategory;
  productName: string;
  pillar: "3a" | "3b" | null;
  startDate: string | null;
  endDate: string | null;
  noticeDate: string | null;
  premiumAnnual: number | null;
  sumInsured: number | null;
  annuityAnnual: number | null;
  insuredPerson: string | null;
  details: Record<string, unknown>;
}

const str = (v: FieldValue | undefined) => (typeof v === "string" ? v : undefined);
const num = (v: FieldValue | undefined) => (typeof v === "number" ? v : undefined);

/** Cockpit policy for a confirmed policy or pension certificate; null for salary certificates. */
export function policyDraftFor(
  docType: ExtractableDocumentType,
  values: FieldValues,
  today: string,
): PolicyDraft | null {
  if (docType === "insurance_policy") {
    const insurer = str(values.insurer) ?? "?";
    const category = (str(values.category) as PolicyCategory | undefined) ?? "other";
    const pillarValue = category === "pillar3a" ? "3a" : str(values.pillar);
    const frequency = str(values.premiumFrequency) as PremiumFrequency | undefined;
    const premium = num(values.premium);
    return {
      policyNumber: str(values.policyNumber) ?? null,
      insurer,
      isExternal: !/\bpax\b/i.test(insurer),
      category,
      productName: str(values.productName) ?? insurer,
      pillar: pillarValue === "3a" || pillarValue === "3b" ? pillarValue : null,
      startDate: str(values.startDate) ?? null,
      endDate: str(values.endDate) ?? null,
      noticeDate: noticeDeadline(
        {
          startDate: str(values.startDate),
          endDate: str(values.endDate),
          noticePeriodMonths: num(values.noticePeriodMonths),
          annualCancellation: values.annualCancellation === true,
        },
        today,
      ),
      premiumAnnual: annualPremium(premium, frequency),
      sumInsured: num(values.sumInsured) ?? null,
      annuityAnnual: num(values.annuityAnnual) ?? null,
      insuredPerson: str(values.insuredPerson) ?? null,
      details: { ...values, ...(frequency === "single" ? { singlePremium: premium } : {}) },
    };
  }
  if (docType === "pension_certificate") {
    const fund = str(values.pensionFund) ?? "Pensionskasse";
    const year = yearOf(str(values.certificateDate));
    return {
      policyNumber: null,
      insurer: fund,
      isExternal: !/\bpax\b/i.test(fund),
      category: "pension_fund",
      productName: year ? `Vorsorgeausweis ${year}` : "Vorsorgeausweis",
      pillar: null,
      startDate: null,
      endDate: null,
      noticeDate: null,
      premiumAnnual: null,
      sumInsured: num(values.deathLumpSum) ?? null,
      annuityAnnual: num(values.projectedPensionAtRetirement) ?? null,
      insuredPerson: str(values.insuredPerson) ?? null,
      details: { ...values },
    };
  }
  return null;
}

import { type DocumentType, POLICY_CATEGORIES } from "@/lib/domain/taxonomy";

/**
 * The fields we read from each supported document type. Single source of truth for the
 * extraction schema (server), the review card (labels, grouping, inputs) and the mapping into
 * the customer profile. Labels live in `messages/<locale>/documents.json` under
 * `fields.<docType>.<key>`; `describe` is the instruction for the model (English).
 */

export type FieldKind = "chf" | "percent" | "date" | "text" | "integer" | "enum" | "boolean";

export interface FieldDef {
  key: string;
  kind: FieldKind;
  group: string;
  describe: string;
  options?: readonly string[];
}

export type ExtractableDocumentType = Exclude<DocumentType, "other">;

export const PREMIUM_FREQUENCIES = [
  "annual",
  "semiannual",
  "quarterly",
  "monthly",
  "single",
] as const;
export type PremiumFrequency = (typeof PREMIUM_FREQUENCIES)[number];

export const POLICY_PILLARS = ["3a", "3b", "none"] as const;

const pensionCertificate: FieldDef[] = [
  { key: "pensionFund", kind: "text", group: "person", describe: "Name of the pension fund" },
  { key: "employer", kind: "text", group: "person", describe: "Employer (affiliated company)" },
  {
    key: "insuredPerson",
    kind: "text",
    group: "person",
    describe: "Full name of the insured person",
  },
  { key: "birthDate", kind: "date", group: "person", describe: "Birth date of the insured person" },
  {
    key: "certificateDate",
    kind: "date",
    group: "person",
    describe: "Reference date of the certificate (Stichtag / gültig ab)",
  },
  {
    key: "workloadPercent",
    kind: "percent",
    group: "person",
    describe: "Employment level in percent (Beschäftigungsgrad), e.g. 90",
  },
  {
    key: "grossSalary",
    kind: "chf",
    group: "salary",
    describe: "Annual gross salary reported to the fund (AHV-Jahreslohn / massgebender Lohn)",
  },
  {
    key: "insuredSalary",
    kind: "chf",
    group: "salary",
    describe: "Insured salary for savings (versicherter Lohn), annual",
  },
  {
    key: "currentCapital",
    kind: "chf",
    group: "retirement",
    describe:
      "Current retirement savings capital (Altersguthaben / Sparguthaben) on the reference date",
  },
  {
    key: "projectedCapitalAtRetirement",
    kind: "chf",
    group: "retirement",
    describe:
      "Projected retirement capital at ordinary retirement age (with interest, if both given)",
  },
  {
    key: "projectedPensionAtRetirement",
    kind: "chf",
    group: "retirement",
    describe: "Projected annual retirement pension at ordinary retirement age",
  },
  {
    key: "retirementAge",
    kind: "integer",
    group: "retirement",
    describe: "Ordinary retirement age used for the projection",
  },
  {
    key: "disabilityPension",
    kind: "chf",
    group: "risk",
    describe: "Annual disability pension (Invalidenrente)",
  },
  {
    key: "partnerPension",
    kind: "chf",
    group: "risk",
    describe: "Annual spouse/partner pension on death (Ehegatten-/Partnerrente)",
  },
  {
    key: "childPension",
    kind: "chf",
    group: "risk",
    describe: "Annual orphan's or disabled person's child pension per child (Waisen-/Kinderrente)",
  },
  {
    key: "deathLumpSum",
    kind: "chf",
    group: "risk",
    describe: "Additional lump sum paid on death (Todesfallkapital); 0 if explicitly none",
  },
  {
    key: "maxBuyIn",
    kind: "chf",
    group: "contributions",
    describe: "Maximum possible voluntary buy-in (maximal möglicher Einkauf)",
  },
  {
    key: "employeeContribution",
    kind: "chf",
    group: "contributions",
    describe: "Employee contributions per year (total, convert monthly amounts to annual)",
  },
  {
    key: "employerContribution",
    kind: "chf",
    group: "contributions",
    describe: "Employer contributions per year (total, convert monthly amounts to annual)",
  },
];

const insurancePolicy: FieldDef[] = [
  { key: "insurer", kind: "text", group: "contract", describe: "Insurance company" },
  { key: "productName", kind: "text", group: "contract", describe: "Product or tariff name" },
  { key: "policyNumber", kind: "text", group: "contract", describe: "Policy number" },
  {
    key: "category",
    kind: "enum",
    group: "contract",
    options: POLICY_CATEGORIES,
    describe:
      "Main cover: pillar3a (tied 3a savings/life), savings_3b (endowment), risk_death (term life), risk_disability (disability income), payout_plan, child, care, pension_fund, nonlife_household, nonlife_liability, nonlife_motor, health, other",
  },
  {
    key: "pillar",
    kind: "enum",
    group: "contract",
    options: POLICY_PILLARS,
    describe: "3a (gebundene Vorsorge), 3b (freie Vorsorge) or none for non-life/health",
  },
  { key: "insuredPerson", kind: "text", group: "contract", describe: "Insured person's full name" },
  {
    key: "insuredBirthDate",
    kind: "date",
    group: "contract",
    describe: "Insured person's birth date",
  },
  {
    key: "sumInsured",
    kind: "chf",
    group: "cover",
    describe: "Main sum insured (death capital for life policies, sum insured for non-life)",
  },
  {
    key: "annuityAnnual",
    kind: "chf",
    group: "cover",
    describe: "Insured annual pension (e.g. disability income pension per year)",
  },
  {
    key: "waitingPeriodMonths",
    kind: "integer",
    group: "cover",
    describe: "Waiting period of a disability pension in months",
  },
  {
    key: "beneficiaries",
    kind: "text",
    group: "cover",
    describe: "Beneficiaries in case of death, as written",
  },
  {
    key: "surrenderValue",
    kind: "chf",
    group: "cover",
    describe: "Current surrender value (Rückkaufswert); 0 if the policy states it has none",
  },
  {
    key: "premium",
    kind: "chf",
    group: "premium",
    describe: "Premium amount per payment as stated, for the frequency below",
  },
  {
    key: "premiumFrequency",
    kind: "enum",
    group: "premium",
    options: PREMIUM_FREQUENCIES,
    describe: "How often the premium above is paid",
  },
  { key: "startDate", kind: "date", group: "term", describe: "Start of the contract" },
  { key: "endDate", kind: "date", group: "term", describe: "End / expiry of the contract" },
  {
    key: "noticePeriodMonths",
    kind: "integer",
    group: "term",
    describe: "Notice period in months for cancellation",
  },
  {
    key: "annualCancellation",
    kind: "boolean",
    group: "term",
    describe:
      "true if the contract can be cancelled every year at the end of the insurance year (not only at expiry)",
  },
];

const salaryCertificate: FieldDef[] = [
  { key: "employer", kind: "text", group: "salary", describe: "Employer name" },
  { key: "employeeName", kind: "text", group: "salary", describe: "Employee's full name" },
  { key: "year", kind: "integer", group: "salary", describe: "Year the certificate covers" },
  {
    key: "grossSalary",
    kind: "chf",
    group: "salary",
    describe: "Gross salary total (Bruttolohn total, Ziffer 8)",
  },
  {
    key: "netSalary",
    kind: "chf",
    group: "salary",
    describe: "Net salary (Nettolohn, Ziffer 11)",
  },
  {
    key: "pensionContributions",
    kind: "chf",
    group: "salary",
    describe: "Ordinary pension fund contributions (BVG ordentliche Beiträge, Ziffer 10.1)",
  },
];

export const DOCUMENT_FIELDS: Record<ExtractableDocumentType, FieldDef[]> = {
  pension_certificate: pensionCertificate,
  insurance_policy: insurancePolicy,
  salary_certificate: salaryCertificate,
};

/** Group order for the review card. */
export const FIELD_GROUPS: Record<ExtractableDocumentType, string[]> = {
  pension_certificate: ["person", "salary", "retirement", "risk", "contributions"],
  insurance_policy: ["contract", "cover", "premium", "term"],
  salary_certificate: ["salary"],
};

export function isExtractable(docType: DocumentType | null): docType is ExtractableDocumentType {
  return docType !== null && docType !== "other";
}

export function fieldDef(docType: ExtractableDocumentType, key: string): FieldDef | undefined {
  return DOCUMENT_FIELDS[docType].find((f) => f.key === key);
}

/** Extra, non-schema field holding the model's one-line description of the document. */
export const DESCRIPTION_PATH = "description";

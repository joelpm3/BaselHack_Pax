import { z } from "zod";

/**
 * The customer's life situation. Every field is optional because the profile fills up
 * over the conversation (and from confirmed documents). Amounts are CHF per year unless noted.
 * Stored as JSON in `profiles.data`; every change is also written to `profile_events`.
 */

export const maritalStatusSchema = z.enum([
  "single",
  "married",
  "registered_partnership",
  "cohabiting",
  "divorced",
  "widowed",
]);

export const employmentSchema = z.enum([
  "employed",
  "self_employed",
  "unemployed",
  "student",
  "homemaker",
  "retired",
]);

export const sexSchema = z.enum(["male", "female"]);

export const personSchema = z.object({
  firstName: z.string().optional(),
  birthYear: z.number().int().min(1920).max(2030).optional(),
  sex: sexSchema.optional(),
  maritalStatus: maritalStatusSchema.optional(),
  employment: employmentSchema.optional(),
  workloadPercent: z.number().min(0).max(100).optional(),
  grossIncome: z.number().min(0).optional(),
  occupation: z.string().optional(),
  smoker: z.boolean().optional(),
  /** Free text only when the customer volunteers it; triggers human review rules. */
  healthNotes: z.string().optional(),
});
export type Person = z.infer<typeof personSchema>;

export const childSchema = z.object({
  birthYear: z.number().int().min(1990).max(2035),
  /** Year education ends; orphan's pensions run until then (max. age 25). */
  educationUntil: z.number().int().optional(),
});

export const plannedEventSchema = z.object({
  type: z.enum([
    "child",
    "home_purchase",
    "marriage",
    "early_retirement",
    "self_employment",
    "sabbatical",
    "divorce",
    "inheritance",
    "other",
  ]),
  year: z.number().int().optional(),
  note: z.string().optional(),
});
export type PlannedEvent = z.infer<typeof plannedEventSchema>;

export const goalSchema = z.enum([
  "protect_family",
  "retire_comfortably",
  "retire_early",
  "buy_home",
  "save_taxes",
  "build_wealth",
  "support_children",
  "secure_income_disability",
]);
export type Goal = z.infer<typeof goalSchema>;

export const lifeSituationSchema = z.object({
  person: personSchema.default({}),
  partner: personSchema.optional(),
  children: z.array(childSchema).default([]),
  residence: z
    .object({
      zip: z.string().optional(),
      city: z.string().optional(),
      canton: z.string().length(2).optional(),
      /** Logismata tax location id, resolved via APICalc_searchLocation. */
      taxLocationId: z.number().int().optional(),
    })
    .default({}),
  assets: z
    .object({
      liquid: z.number().min(0).optional(),
      securities: z.number().min(0).optional(),
      realEstateValue: z.number().min(0).optional(),
      mortgage: z.number().min(0).optional(),
      /** Net wealth when the customer only gives a total. */
      total: z.number().optional(),
    })
    .default({}),
  pillar1: z
    .object({
      /** Missing AHV contribution years, if known. */
      contributionGapYears: z.number().int().min(0).optional(),
    })
    .default({}),
  pillar2: z
    .object({
      hasPensionFund: z.boolean().optional(),
      insuredSalary: z.number().min(0).optional(),
      currentCapital: z.number().min(0).optional(),
      projectedCapitalAtRetirement: z.number().min(0).optional(),
      projectedPensionAtRetirement: z.number().min(0).optional(),
      disabilityPension: z.number().min(0).optional(),
      partnerPension: z.number().min(0).optional(),
      childPension: z.number().min(0).optional(),
      deathLumpSum: z.number().min(0).optional(),
      maxBuyIn: z.number().min(0).optional(),
    })
    .default({}),
  pillar3a: z
    .object({
      balance: z.number().min(0).optional(),
      annualContribution: z.number().min(0).optional(),
    })
    .default({}),
  goals: z.array(goalSchema).default([]),
  plannedEvents: z.array(plannedEventSchema).default([]),
  /** The customer's own words on what worries them. */
  concerns: z.array(z.string()).default([]),
  riskAttitude: z.enum(["low", "medium", "high"]).optional(),
  desiredRetirementAge: z.number().int().min(55).max(70).optional(),
});
export type LifeSituation = z.infer<typeof lifeSituationSchema>;

export function emptyLifeSituation(): LifeSituation {
  return lifeSituationSchema.parse({});
}

/** Fields needed before Logismata risk/retirement checks are meaningful. */
const CORE_FIELDS: Array<(p: LifeSituation) => unknown> = [
  (p) => p.person.birthYear,
  (p) => p.person.sex,
  (p) => p.person.maritalStatus,
  (p) => p.person.employment,
  (p) => p.person.grossIncome,
  (p) => p.residence.taxLocationId ?? p.residence.zip,
  (p) => p.goals.length || p.concerns.length || undefined,
  (p) => p.assets.total ?? p.assets.liquid,
  (p) => p.pillar3a.annualContribution ?? p.pillar3a.balance,
  (p) => p.pillar2.hasPensionFund,
];

/** 0–100, how much of the core picture is known. Drives the "Vorsorgebild" fill level. */
export function profileCompleteness(profile: LifeSituation): number {
  const known = CORE_FIELDS.filter((get) => get(profile) !== undefined).length;
  return Math.round((known / CORE_FIELDS.length) * 100);
}

export function ageInYear(birthYear: number | undefined, year: number): number | undefined {
  return birthYear === undefined ? undefined : year - birthYear;
}

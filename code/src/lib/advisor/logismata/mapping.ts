import type { LifeSituation, Partner, Person, Pillar2 } from "@/lib/domain/profile";
import type { IncomeBreakdown, RiskCause } from "../types";

/**
 * Pure mapping between the customer's LifeSituation and Logismata APICalc requests/responses.
 * Assumptions follow the Pax Vorsorgecheck (challenge_context/MATERIAL.md §3): long-term need
 * 80% of gross income, survivors' need 70%, BVG interest 1%.
 */

export const NEED_PERCENT = 80;
export const DEATH_NEED_PERCENT = 70;
export const INTEREST_RATE = 1;
export const CONVERSION_RATE = 6;
export const REGULAR_RETIREMENT_AGE = 65;
export const MAX_3A_WITH_PENSION_FUND = 7258;
export const MAX_3A_WITHOUT_PENSION_FUND = 36288;
/** BVG entry threshold: below this salary there is usually no pension fund. */
export const BVG_ENTRY_THRESHOLD = 22680;
const NO_CONFESSION = 4;

const SEX = { male: 1, female: 2 } as const;

export type RelationshipCode = 1 | 2 | 3 | 4;

/** 1=single, 2=married, 3=cohabiting (Konkubinat), 4=registered partnership. */
export function relationshipCode(profile: LifeSituation): RelationshipCode {
  switch (profile.person.maritalStatus) {
    case "married":
      return 2;
    case "cohabiting":
      return 3;
    case "registered_partnership":
      return 4;
    default:
      return 1;
  }
}

export function hasPartner(profile: LifeSituation): boolean {
  return relationshipCode(profile) !== 1;
}

/** Married and registered partners are taxed jointly; cohabiting partners are not. */
export function isJointlyTaxed(profile: LifeSituation): boolean {
  const code = relationshipCode(profile);
  return code === 2 || code === 4;
}

/** Children who would still receive an orphan's pension (until education ends, default 18). */
export function dependentChildren(profile: LifeSituation, year: number): number {
  return profile.children.filter((c) => (c.educationUntil ?? c.birthYear + 18) >= year).length;
}

export function hasDependants(profile: LifeSituation, year: number): boolean {
  return hasPartner(profile) || dependentChildren(profile, year) > 0;
}

export function withBvg(person: Person | undefined, explicit?: boolean): boolean {
  if (explicit !== undefined) return explicit;
  if (!person) return false;
  return person.employment === "employed" && (person.grossIncome ?? 0) >= BVG_ENTRY_THRESHOLD;
}

const NO_INCOME_EMPLOYMENT = new Set(["homemaker", "unemployed", "student", "retired"]);

function incomeOf(person: Person | undefined): number | undefined {
  if (!person) return undefined;
  if (person.grossIncome !== undefined) return person.grossIncome;
  return person.employment && NO_INCOME_EMPLOYMENT.has(person.employment) ? 0 : undefined;
}

export type Check = "retirement" | "risk" | "tax";

/** Profile paths that must be known before a Logismata check can run. */
export function missingFor(profile: LifeSituation, check: Check): string[] {
  const missing: string[] = [];
  const { person, partner } = profile;
  if (person.birthYear === undefined) missing.push("person.birthYear");
  if (person.sex === undefined) missing.push("person.sex");
  if (person.maritalStatus === undefined) missing.push("person.maritalStatus");
  if (incomeOf(person) === undefined) missing.push("person.grossIncome");
  if (check !== "tax" && hasPartner(profile)) {
    if (partner?.birthYear === undefined) missing.push("partner.birthYear");
    if (partner?.sex === undefined) missing.push("partner.sex");
    if (incomeOf(partner) === undefined) missing.push("partner.grossIncome");
  }
  if (check === "tax") {
    if (isJointlyTaxed(profile) && incomeOf(partner) === undefined)
      missing.push("partner.grossIncome");
    const { residence } = profile;
    if (residence.taxLocationId === undefined && !residence.zip && !residence.city)
      missing.push("residence.zip");
  }
  return missing;
}

/** Not in the profile: assume the relationship has lasted five years (affects survivors' pensions). */
export function relationshipSinceYear(profile: LifeSituation, year: number): number {
  const births = [profile.person.birthYear, profile.partner?.birthYear].filter(
    (y): y is number => y !== undefined,
  );
  const adult = births.length ? Math.max(...births) + 18 : 1940;
  return Math.min(year, Math.max(1940, adult, year - 5));
}

export function retirementAge(profile: LifeSituation): number {
  return profile.desiredRetirementAge ?? REGULAR_RETIREMENT_AGE;
}

export function yearsUntilRetirement(profile: LifeSituation, year: number, age?: number): number {
  const birthYear = profile.person.birthYear ?? year - 40;
  return Math.max(1, (age ?? retirementAge(profile)) - (year - birthYear));
}

/** Liquid assets incl. the 3a balance (paid out at retirement). */
export function currentFortune(profile: LifeSituation): number {
  const { assets, pillar3a } = profile;
  const base =
    assets.total ??
    (assets.liquid !== undefined || assets.securities !== undefined
      ? (assets.liquid ?? 0) + (assets.securities ?? 0)
      : 0);
  return Math.max(0, base + (pillar3a.balance ?? 0));
}

export function householdIncome(profile: LifeSituation): number {
  const own = incomeOf(profile.person) ?? 0;
  return isJointlyTaxed(profile) ? own + (incomeOf(profile.partner) ?? 0) : own;
}

export function max3a(profile: LifeSituation): number {
  if (withBvg(profile.person, profile.pillar2.hasPensionFund)) return MAX_3A_WITH_PENSION_FUND;
  return Math.min(MAX_3A_WITHOUT_PENSION_FUND, Math.round((incomeOf(profile.person) ?? 0) * 0.2));
}

// ─── Requests ───────────────────────────────────────────────────────────────

function basePerson(person: Person, explicitBvg?: boolean) {
  return {
    Sex: person.sex ? SEX[person.sex] : SEX.male,
    BirthYear: person.birthYear ?? 1980,
    GrossIncome: incomeOf(person) ?? 0,
    WithBVG: withBvg(person, explicitBvg),
  };
}

function relationshipFields(profile: LifeSituation, year: number) {
  return {
    Relationship: relationshipCode(profile),
    RelationshipSinceYear: relationshipSinceYear(profile, year),
  };
}

export interface RetirementPensions {
  /** Yearly BVG retirement pension of person 1 / 2 (from certificate or RetirementBase estimate). */
  person1: number;
  person2?: number;
  capital1?: number;
  capital2?: number;
}

/** The partner taken into account by Logismata (person 2), if any. */
function partnerOf(profile: LifeSituation): Partner | undefined {
  return hasPartner(profile) ? profile.partner : undefined;
}

/** Person 2 with the BVG flag from the partner's own pension certificate, if known. */
function basePartner(partner: Partner) {
  return basePerson(partner, partner.pillar2?.hasPensionFund);
}

export function buildRetirementBaseRequest(profile: LifeSituation, year: number) {
  const request: Record<string, unknown> = {
    ...relationshipFields(profile, year),
    Person1: {
      ...basePerson(profile.person, profile.pillar2.hasPensionFund),
      RetirementPillar2: { Pension: 0, CurrentCapital: profile.pillar2.currentCapital ?? 0 },
    },
  };
  const partner = partnerOf(profile);
  if (partner) {
    request.Person2 = {
      ...basePartner(partner),
      RetirementPillar2: { Pension: 0, CurrentCapital: partner.pillar2?.currentCapital ?? 0 },
    };
  }
  return request;
}

export interface RetirementOverrides {
  retirementAge?: number;
  /** Added to the current fortune (negative for a 3a withdrawal). */
  fortuneDelta?: number;
  /** Yearly saving instead of the 3a contribution on file. */
  saving?: number;
}

export function buildRetirementRequest(
  profile: LifeSituation,
  year: number,
  pensions: RetirementPensions,
  overrides: RetirementOverrides = {},
) {
  const age = overrides.retirementAge ?? profile.desiredRetirementAge;
  const request: Record<string, unknown> = {
    ...relationshipFields(profile, year),
    Person1: {
      ...basePerson(profile.person, profile.pillar2.hasPensionFund),
      RetirementPillar2: {
        Pension: Math.max(0, Math.round(pensions.person1)),
        CurrentCapital: pensions.capital1 ?? profile.pillar2.currentCapital ?? 0,
      },
      ...(age !== undefined ? { DesiredRetirementAge: age } : {}),
    },
    CurrentFortune: Math.max(0, currentFortune(profile) + (overrides.fortuneDelta ?? 0)),
    InterestRate: INTEREST_RATE,
    Saving: Math.max(0, overrides.saving ?? profile.pillar3a.annualContribution ?? 0),
    NeedInPcRetirement: true,
    NeedRetirement: NEED_PERCENT,
  };
  const partner = partnerOf(profile);
  if (partner) {
    const capital = pensions.capital2 ?? partner.pillar2?.currentCapital;
    request.Person2 = {
      ...basePartner(partner),
      RetirementPillar2: {
        Pension: Math.max(0, Math.round(pensions.person2 ?? 0)),
        ...(capital !== undefined ? { CurrentCapital: capital } : {}),
      },
    };
  }
  return request;
}

export interface Pillar2RiskPensions {
  Disability: number;
  DisabilityChildren: number;
  Widow: number;
  Orphan: number;
  CoverageCapital?: number;
}

/** True when a pension certificate gave at least one risk benefit. */
export function hasKnownRiskPensions(p: Pillar2 | undefined): boolean {
  return (
    p?.disabilityPension !== undefined ||
    p?.partnerPension !== undefined ||
    p?.childPension !== undefined
  );
}

/** Known certificate values on top of Logismata's estimate (RiskBase). */
export function mergeRiskPensions(p: Pillar2, estimate: Pillar2RiskPensions): Pillar2RiskPensions {
  return {
    ...estimate,
    Disability: p.disabilityPension ?? estimate.Disability,
    DisabilityChildren: p.childPension ?? estimate.DisabilityChildren,
    Widow: p.partnerPension ?? estimate.Widow,
    Orphan: p.childPension ?? estimate.Orphan,
  };
}

/**
 * Whether the risk check rests on estimated pension-fund benefits: someone in the household
 * has (or is assumed to have) a pension fund, but no certificate gave their risk benefits.
 */
export function riskPensionsEstimated(profile: LifeSituation): boolean {
  const ownEstimated =
    withBvg(profile.person, profile.pillar2.hasPensionFund) &&
    !hasKnownRiskPensions(profile.pillar2);
  const partner = partnerOf(profile);
  const partnerEstimated =
    partner !== undefined &&
    withBvg(partner, partner.pillar2?.hasPensionFund) &&
    !hasKnownRiskPensions(partner.pillar2);
  return ownEstimated || partnerEstimated;
}

export interface RiskOverrides {
  extraChildren?: number;
  /** Pension-fund risk benefits of person 1 (the customer). */
  pillar2Pensions?: Pillar2RiskPensions;
  /** Pension-fund risk benefits of person 2 (the partner). */
  partnerPillar2Pensions?: Pillar2RiskPensions;
}

export function buildRiskRequest(
  profile: LifeSituation,
  year: number,
  overrides: RiskOverrides = {},
) {
  const children = dependentChildren(profile, year) + (overrides.extraChildren ?? 0);
  const partner = partnerOf(profile);
  const deathNeed = (dependants: boolean) => (dependants ? DEATH_NEED_PERCENT : 0);
  const needs = (deathPercent: number) => ({
    NeedInPcDisability: true,
    NeedDisability: NEED_PERCENT,
    NeedInPcDeath: true,
    NeedDeath: deathPercent,
  });
  const request: Record<string, unknown> = {
    ...relationshipFields(profile, year),
    Person1: {
      ...basePerson(profile.person, profile.pillar2.hasPensionFund),
      NumberOfChildren: partner ? 0 : children,
      ...(overrides.pillar2Pensions ? { Pillar2Pensions: overrides.pillar2Pensions } : {}),
      ...needs(deathNeed(Boolean(partner) || children > 0)),
    },
    NumberOfChildren: partner ? children : 0,
    WithChildren: children > 0,
  };
  if (partner) {
    request.Person2 = {
      ...basePartner(partner),
      NumberOfChildren: 0,
      ...(overrides.partnerPillar2Pensions
        ? { Pillar2Pensions: overrides.partnerPillar2Pensions }
        : {}),
      ...needs(DEATH_NEED_PERCENT),
    };
  }
  return request;
}

export function buildRiskBaseRequest(profile: LifeSituation, year: number) {
  const children = dependentChildren(profile, year);
  const partner = partnerOf(profile);
  return {
    ...relationshipFields(profile, year),
    Person1: {
      ...basePerson(profile.person, profile.pillar2.hasPensionFund),
      NumberOfChildren: partner ? 0 : children,
    },
    NumberOfChildren: partner ? children : 0,
    ...(partner ? { Person2: { ...basePartner(partner), NumberOfChildren: 0 } } : {}),
  };
}

function taxFields(profile: LifeSituation, year: number) {
  return {
    IncomeType: 1,
    Income: householdIncome(profile),
    TaxLocationID: profile.residence.taxLocationId ?? 0,
    Relationship: relationshipCode(profile),
    Confession1: NO_CONFESSION,
    Confession2: NO_CONFESSION,
    NumberOfChildren: dependentChildren(profile, year),
    Sex: profile.person.sex ? SEX[profile.person.sex] : SEX.male,
    BirthYear: profile.person.birthYear ?? 1980,
  };
}

export function buildSaving3aRequest(
  profile: LifeSituation,
  year: number,
  options: { yearlyAmount: number; retirementAge?: number },
) {
  return {
    Duration: yearsUntilRetirement(profile, year, options.retirementAge),
    InitialInvestment: profile.pillar3a.balance ?? 0,
    YearlyInvestment: Math.max(0, options.yearlyAmount),
    InterestRate: INTEREST_RATE,
    ...taxFields(profile, year),
  };
}

export function buildPurchaseP2Request(
  profile: LifeSituation,
  year: number,
  options: { amount: number; years: number },
) {
  return {
    Investment: Math.max(0, options.amount),
    PaymentDuration: Math.max(1, Math.round(options.years)),
    InterestRate: INTEREST_RATE,
    ConversionRate: CONVERSION_RATE,
    ...taxFields(profile, year),
  };
}

// ─── Responses ──────────────────────────────────────────────────────────────

export interface RetirementResponse {
  ErrorCode?: number;
  GrossIncome?: number;
  IncomeNeed?: number;
  IncomeGap?: number;
  IncomeTotal?: number;
  IncomePillar1?: number;
  IncomePillar2?: number;
  IncomeWithdrawal?: number;
  AvailableFortune?: number;
  CapitalNeed?: number;
  CapitalGap?: number;
}

export interface RiskScenarioSummary {
  Scenario?: number;
  ErrorCode?: number;
  GrossIncome?: number;
  IncomeNeed?: number;
  IncomeGap?: number;
  IncomeSurplus?: number;
  IncomeTotal?: number;
  IncomePillar1?: number;
  IncomePillar2?: number;
  IncomePartner?: number;
  CapitalGap?: number;
}

const n = (v: number | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function retirementBreakdown(res: RetirementResponse): IncomeBreakdown {
  const need = n(res.IncomeNeed);
  const total = n(res.IncomeTotal);
  return {
    grossIncome: n(res.GrossIncome),
    need,
    pillar1: n(res.IncomePillar1),
    pillar2: n(res.IncomePillar2),
    other: n(res.IncomeWithdrawal),
    partner: 0,
    total,
    gap: n(res.IncomeGap),
    surplus: Math.max(0, total - need),
    capitalGap: n(res.CapitalGap),
  };
}

export function riskBreakdown(summary: RiskScenarioSummary): IncomeBreakdown {
  return {
    grossIncome: n(summary.GrossIncome),
    need: n(summary.IncomeNeed),
    pillar1: n(summary.IncomePillar1),
    pillar2: n(summary.IncomePillar2),
    other: 0,
    partner: n(summary.IncomePartner),
    total: n(summary.IncomeTotal),
    gap: n(summary.IncomeGap),
    surplus: n(summary.IncomeSurplus),
    capitalGap: n(summary.CapitalGap),
  };
}

/** Logismata risk scenario codes 1–8. */
export function describeRiskScenario(
  code: number,
): { person: 1 | 2; event: "disability" | "death"; cause: RiskCause } | null {
  if (!Number.isInteger(code) || code < 1 || code > 8) return null;
  const i = code - 1;
  return {
    person: i < 4 ? 1 : 2,
    event: i % 4 < 2 ? "disability" : "death",
    cause: i % 2 === 0 ? "illness" : "accident",
  };
}

/** ErrorCode 8/9: the person is (almost) retired; 0/1 mean OK. */
export function isRetiredError(code: number | undefined): boolean {
  return code === 8 || code === 9;
}

export function emptyBreakdown(): IncomeBreakdown {
  return {
    grossIncome: 0,
    need: 0,
    pillar1: 0,
    pillar2: 0,
    other: 0,
    partner: 0,
    total: 0,
    gap: 0,
    surplus: 0,
    capitalGap: 0,
  };
}

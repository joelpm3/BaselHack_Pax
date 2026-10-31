import "server-only";
import type { LifeSituation } from "@/lib/domain/profile";
import type { Locale } from "@/lib/domain/taxonomy";
import { type CallContext, callLogismata, LOGISMATA } from "@/lib/logismata/client";
import { type Pillar3aSaving, pillar3aSaving } from "../pillar3a";
import { pillar3aPolicies } from "../policies";
import {
  buildGrowthRequest,
  buildSavingRequest,
  type SavingResponse,
  type SavingsPlanOutput,
  type SavingsPlanParams,
  savingsPlanFromResponse,
} from "../savings-plan";
import type { IncomeBreakdown, RiskPersonResult } from "../types";
import {
  buildCapitalTaxRequest,
  buildPurchaseP2Request,
  buildRetirementBaseRequest,
  buildRetirementRequest,
  buildRiskBaseRequest,
  buildRiskRequest,
  buildSaving3aRequest,
  hasKnownRiskPensions,
  hasPartner,
  mergeRiskPensions,
  type Pillar2RiskPensions,
  type RetirementOverrides,
  type RetirementPensions,
  type RetirementResponse,
  type RiskOverrides,
  type RiskScenarioSummary,
  retirementAge,
  retirementBreakdown,
  riskPensionsEstimated,
  riskPersons,
  withBvg,
} from "./mapping";

/**
 * The Logismata checks the advisor runs. Every call goes through callLogismata, so each one is
 * logged in `calculations` with the conversation and tool call that triggered it.
 */

export function currentYear(): number {
  return new Date().getFullYear();
}

/** Suffix for calculation log entries that belong to a what-if scenario, not the real picture. */
export const SCENARIO_SUFFIX = ":scenario";

interface BaseResponse {
  Person1?: { Pension?: number; CurrentCapital?: number };
  Person2?: { Pension?: number; CurrentCapital?: number };
}

/** BVG retirement pensions from the certificate, or Logismata's estimate where unknown. */
export async function retirementPensions(
  profile: LifeSituation,
  ctx: CallContext,
  year = currentYear(),
): Promise<RetirementPensions & { estimated: boolean }> {
  const known = profile.pillar2.projectedPensionAtRetirement;
  const needsOwn = known === undefined && withBvg(profile.person, profile.pillar2.hasPensionFund);
  const partner = hasPartner(profile) ? profile.partner : undefined;
  const partnerKnown = partner?.pillar2?.projectedPensionAtRetirement;
  const needsPartner =
    partnerKnown === undefined && withBvg(partner, partner?.pillar2?.hasPensionFund);
  if (!needsOwn && !needsPartner) {
    return {
      person1: known ?? 0,
      person2: partnerKnown ?? 0,
      capital2: partner?.pillar2?.currentCapital,
      estimated: false,
    };
  }
  const base = await callLogismata<BaseResponse>(
    "APICalc_calculateRetirementBase",
    buildRetirementBaseRequest(profile, year),
    ctx,
  );
  return {
    person1: known ?? base.Person1?.Pension ?? 0,
    capital1: profile.pillar2.currentCapital ?? base.Person1?.CurrentCapital,
    person2: partnerKnown ?? base.Person2?.Pension ?? 0,
    capital2: partner?.pillar2?.currentCapital,
    estimated: needsOwn || needsPartner,
  };
}

export interface RetirementCheck {
  breakdown: IncomeBreakdown;
  response: RetirementResponse;
  retirementAge: number;
  retirementYear: number;
  estimated: boolean;
  /** How the yearly 3a saving was derived (null when the caller set the saving). */
  saving: Pillar3aSaving | null;
}

export async function runRetirementCheck(
  profile: LifeSituation,
  ctx: CallContext,
  overrides: RetirementOverrides = {},
  pensions?: RetirementPensions & { estimated: boolean },
): Promise<RetirementCheck> {
  const year = currentYear();
  const resolved = pensions ?? (await retirementPensions(profile, ctx, year));
  // Only the saved part of the 3a counts: insurance 3a risk premiums and policies that end don't.
  const saving =
    overrides.saving === undefined && ctx.customerId
      ? pillar3aSaving(profile, pillar3aPolicies(ctx.customerId), year)
      : null;
  const response = await callLogismata<RetirementResponse>(
    "APICalc_calculateRetirement",
    buildRetirementRequest(profile, year, resolved, {
      ...overrides,
      ...(saving ? { saving: saving.annualSaving } : {}),
    }),
    ctx,
  );
  if (response.ErrorCode === 2) throw new Error("Logismata retirement check failed (2)");
  const age = overrides.retirementAge ?? retirementAge(profile);
  return {
    breakdown: retirementBreakdown(response),
    response,
    retirementAge: age,
    retirementYear: (profile.person.birthYear ?? year) + age,
    estimated: resolved.estimated,
    saving,
  };
}

interface RiskBaseResponse {
  Person1?: Partial<Pillar2RiskPensions>;
  Person2?: Partial<Pillar2RiskPensions>;
}

function estimateOf(p: Partial<Pillar2RiskPensions> = {}): Pillar2RiskPensions {
  return {
    Disability: p.Disability ?? 0,
    DisabilityChildren: p.DisabilityChildren ?? 0,
    Widow: p.Widow ?? 0,
    Orphan: p.Orphan ?? 0,
    ...(p.CoverageCapital !== undefined ? { CoverageCapital: p.CoverageCapital } : {}),
  };
}

/**
 * Pension-fund risk benefits from the certificates on file (customer and partner), completed
 * with Logismata's estimate for what a certificate does not state.
 */
async function riskPensions(
  profile: LifeSituation,
  ctx: CallContext,
  year: number,
): Promise<Pick<RiskOverrides, "pillar2Pensions" | "partnerPillar2Pensions">> {
  const partner = hasPartner(profile) ? profile.partner : undefined;
  const ownKnown = hasKnownRiskPensions(profile.pillar2);
  const partnerKnown = hasKnownRiskPensions(partner?.pillar2);
  if (!ownKnown && !partnerKnown) return {};
  const base = await callLogismata<RiskBaseResponse>(
    "APICalc_calculateRiskBase",
    buildRiskBaseRequest(profile, year),
    ctx,
  );
  return {
    ...(ownKnown
      ? { pillar2Pensions: mergeRiskPensions(profile.pillar2, estimateOf(base.Person1)) }
      : {}),
    ...(partnerKnown && partner?.pillar2
      ? { partnerPillar2Pensions: mergeRiskPensions(partner.pillar2, estimateOf(base.Person2)) }
      : {}),
  };
}

export interface RiskCheck {
  persons: RiskPersonResult[];
  estimated: boolean;
}

export async function runRiskCheck(
  profile: LifeSituation,
  ctx: CallContext,
  overrides: Omit<RiskOverrides, "pillar2Pensions" | "partnerPillar2Pensions"> = {},
): Promise<RiskCheck> {
  const year = currentYear();
  const pensions = await riskPensions(profile, ctx, year);
  const response = await callLogismata<{ RiskScenarioSummaries?: RiskScenarioSummary[] }>(
    "APICalc_calculateRisk",
    buildRiskRequest(profile, year, { ...overrides, ...pensions }),
    ctx,
  );
  return {
    persons: riskPersons(response.RiskScenarioSummaries ?? [], profile),
    estimated: riskPensionsEstimated(profile),
  };
}

export interface Saving3aResponse {
  YearlyTaxSavings?: number;
  OverallTaxSavings?: number;
  GrossCapital?: number;
  NetCapital?: number;
  CapitalTax?: number;
}

export async function runSaving3a(
  profile: LifeSituation,
  ctx: CallContext,
  options: { yearlyAmount: number; retirementAge?: number },
) {
  const request = buildSaving3aRequest(profile, currentYear(), options);
  const response = await callLogismata<Saving3aResponse>("APICalc_calculateSaving3a", request, ctx);
  return { request, response };
}

export interface PurchaseP2Response {
  TaxSavings?: number;
  NetInvestment?: number;
  AdditionalCapital?: number;
  AdditionalPension?: number;
}

export async function runPurchaseP2(
  profile: LifeSituation,
  ctx: CallContext,
  options: { amount: number; years: number },
) {
  return callLogismata<PurchaseP2Response>(
    "APICalc_calculatePurchaseP2",
    buildPurchaseP2Request(profile, currentYear(), options),
    ctx,
  );
}

export interface CapitalTaxResponse {
  CapitalTaxes?: number;
  FederalTax?: number;
  StateTax?: number;
  CommunityTax?: number;
  ChurchTax?: number;
  NetCapital?: number;
  TaxPercentage?: number;
}

/** Tax on a lump-sum payout (pension fund or 3a) at the customer's place of residence. */
export async function runCapitalTax(
  profile: LifeSituation,
  ctx: CallContext,
  options: { amount: number; age: number },
) {
  return callLogismata<CapitalTaxResponse>(
    "APICalc_calculateCapitalTax",
    buildCapitalTaxRequest(profile, currentYear(), options),
    ctx,
  );
}

export interface LocationRow {
  LocationID?: number;
  ZipCode?: string;
  City?: string;
  Canton?: string;
}

/** Logismata tax locations matching "8165", "Basel" or "8165 Schleinikon". */
export async function searchLocations(
  text: string,
  locale: Locale,
  ctx: CallContext,
): Promise<LocationRow[]> {
  return callLogismata<LocationRow[]>(
    "APICalc_searchLocation",
    { Search: text, Language: LOGISMATA.language[locale] },
    ctx,
  );
}

/**
 * Monthly saving needed to reach a goal (APICalc_calculateSaving). When the start capital alone
 * gets there, Logismata returns a negative rate: show how the start capital grows instead.
 */
export async function runSaving(
  params: SavingsPlanParams,
  ctx: CallContext,
): Promise<SavingsPlanOutput> {
  const plan = await callLogismata<SavingResponse>(
    "APICalc_calculateSaving",
    buildSavingRequest(params),
    ctx,
  );
  if ((plan.PeriodicInvestment ?? 0) > 0) return savingsPlanFromResponse(params, plan, false);
  const growth = await callLogismata<SavingResponse>(
    "APICalc_calculateSaving",
    buildGrowthRequest(params),
    ctx,
  );
  return savingsPlanFromResponse(params, growth, true);
}

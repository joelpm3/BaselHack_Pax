import "server-only";
import type { LifeSituation } from "@/lib/domain/profile";
import type { Locale } from "@/lib/domain/taxonomy";
import { type CallContext, callLogismata, LOGISMATA } from "@/lib/logismata/client";
import type { IncomeBreakdown, RiskPersonResult } from "../types";
import {
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
  const needsPartner = withBvg(partner);
  if (!needsOwn && !needsPartner) {
    return { person1: known ?? 0, person2: 0, estimated: false };
  }
  const base = await callLogismata<BaseResponse>(
    "APICalc_calculateRetirementBase",
    buildRetirementBaseRequest(profile, year),
    ctx,
  );
  return {
    person1: known ?? base.Person1?.Pension ?? 0,
    capital1: profile.pillar2.currentCapital ?? base.Person1?.CurrentCapital,
    person2: base.Person2?.Pension ?? 0,
    estimated: needsOwn,
  };
}

export interface RetirementCheck {
  breakdown: IncomeBreakdown;
  response: RetirementResponse;
  retirementAge: number;
  retirementYear: number;
  estimated: boolean;
}

export async function runRetirementCheck(
  profile: LifeSituation,
  ctx: CallContext,
  overrides: RetirementOverrides = {},
  pensions?: RetirementPensions & { estimated: boolean },
): Promise<RetirementCheck> {
  const year = currentYear();
  const resolved = pensions ?? (await retirementPensions(profile, ctx, year));
  const response = await callLogismata<RetirementResponse>(
    "APICalc_calculateRetirement",
    buildRetirementRequest(profile, year, resolved, overrides),
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
  };
}

interface RiskBaseResponse {
  Person1?: Partial<Pillar2RiskPensions>;
}

async function riskPensions(
  profile: LifeSituation,
  ctx: CallContext,
  year: number,
): Promise<Pillar2RiskPensions | undefined> {
  if (!hasKnownRiskPensions(profile)) return undefined;
  const base = await callLogismata<RiskBaseResponse>(
    "APICalc_calculateRiskBase",
    buildRiskBaseRequest(profile, year),
    ctx,
  );
  const p = base.Person1 ?? {};
  return mergeRiskPensions(profile, {
    Disability: p.Disability ?? 0,
    DisabilityChildren: p.DisabilityChildren ?? 0,
    Widow: p.Widow ?? 0,
    Orphan: p.Orphan ?? 0,
    ...(p.CoverageCapital !== undefined ? { CoverageCapital: p.CoverageCapital } : {}),
  });
}

export interface RiskCheck {
  persons: RiskPersonResult[];
  estimated: boolean;
}

export async function runRiskCheck(
  profile: LifeSituation,
  ctx: CallContext,
  overrides: Omit<RiskOverrides, "pillar2Pensions"> = {},
): Promise<RiskCheck> {
  const year = currentYear();
  const pillar2Pensions = await riskPensions(profile, ctx, year);
  const response = await callLogismata<{ RiskScenarioSummaries?: RiskScenarioSummary[] }>(
    "APICalc_calculateRisk",
    buildRiskRequest(profile, year, { ...overrides, pillar2Pensions }),
    ctx,
  );
  return {
    persons: riskPersons(response.RiskScenarioSummaries ?? [], profile),
    estimated: !hasKnownRiskPensions(profile),
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

interface LocationRow {
  LocationID?: number;
  ZipCode?: string;
  City?: string;
  Canton?: string;
}

export interface TaxLocation {
  zip: string;
  city: string;
  canton: string;
  taxLocationId: number;
}

/** Resolves "4053", "Basel" or "4053 Basel" to one Logismata tax location (best match). */
export async function resolveTaxLocation(
  query: { zip?: string; city?: string },
  locale: Locale,
  ctx: CallContext,
): Promise<TaxLocation | null> {
  const search = [query.zip, query.city].filter(Boolean).join(" ").trim();
  if (!search) return null;
  const run = (text: string) =>
    callLogismata<LocationRow[]>(
      "APICalc_searchLocation",
      { Search: text, Language: LOGISMATA.language[locale] },
      ctx,
    );
  let rows = await run(search);
  if (rows.length === 0 && query.zip && query.city) rows = await run(query.zip);
  const city = query.city?.toLowerCase();
  const best =
    rows.find((r) => r.ZipCode === query.zip && (!city || r.City?.toLowerCase() === city)) ??
    rows.find((r) => r.ZipCode === query.zip) ??
    rows.find((r) => city && r.City?.toLowerCase() === city) ??
    rows[0];
  if (!best?.LocationID || !best.ZipCode || !best.City || !best.Canton) return null;
  return {
    zip: best.ZipCode,
    city: best.City,
    canton: best.Canton,
    taxLocationId: best.LocationID,
  };
}

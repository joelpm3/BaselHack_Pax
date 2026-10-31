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
  describeRiskScenario,
  hasKnownRiskPensions,
  hasPartner,
  isRetiredError,
  mergeRiskPensions,
  type Pillar2RiskPensions,
  type RetirementOverrides,
  type RetirementPensions,
  type RetirementResponse,
  type RiskOverrides,
  type RiskScenarioSummary,
  retirementAge,
  retirementBreakdown,
  riskBreakdown,
  riskPensionsEstimated,
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
  const persons = new Map<1 | 2, RiskPersonResult>();
  for (const summary of response.RiskScenarioSummaries ?? []) {
    const scenario = describeRiskScenario(summary.Scenario ?? 0);
    if (!scenario) continue;
    const firstName =
      scenario.person === 1
        ? (profile.person.firstName ?? null)
        : (profile.partner?.firstName ?? null);
    const entry = persons.get(scenario.person) ?? {
      person: scenario.person,
      firstName,
      retired: false,
      scenarios: [],
    };
    if (isRetiredError(summary.ErrorCode)) entry.retired = true;
    else
      entry.scenarios.push({
        event: scenario.event,
        cause: scenario.cause,
        breakdown: riskBreakdown(summary),
      });
    persons.set(scenario.person, entry);
  }
  return {
    persons: [...persons.values()].sort((a, b) => a.person - b.person),
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

import "server-only";
import type { LifeSituation } from "@/lib/domain/profile";
import type { CallContext } from "@/lib/logismata/client";
import {
  currentYear,
  type RiskCheck,
  retirementPensions,
  runPurchaseP2,
  runRetirementCheck,
  runRiskCheck,
  runSaving3a,
  SCENARIO_SUFFIX,
} from "./logismata/checks";
import {
  INTEREST_RATE,
  max3a,
  missingFor,
  NEED_PERCENT,
  REGULAR_RETIREMENT_AGE,
} from "./logismata/mapping";
import { activeLifePolicies } from "./policies";
import { applyPolicyCover, policyCoverFor } from "./policy-cover";
import type {
  IncomeBreakdown,
  ScenarioComparison,
  ScenarioKind,
  ScenarioOutput,
  ScenarioParams,
} from "./types";

/**
 * What-if calculations for the scenario widget: the same Logismata checks with one thing
 * changed. Logged under `<toolCallId>:scenario` so they never replace the real Vorsorgebild.
 */

export const MIN_RETIREMENT_AGE = 58;
/** Minimum withdrawal for home ownership (WEF) from the pension fund. */
export const MIN_WEF_WITHDRAWAL = 20000;

export function scenarioContext(base: CallContext): CallContext {
  return { ...base, toolCallId: `${base.toolCallId ?? "action"}${SCENARIO_SUFFIX}` };
}

export function defaultParams(kind: ScenarioKind, profile: LifeSituation): ScenarioParams {
  switch (kind) {
    case "child":
      return { children: 1 };
    case "early_retirement":
      return { retirementAge: Math.min(63, (profile.desiredRetirementAge ?? 65) - 1) };
    case "pillar3a":
      return { yearlyAmount: max3a(profile) };
    case "home_purchase":
      return {
        pensionFundWithdrawal: profile.pillar2.hasPensionFund === false ? 0 : 50000,
        pillar3aWithdrawal: Math.min(profile.pillar3a.balance ?? 0, 30000),
      };
  }
}

/** Keeps widget input inside legal and sensible bounds. */
export function clampParams(
  kind: ScenarioKind,
  params: ScenarioParams,
  profile: LifeSituation,
): ScenarioParams {
  const defaults = defaultParams(kind, profile);
  const clamp = (v: number | undefined, fallback: number | undefined, min: number, max: number) =>
    Math.round(Math.min(max, Math.max(min, v ?? fallback ?? min)));
  switch (kind) {
    case "child":
      return { children: clamp(params.children, defaults.children, 1, 4) };
    case "early_retirement":
      return {
        retirementAge: clamp(
          params.retirementAge,
          defaults.retirementAge,
          MIN_RETIREMENT_AGE,
          REGULAR_RETIREMENT_AGE,
        ),
      };
    case "pillar3a":
      return { yearlyAmount: clamp(params.yearlyAmount, defaults.yearlyAmount, 0, max3a(profile)) };
    case "home_purchase": {
      const wef = clamp(params.pensionFundWithdrawal, defaults.pensionFundWithdrawal, 0, 1_000_000);
      return {
        pensionFundWithdrawal: wef > 0 && wef < MIN_WEF_WITHDRAWAL ? MIN_WEF_WITHDRAWAL : wef,
        pillar3aWithdrawal: clamp(
          params.pillar3aWithdrawal,
          defaults.pillar3aWithdrawal,
          0,
          profile.pillar3a.balance ?? 1_000_000,
        ),
      };
    }
  }
}

function missingForScenario(
  kind: ScenarioKind,
  profile: LifeSituation,
  params: ScenarioParams,
): string[] {
  if (kind === "child") return missingFor(profile, "risk");
  const missing = missingFor(profile, "retirement");
  const needsTax =
    kind === "pillar3a" || (kind === "home_purchase" && (params.pensionFundWithdrawal ?? 0) > 0);
  if (needsTax && profile.residence.taxLocationId === undefined) missing.push("residence.zip");
  return missing;
}

function riskComparisons(before: RiskCheck, after: RiskCheck): ScenarioComparison[] {
  const comparisons: ScenarioComparison[] = [];
  for (const person of before.persons) {
    const other = after.persons.find((p) => p.person === person.person);
    for (const event of ["death", "disability"] as const) {
      const find = (scenarios: typeof person.scenarios) =>
        scenarios.find((s) => s.event === event && s.cause === "illness")?.breakdown;
      const b = find(person.scenarios);
      const a = other ? find(other.scenarios) : undefined;
      if (!b || !a || (b.need === 0 && a.need === 0)) continue;
      comparisons.push({
        kind: event,
        person: person.person,
        firstName: person.firstName,
        before: b,
        after: a,
      });
    }
  }
  return comparisons;
}

function retirementComparison(
  profile: LifeSituation,
  before: IncomeBreakdown,
  after: IncomeBreakdown,
): ScenarioComparison {
  return {
    kind: "retirement",
    person: 1,
    firstName: profile.person.firstName ?? null,
    before,
    after,
  };
}

export async function computeScenario(
  kind: ScenarioKind,
  requested: ScenarioParams,
  profile: LifeSituation,
  base: CallContext,
): Promise<ScenarioOutput> {
  const params = clampParams(kind, requested, profile);
  const missing = missingForScenario(kind, profile, params);
  if (missing.length) return { status: "missing", scenario: kind, missing };
  const ctx = scenarioContext(base);
  const limits = {
    minRetirementAge: MIN_RETIREMENT_AGE,
    maxRetirementAge: REGULAR_RETIREMENT_AGE,
    max3a: max3a(profile),
  };
  const assumptions = { needPercent: NEED_PERCENT, interestRate: INTEREST_RATE };

  if (kind === "child") {
    const [before, after] = await Promise.all([
      runRiskCheck(profile, ctx),
      runRiskCheck(profile, ctx, { extraChildren: params.children }),
    ]);
    // Existing policies count in both; a new child lengthens the period death capital covers.
    const year = currentYear();
    const policies = base.customerId ? activeLifePolicies(base.customerId) : [];
    const withChild: LifeSituation = {
      ...profile,
      children: [
        ...profile.children,
        ...Array.from({ length: params.children ?? 0 }, () => ({ birthYear: year })),
      ],
    };
    const withCover = (check: RiskCheck, situation: LifeSituation): RiskCheck => ({
      ...check,
      persons: applyPolicyCover(
        check.persons,
        policyCoverFor(policies, situation, year),
        situation,
        year,
      ),
    });
    return {
      status: "ok",
      scenario: kind,
      params,
      comparisons: riskComparisons(withCover(before, profile), withCover(after, withChild)),
      extra: null,
      limits,
      assumptions: { ...assumptions, pillar2Estimated: before.estimated },
    };
  }

  const pensions = await retirementPensions(profile, ctx, currentYear());
  const before = await runRetirementCheck(profile, ctx, {}, pensions);
  const pillar2Estimated = pensions.estimated;

  if (kind === "early_retirement") {
    const after = await runRetirementCheck(
      profile,
      ctx,
      { retirementAge: params.retirementAge },
      pensions,
    );
    return {
      status: "ok",
      scenario: kind,
      params,
      comparisons: [retirementComparison(profile, before.breakdown, after.breakdown)],
      extra: null,
      limits,
      assumptions: { ...assumptions, retirementAge: params.retirementAge, pillar2Estimated },
    };
  }

  if (kind === "pillar3a") {
    const yearlyAmount = params.yearlyAmount ?? 0;
    const [after, saving] = await Promise.all([
      runRetirementCheck(profile, ctx, { saving: yearlyAmount }, pensions),
      yearlyAmount > 0 ? runSaving3a(profile, ctx, { yearlyAmount }) : null,
    ]);
    return {
      status: "ok",
      scenario: kind,
      params,
      comparisons: [retirementComparison(profile, before.breakdown, after.breakdown)],
      extra: {
        yearlyTaxSavings: Math.round(saving?.response.YearlyTaxSavings ?? 0),
        max3a: limits.max3a,
      },
      limits,
      assumptions: { ...assumptions, pillar2Estimated },
    };
  }

  // Home purchase: a WEF withdrawal costs roughly the pension a buy-in of the same size would
  // add, so Logismata's buy-in calculation gives the lost pension; the 3a withdrawal lowers
  // the savings available at retirement.
  const withdrawal = params.pensionFundWithdrawal ?? 0;
  const purchase =
    withdrawal > 0 ? await runPurchaseP2(profile, ctx, { amount: withdrawal, years: 1 }) : null;
  const lostPension = Math.round(purchase?.AdditionalPension ?? 0);
  const after = await runRetirementCheck(
    profile,
    ctx,
    { fortuneDelta: -(params.pillar3aWithdrawal ?? 0) },
    { ...pensions, person1: Math.max(0, pensions.person1 - lostPension) },
  );
  return {
    status: "ok",
    scenario: kind,
    params,
    comparisons: [retirementComparison(profile, before.breakdown, after.breakdown)],
    extra: { lostPension },
    limits,
    assumptions: { ...assumptions, pillar2Estimated },
  };
}

import { REGULAR_RETIREMENT_AGE } from "@/lib/advisor/logismata/mapping";
import type { policies } from "@/lib/db/schema";
import { addMonths } from "@/lib/documents/dates";
import type { LifeSituation } from "@/lib/domain/profile";
import { LIFE_AND_PENSION_CATEGORIES } from "@/lib/domain/taxonomy";

/**
 * Pure cockpit arithmetic (grouping, key figures, upcoming dates), shared by the portal
 * sections. Amounts are CHF per year unless named otherwise.
 */

export type PolicyRow = typeof policies.$inferSelect;
export type PolicyGroup = "pillar2" | "pillar3a" | "pillar3b" | "other";

export const POLICY_GROUPS: PolicyGroup[] = ["pillar2", "pillar3a", "pillar3b", "other"];

export function groupOf(policy: Pick<PolicyRow, "category" | "pillar">): PolicyGroup {
  if (policy.category === "pension_fund") return "pillar2";
  if (policy.category === "pillar3a" || policy.pillar === "3a") return "pillar3a";
  if (LIFE_AND_PENSION_CATEGORIES.includes(policy.category)) return "pillar3b";
  return "other";
}

/** Policies shown in the cockpit: everything except cancelled contracts, active first. */
export function visiblePolicies(policies: PolicyRow[]): PolicyRow[] {
  return policies
    .filter((p) => p.status !== "cancelled")
    .toSorted(
      (a, b) =>
        Number(a.status !== "active") - Number(b.status !== "active") ||
        Number(a.isExternal) - Number(b.isExternal) ||
        a.productName.localeCompare(b.productName),
    );
}

const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

/**
 * Figures from the customer's latest Logismata calculations in the advice. No contract stands
 * behind them, so the cockpit marks them as estimates.
 */
export interface CalculatedFigures {
  /** Own pension-fund pension at the regular retirement age (RetirementBase). */
  retirementPension?: number;
  /** AHV/IV plus pension fund if the customer can no longer work through illness. */
  disabilityPension?: number;
  /** Survivors' pensions (AHV plus pension fund) if the customer dies of illness. */
  survivorsPension?: number;
}

const DISABILITY_ILLNESS_P1 = 1;
const DEATH_ILLNESS_P1 = 3;

interface RiskSummary {
  Scenario?: number;
  ErrorCode?: number;
  IncomePillar1?: number;
  IncomePillar2?: number;
}

/** Reads the stored outputs of APICalc_calculateRetirementBase and APICalc_calculateRisk. */
export function calculatedFigures(outputs: {
  retirementBase?: unknown;
  risk?: unknown;
}): CalculatedFigures {
  const figures: CalculatedFigures = {};
  const base = outputs.retirementBase as { Person1?: { Pension?: unknown } } | null | undefined;
  const pension = num(base?.Person1?.Pension);
  if (pension > 0) figures.retirementPension = pension;
  const summaries =
    (outputs.risk as { RiskScenarioSummaries?: RiskSummary[] } | null | undefined)
      ?.RiskScenarioSummaries ?? [];
  const pensions = (scenario: number) => {
    const summary = summaries.find((s) => s.Scenario === scenario);
    // ErrorCode 8/9: (almost) retired, Logismata has no risk figures then.
    if (!summary || summary.ErrorCode === 8 || summary.ErrorCode === 9) return undefined;
    return num(summary.IncomePillar1) + num(summary.IncomePillar2);
  };
  const disability = pensions(DISABILITY_ILLNESS_P1);
  if (disability !== undefined) figures.disabilityPension = disability;
  const survivors = pensions(DEATH_ILLNESS_P1);
  if (survivors !== undefined) figures.survivorsPension = survivors;
  return figures;
}

/** Where a figure comes from; the key figures show it as the note under the amount. */
export type FigureNote =
  | "perYear"
  | "allContracts"
  | "fromProfile"
  | "estimated"
  | "estimatedWithState"
  | "noPensionFund";

export interface Figure {
  value: number;
  note: FigureNote;
}

export interface KeyFigures {
  premiums: number;
  paxPremiums: number;
  /** Death capital, or the estimated survivors' pensions per year when no capital is known. */
  death: (Figure & { kind: "capital" | "survivorsPension" }) | null;
  disability: Figure | null;
  retirement: (Figure & { age: number }) | null;
  contracts: number;
  /** At least one figure is an estimate from the advice. */
  estimated: boolean;
}

const ESTIMATES = new Set<FigureNote>(["estimated", "estimatedWithState"]);

/**
 * Contracts first, then values the customer gave (chat or confirmed documents), then the
 * calculations from the advice. Unknown figures are null.
 */
export function keyFigures(
  policies: PolicyRow[],
  profile: LifeSituation,
  calculated: CalculatedFigures = {},
): KeyFigures {
  const active = policies.filter((p) => p.status === "active");
  const funds = active.filter((p) => p.category === "pension_fund");
  const sum = (list: PolicyRow[], get: (p: PolicyRow) => unknown) =>
    list.reduce((s, p) => s + num(get(p)), 0);
  const { pillar2 } = profile;

  const deathPolicies = sum(
    active.filter((p) => p.category === "risk_death"),
    (p) => p.sumInsured,
  );
  const fundDeath = funds.length
    ? sum(funds, (p) => p.details?.deathLumpSum)
    : num(pillar2.deathLumpSum);
  let death: KeyFigures["death"] = null;
  if (deathPolicies + fundDeath > 0) {
    const note = deathPolicies > 0 || funds.length > 0 ? "allContracts" : "fromProfile";
    death = { kind: "capital", value: deathPolicies + fundDeath, note };
  } else if (calculated.survivorsPension !== undefined) {
    death = { kind: "survivorsPension", value: calculated.survivorsPension, note: "estimated" };
  }

  const annuities = sum(
    active.filter((p) => p.category === "risk_disability"),
    (p) => p.annuityAnnual,
  );
  const fundDisability = funds.length
    ? sum(funds, (p) => p.details?.disabilityPension)
    : num(pillar2.disabilityPension);
  let disability: KeyFigures["disability"] = null;
  if (fundDisability > 0) disability = { value: annuities + fundDisability, note: "perYear" };
  else if (calculated.disabilityPension !== undefined)
    disability = { value: annuities + calculated.disabilityPension, note: "estimatedWithState" };
  else if (annuities > 0) disability = { value: annuities, note: "perYear" };

  const fundPension = sum(funds, (p) => p.annuityAnnual);
  const fundAge = funds.map((p) => num(p.details?.retirementAge)).find((age) => age > 0);
  const regular = REGULAR_RETIREMENT_AGE;
  let retirement: KeyFigures["retirement"] = null;
  if (fundPension > 0)
    retirement = { value: fundPension, note: "perYear", age: fundAge ?? regular };
  else if (num(pillar2.projectedPensionAtRetirement) > 0)
    retirement = {
      value: num(pillar2.projectedPensionAtRetirement),
      note: "perYear",
      age: regular,
    };
  else if (funds.length === 0 && pillar2.hasPensionFund === false)
    retirement = { value: 0, note: "noPensionFund", age: regular };
  else if (calculated.retirementPension !== undefined)
    retirement = { value: calculated.retirementPension, note: "estimated", age: regular };

  return {
    premiums: sum(active, (p) => p.premiumAnnual),
    paxPremiums: sum(
      active.filter((p) => !p.isExternal),
      (p) => p.premiumAnnual,
    ),
    death,
    disability,
    retirement,
    contracts: active.length,
    estimated: [death, disability, retirement].some((f) => f !== null && ESTIMATES.has(f.note)),
  };
}

/**
 * What the profile says about a pillar no contract covers yet (e.g. the pension-fund capital
 * given in the chat), so the pillar overview does not claim there is nothing.
 */
export type AdviceEntry =
  | { kind: "pensionFundCapital"; amount: number }
  | { kind: "pensionFund" }
  | { kind: "noPensionFund" }
  | { kind: "pillar3aBalance"; amount: number }
  | { kind: "pillar3aContribution"; amount: number };

export function adviceEntries(
  policies: PolicyRow[],
  profile: LifeSituation,
): { pillar2: AdviceEntry | null; pillar3: AdviceEntry | null } {
  const groups = new Set(policies.filter((p) => p.status === "active").map(groupOf));
  const { pillar2, pillar3a } = profile;
  let p2: AdviceEntry | null = null;
  if (!groups.has("pillar2")) {
    if (pillar2.hasPensionFund === false) p2 = { kind: "noPensionFund" };
    else if (pillar2.currentCapital)
      p2 = { kind: "pensionFundCapital", amount: pillar2.currentCapital };
    else if (pillar2.hasPensionFund) p2 = { kind: "pensionFund" };
  }
  let p3: AdviceEntry | null = null;
  if (!groups.has("pillar3a")) {
    if (pillar3a.balance) p3 = { kind: "pillar3aBalance", amount: pillar3a.balance };
    else if (pillar3a.annualContribution)
      p3 = { kind: "pillar3aContribution", amount: pillar3a.annualContribution };
  }
  return { pillar2: p2, pillar3: p3 };
}

export interface UpcomingDate {
  policyId: string;
  date: string;
  kind: "notice" | "end";
  insurer: string;
  productName: string;
  isExternal: boolean;
}

/** Notice deadlines and contract ends from today to `months` ahead, soonest first. */
export function upcomingDates(policies: PolicyRow[], today: string, months = 24): UpcomingDate[] {
  const until = addMonths(today, months);
  const dates: UpcomingDate[] = [];
  for (const p of policies) {
    if (p.status !== "active") continue;
    const base = {
      policyId: p.id,
      insurer: p.insurer,
      productName: p.productName,
      isExternal: p.isExternal,
    };
    if (p.noticeDate && p.noticeDate >= today && p.noticeDate <= until)
      dates.push({ ...base, date: p.noticeDate, kind: "notice" });
    if (p.endDate && p.endDate >= today && p.endDate <= until)
      dates.push({ ...base, date: p.endDate, kind: "end" });
  }
  return dates.toSorted((a, b) => a.date.localeCompare(b.date));
}

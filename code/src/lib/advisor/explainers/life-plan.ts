import type { LifeSituation, PlannedEvent } from "@/lib/domain/profile";
import { hasPartner, NEED_PERCENT, REGULAR_RETIREMENT_AGE } from "../logismata/mapping";
import type {
  LifeEvent,
  LifeEventKind,
  LifePhase,
  LifePhaseKind,
  LifePlanOutput,
  LifePlanRetirement,
} from "./types";

/**
 * The customer's life plan, built only from the profile (facts and planned events), simple
 * rules applied to it (a child turns 18) and clearly marked assumptions (reference age 65, a
 * sabbatical of one year). Figures about money come from the profile, the customer's own words
 * or the Logismata retirement check the tool runs; nothing is estimated here.
 */

export const ADULT_AGE = 18;
const MIN_HORIZON_AGE = 85;
const MAX_HORIZON_AGE = 95;

const EVENT_KIND: Record<PlannedEvent["type"], LifeEventKind | null> = {
  child: "child",
  home_purchase: "home_purchase",
  marriage: "marriage",
  // A planned early retirement becomes the retirement milestone itself.
  early_retirement: null,
  self_employment: "self_employment",
  sabbatical: "sabbatical",
  divorce: "divorce",
  inheritance: "inheritance",
  other: "other",
};

/** The retirement age the plan uses: stated wish, then a planned early retirement, then 65. */
export function planRetirement(
  profile: LifeSituation,
  year: number,
): Pick<LifePlanRetirement, "age" | "year" | "basis"> | null {
  const birthYear = profile.person.birthYear;
  if (birthYear === undefined) return null;
  const currentAge = year - birthYear;
  const planned = profile.plannedEvents.find(
    (e) => e.type === "early_retirement" && e.year !== undefined && e.year >= year,
  );
  const choice: Pick<LifePlanRetirement, "age" | "basis"> =
    profile.desiredRetirementAge !== undefined
      ? { age: profile.desiredRetirementAge, basis: "profile" }
      : planned?.year !== undefined
        ? { age: planned.year - birthYear, basis: "plan" }
        : { age: REGULAR_RETIREMENT_AGE, basis: "default" };
  const age = Math.max(choice.age, currentAge);
  return { age, year: birthYear + age, basis: choice.basis };
}

function horizonFor(currentAge: number, retirementAge: number): number {
  return Math.min(MAX_HORIZON_AGE, Math.max(MIN_HORIZON_AGE, retirementAge + 20, currentAge + 10));
}

function plannedEvents(profile: LifeSituation, year: number, birthYear: number): LifeEvent[] {
  const events: LifeEvent[] = [];
  for (const planned of profile.plannedEvents) {
    const kind = EVENT_KIND[planned.type];
    if (!kind) continue;
    if (planned.year !== undefined && planned.year < year) continue;
    events.push({
      kind,
      year: planned.year ?? null,
      age: planned.year !== undefined ? planned.year - birthYear : null,
      source: "profile",
      note: planned.note ?? null,
    });
  }
  return events;
}

function childEvents(profile: LifeSituation, year: number, birthYear: number): LifeEvent[] {
  const events: LifeEvent[] = [];
  for (const child of profile.children) {
    if (child.birthYear > year) {
      events.push({
        kind: "child",
        year: child.birthYear,
        age: child.birthYear - birthYear,
        source: "profile",
        note: null,
      });
    }
    const adult = child.birthYear + ADULT_AGE;
    if (adult > year) {
      events.push({
        kind: "child_adult",
        year: adult,
        age: adult - birthYear,
        source: "derived",
        note: null,
      });
    }
  }
  return events;
}

function phasesFor(
  profile: LifeSituation,
  events: LifeEvent[],
  currentAge: number,
  retirementAge: number,
  horizonAge: number,
): LifePhase[] {
  const phases: LifePhase[] = [];
  const retired = profile.person.employment === "retired";
  if (!retired && retirementAge > currentAge) {
    phases.push({ kind: "work", fromAge: currentAge, toAge: retirementAge - 1, assumed: false });
  }
  for (const event of events) {
    if (event.kind === "sabbatical" && event.age !== null && event.age < retirementAge) {
      // The profile has no duration: one year is an assumption the widget names.
      phases.push({ kind: "sabbatical", fromAge: event.age, toAge: event.age, assumed: true });
    }
  }
  phases.push({
    kind: "retirement",
    fromAge: retired ? currentAge : retirementAge,
    toAge: horizonAge,
    assumed: false,
  });
  return phases;
}

const PHASE_PRIORITY: LifePhaseKind[] = ["sabbatical", "retirement", "work"];

/** The phase a given age falls into (a sabbatical wins over work), or null outside the plan. */
export function phaseAt(phases: LifePhase[], age: number): LifePhase | null {
  for (const kind of PHASE_PRIORITY) {
    const phase = phases.find((p) => p.kind === kind && age >= p.fromAge && age <= p.toAge);
    if (phase) return phase;
  }
  return null;
}

const ORDER: LifeEventKind[] = [
  "today",
  "marriage",
  "child",
  "home_purchase",
  "sabbatical",
  "self_employment",
  "inheritance",
  "divorce",
  "other",
  "child_adult",
  "partner_retirement",
  "retirement",
];

function compareEvents(a: LifeEvent, b: LifeEvent): number {
  if (a.year === null || b.year === null) {
    if (a.year === b.year) return ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind);
    return a.year === null ? 1 : -1;
  }
  return a.year - b.year || ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind);
}

export function buildLifePlan(
  profile: LifeSituation,
  year: number,
  options: { income: LifePlanRetirement["income"]; expensesMonthly?: number },
): LifePlanOutput {
  const birthYear = profile.person.birthYear;
  const retirementPlan = planRetirement(profile, year);
  if (birthYear === undefined || !retirementPlan) {
    return { status: "missing", missing: ["person.birthYear"] };
  }
  const currentAge = year - birthYear;
  const horizonAge = horizonFor(currentAge, retirementPlan.age);

  const events: LifeEvent[] = [
    { kind: "today", year, age: currentAge, source: "profile", note: null },
    ...plannedEvents(profile, year, birthYear),
    ...childEvents(profile, year, birthYear),
  ];
  if (retirementPlan.year > year || profile.person.employment !== "retired") {
    events.push({
      kind: "retirement",
      year: retirementPlan.year,
      age: retirementPlan.age,
      source: retirementPlan.basis === "default" ? "assumption" : "profile",
      note: null,
    });
  }
  const partnerBirthYear = hasPartner(profile) ? profile.partner?.birthYear : undefined;
  if (partnerBirthYear !== undefined) {
    const partnerYear = partnerBirthYear + REGULAR_RETIREMENT_AGE;
    if (partnerYear > year) {
      events.push({
        kind: "partner_retirement",
        year: partnerYear,
        age: partnerYear - birthYear,
        source: "assumption",
        note: null,
      });
    }
  }
  const visible = events.filter((e) => e.age === null || e.age <= horizonAge).sort(compareEvents);

  const own = profile.person.grossIncome;
  const partnerIncome = hasPartner(profile) ? profile.partner?.grossIncome : undefined;
  const income =
    own === undefined && partnerIncome === undefined ? null : (own ?? 0) + (partnerIncome ?? 0);

  return {
    status: "ok",
    currentYear: year,
    currentAge,
    horizonAge,
    events: visible,
    phases: phasesFor(profile, visible, currentAge, retirementPlan.age, horizonAge),
    retirement: { ...retirementPlan, income: options.income },
    money: {
      incomeMonthly: income === null ? null : Math.round(income / 12),
      incomeIncludesPartner: partnerIncome !== undefined && partnerIncome > 0,
      expensesMonthly:
        options.expensesMonthly !== undefined && options.expensesMonthly > 0
          ? Math.round(options.expensesMonthly)
          : null,
    },
    needPercent: NEED_PERCENT,
  };
}

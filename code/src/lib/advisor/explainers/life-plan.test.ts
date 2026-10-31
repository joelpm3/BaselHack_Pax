import { describe, expect, it } from "vitest";
import { lifeSituationSchema } from "@/lib/domain/profile";
import { buildLifePlan, phaseAt, planRetirement } from "./life-plan";

const YEAR = 2026;
const noIncome = { status: "missing", missing: [] } as const;

function profile(data: Record<string, unknown>) {
  return lifeSituationSchema.parse(data);
}

describe("planRetirement", () => {
  it("uses the stated age, then a planned early retirement, then 65", () => {
    expect(planRetirement(profile({ person: { birthYear: 1990 }, desiredRetirementAge: 60 }), YEAR))
      .toEqual({ age: 60, year: 2050, basis: "profile" });
    expect(
      planRetirement(
        profile({
          person: { birthYear: 1990 },
          plannedEvents: [{ type: "early_retirement", year: 2048 }],
        }),
        YEAR,
      ),
    ).toEqual({ age: 58, year: 2048, basis: "plan" });
    expect(planRetirement(profile({ person: { birthYear: 1990 } }), YEAR)).toEqual({
      age: 65,
      year: 2055,
      basis: "default",
    });
    expect(planRetirement(profile({}), YEAR)).toBeNull();
  });
});

describe("buildLifePlan", () => {
  it("needs the birth year", () => {
    expect(buildLifePlan(profile({}), YEAR, { income: noIncome })).toEqual({
      status: "missing",
      missing: ["person.birthYear"],
    });
  });

  it("orders profile events, derived milestones and assumptions on one timeline", () => {
    const plan = buildLifePlan(
      profile({
        person: { birthYear: 1990, grossIncome: 96_000, maritalStatus: "married" },
        partner: { birthYear: 1992, grossIncome: 60_000 },
        children: [{ birthYear: 2020 }],
        plannedEvents: [
          { type: "home_purchase", year: 2030 },
          { type: "sabbatical", year: 2035, note: "Weltreise" },
          { type: "child" },
          { type: "marriage", year: 2010 },
        ],
      }),
      YEAR,
      { income: noIncome, expensesMonthly: 7_000 },
    );
    if (plan.status !== "ok") throw new Error("expected a plan");
    expect(plan.currentAge).toBe(36);
    expect(plan.events.map((e) => [e.kind, e.year, e.source])).toEqual([
      ["today", 2026, "profile"],
      ["home_purchase", 2030, "profile"],
      ["sabbatical", 2035, "profile"],
      ["child_adult", 2038, "derived"],
      ["retirement", 2055, "assumption"],
      ["partner_retirement", 2057, "assumption"],
      // Named without a year: listed last; the past marriage is left out.
      ["child", null, "profile"],
    ]);
    expect(plan.money).toEqual({
      incomeMonthly: 13_000,
      incomeIncludesPartner: true,
      expensesMonthly: 7_000,
    });
    expect(plan.horizonAge).toBe(85);
  });

  it("marks a sabbatical as one assumed year that interrupts work", () => {
    const plan = buildLifePlan(
      profile({
        person: { birthYear: 1990 },
        desiredRetirementAge: 60,
        plannedEvents: [{ type: "sabbatical", year: 2035 }],
      }),
      YEAR,
      { income: noIncome },
    );
    if (plan.status !== "ok") throw new Error("expected a plan");
    expect(phaseAt(plan.phases, 44)?.kind).toBe("work");
    expect(phaseAt(plan.phases, 45)).toMatchObject({ kind: "sabbatical", assumed: true });
    expect(phaseAt(plan.phases, 59)?.kind).toBe("work");
    expect(phaseAt(plan.phases, 60)?.kind).toBe("retirement");
    expect(phaseAt(plan.phases, 86)).toBeNull();
    const retirement = plan.events.find((e) => e.kind === "retirement");
    expect(retirement).toMatchObject({ age: 60, source: "profile" });
  });

  it("ignores expenses the customer did not state", () => {
    const plan = buildLifePlan(profile({ person: { birthYear: 1980 } }), YEAR, {
      income: noIncome,
      expensesMonthly: 0,
    });
    if (plan.status !== "ok") throw new Error("expected a plan");
    expect(plan.money).toEqual({
      incomeMonthly: null,
      incomeIncludesPartner: false,
      expensesMonthly: null,
    });
  });
});

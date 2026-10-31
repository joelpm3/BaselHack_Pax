import { describe, expect, it } from "vitest";
import { lifeSituationSchema } from "@/lib/domain/profile";
import { emptyBreakdown } from "./logismata/mapping";
import {
  applyPolicyCover,
  type CoverPolicy,
  coverEndingFor,
  policyCoverFor,
  withPolicyCover,
} from "./policy-cover";
import type { IncomeBreakdown, RiskPersonResult } from "./types";

const YEAR = 2026;

/** Seed customer Jane: homemaker, married to May (the earner), baby born 2026. */
const jane = lifeSituationSchema.parse({
  person: { firstName: "Jane", birthYear: 1986, sex: "female", maritalStatus: "married" },
  partner: { firstName: "May", birthYear: 1984, sex: "male", grossIncome: 100000 },
  children: [{ birthYear: 2026 }],
});

const termLife = (overrides: Partial<CoverPolicy> = {}): CoverPolicy => ({
  category: "risk_death",
  status: "active",
  sumInsured: 150000,
  annuityAnnual: null,
  insuredPerson: "May Müller",
  ...overrides,
});

const deathGap = (gap: number): IncomeBreakdown => ({
  ...emptyBreakdown(),
  need: 70000,
  pillar1: 70000 - gap,
  total: 70000 - gap,
  gap,
  capitalGap: gap * 25,
});

describe("policyCoverFor", () => {
  it("assigns policies to the insured person and spreads death capital until the youngest child is 25", () => {
    expect(policyCoverFor([termLife()], jane, YEAR)).toEqual([
      {
        person: 2,
        deathCapital: 150000,
        deathAnnuity: 0,
        disabilityAnnuity: 0,
        supportYears: 25,
        supportPeriod: "until_youngest_child_25",
      },
    ]);
  });

  it("ignores inactive policies, other categories and other insured persons", () => {
    const policies = [
      termLife({ status: "ended" }),
      termLife({ category: "pillar3a" }),
      termLife({ insuredPerson: "Lena Müller" }),
    ];
    expect(policyCoverFor(policies, jane, YEAR)).toEqual([]);
  });

  it("adds up death and disability cover of the same person", () => {
    const [cover] = policyCoverFor(
      [
        termLife({ insuredPerson: "Jane Müller", sumInsured: 100000 }),
        termLife({ insuredPerson: "Jane Müller", sumInsured: null, annuityAnnual: 6000 }),
        termLife({
          insuredPerson: "Jane Müller",
          category: "risk_disability",
          sumInsured: null,
          annuityAnnual: 24000,
        }),
      ],
      jane,
      YEAR,
    );
    expect(cover).toMatchObject({
      person: 1,
      deathCapital: 100000,
      deathAnnuity: 6000,
      disabilityAnnuity: 24000,
    });
  });

  it("uses ten years for a couple without children and five for a single person", () => {
    const couple = { ...jane, children: [] };
    expect(policyCoverFor([termLife()], couple, YEAR)[0].supportYears).toBe(10);
    const single = lifeSituationSchema.parse({ person: { firstName: "Taylor", birthYear: 1995 } });
    expect(policyCoverFor([termLife({ insuredPerson: "Taylor" })], single, YEAR)[0]).toMatchObject({
      supportYears: 5,
      supportPeriod: "minimum_5_years",
    });
  });
});

describe("withPolicyCover", () => {
  const [cover] = policyCoverFor([termLife()], jane, YEAR);

  it("closes a small gap and counts the rest as surplus (Jane: May's CHF 150'000 vs CHF 218/month)", () => {
    const result = withPolicyCover(deathGap(2616), "death", cover, jane.partner, YEAR);
    expect(result).toMatchObject({ policies: 6000, gap: 0, surplus: 3384, total: 73384 });
    expect(result.capitalGap).toBe(0);
  });

  it("reduces a larger gap by the yearly share of the capital", () => {
    const result = withPolicyCover(deathGap(20000), "death", cover, jane.partner, YEAR);
    expect(result).toMatchObject({ policies: 6000, gap: 14000, surplus: 0 });
    expect(result.capitalGap).toBe(500000 - 150000);
  });

  it("closes the gap a cover was sized for (Max: CHF 370'000 against CHF 1'211/month)", () => {
    const max = lifeSituationSchema.parse({
      person: { firstName: "Max", birthYear: 1990, maritalStatus: "married" },
      partner: { firstName: "Lea", birthYear: 1991 },
      children: [{ birthYear: 2026 }],
    });
    const [own] = policyCoverFor(
      [termLife({ insuredPerson: "Max Muster", sumInsured: 370000 })],
      max,
      YEAR,
    );
    const result = withPolicyCover(deathGap(1211 * 12), "death", own, max.person, YEAR);
    expect(result.gap).toBe(0);
  });

  it("leaves a breakdown unchanged without cover for the event", () => {
    const breakdown = deathGap(20000);
    expect(withPolicyCover(breakdown, "disability", cover, jane.partner, YEAR)).toBe(breakdown);
    expect(withPolicyCover(breakdown, "death", undefined, jane.partner, YEAR)).toBe(breakdown);
  });
});

describe("applyPolicyCover", () => {
  it("only changes the insured person's scenarios", () => {
    const persons: RiskPersonResult[] = [1, 2].map((person) => ({
      person: person as 1 | 2,
      firstName: null,
      retired: false,
      scenarios: [{ event: "death", cause: "illness", breakdown: deathGap(20000) }],
    }));
    const [jane1, may] = applyPolicyCover(
      persons,
      policyCoverFor([termLife()], jane, YEAR),
      jane,
      YEAR,
    );
    expect(jane1.scenarios[0].breakdown.gap).toBe(20000);
    expect(may.scenarios[0].breakdown.gap).toBe(14000);
  });
});

describe("insurance 3a and ending cover", () => {
  const insurance3a = termLife({
    category: "pillar3a",
    sumInsured: 50000,
    annuityAnnual: 12000,
    insuredPerson: "May Müller",
    endDate: "2026-12-31",
    details: { kind: "insurance_3a", cancelled: true },
  });

  it("counts an insurance 3a's death capital and disability pension", () => {
    const [may] = policyCoverFor([insurance3a], jane, YEAR);
    expect(may).toMatchObject({ person: 2, deathCapital: 50000, disabilityAnnuity: 12000 });
    // A savings 3a (no insurance_3a kind) is not risk cover.
    expect(policyCoverFor([{ ...insurance3a, details: {} }], jane, YEAR)).toEqual([]);
  });

  it("reports cover a cancellation ends within two years", () => {
    expect(coverEndingFor([insurance3a, termLife()], jane, "2026-10-31")).toEqual([
      {
        person: 2,
        endDate: "2026-12-31",
        cancelled: true,
        deathCapital: 50000,
        disabilityAnnuity: 12000,
        amountsKnown: true,
      },
    ]);
    expect(coverEndingFor([insurance3a], jane, "2027-01-01")).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { emptyBreakdown } from "@/lib/advisor/logismata/mapping";
import type { IncomeBreakdown, RiskPersonResult } from "@/lib/advisor/types";
import { lifeSituationSchema } from "@/lib/domain/profile";
import {
  cheaperEquivalentCandidates,
  cheaperEquivalentHint,
  detectContractEnding,
  detectCoverageMismatch,
  detectDoubleCover,
  detectPillar3aNotMaxed,
  type HintFacts,
  MAX_IV_CHILD_PENSION,
  type PolicyFacts,
  pensionBuyInCandidates,
  pensionBuyInHint,
} from "./rules";

const TODAY = "2026-10-30";
const limits3a = { withPensionFund: 7258, withoutPensionFund: 36288 };

let nextId = 0;
function policy(overrides: Partial<PolicyFacts>): PolicyFacts {
  nextId += 1;
  return {
    id: `p${nextId}`,
    insurer: "Pax",
    isExternal: false,
    category: "risk_death",
    productName: "Pax Todesfallversicherung",
    pillar: "3b",
    status: "active",
    startDate: "2024-01-01",
    endDate: "2049-09-30",
    noticeDate: null,
    premiumAnnual: 1384.8,
    sumInsured: 150000,
    annuityAnnual: null,
    insuredPerson: null,
    details: null,
    ...overrides,
  };
}

const muellerProfile = lifeSituationSchema.parse({
  person: {
    firstName: "Jane",
    birthYear: 1986,
    sex: "female",
    employment: "homemaker",
    grossIncome: 0,
  },
  partner: {
    firstName: "May",
    birthYear: 1984,
    sex: "male",
    employment: "employed",
    grossIncome: 100000,
  },
  children: [{ birthYear: 2026 }],
  pillar2: { hasPensionFund: false },
});

const taylorProfile = lifeSituationSchema.parse({
  person: {
    firstName: "Taylor",
    birthYear: 1995,
    sex: "male",
    maritalStatus: "single",
    employment: "employed",
    grossIncome: 100000,
  },
  pillar2: { hasPensionFund: true, maxBuyIn: 132600 },
  pillar3a: { annualContribution: 7258 },
});

const facts = (overrides: Partial<HintFacts>): HintFacts => ({
  profile: taylorProfile,
  policies: [],
  today: TODAY,
  limits3a,
  ...overrides,
});

describe("contract_ending", () => {
  it("flags a notice deadline within six months, urgent within 60 days", () => {
    const soon = policy({ noticeDate: "2026-12-15", isExternal: true });
    const later = policy({ noticeDate: "2027-01-31" });
    const far = policy({ noticeDate: "2027-09-30" });
    const hints = detectContractEnding(facts({ policies: [soon, later, far] }));
    expect(hints.map((h) => [h.policyId, h.severity, h.data.kind])).toEqual([
      [soon.id, "warning", "notice"],
      [later.id, "info", "notice"],
    ]);
  });

  it("flags a contract that ends within six months and ignores ended ones", () => {
    const ending = policy({ endDate: "2027-03-31" });
    const ended = policy({ endDate: "2027-03-31", status: "ended" });
    const hints = detectContractEnding(facts({ policies: [ending, ended] }));
    expect(hints).toHaveLength(1);
    expect(hints[0]).toMatchObject({ policyId: ending.id, data: { kind: "end", days: 152 } });
  });
});

describe("pillar3a_not_maxed", () => {
  it("is silent when the maximum is paid", () => {
    expect(detectPillar3aNotMaxed(facts({}))).toEqual([]);
  });

  it("reports the gap against the small 3a limit", () => {
    const profile = { ...taylorProfile, pillar3a: { annualContribution: 3000 } };
    expect(detectPillar3aNotMaxed(facts({ profile }))[0]?.data).toMatchObject({
      limit: 7258,
      contribution: 3000,
      gap: 4258,
    });
  });

  it("counts 3a policy premiums and uses the large limit without a pension fund", () => {
    const profile = lifeSituationSchema.parse({
      person: { firstName: "Ana", employment: "self_employed", grossIncome: 120000 },
      pillar2: { hasPensionFund: false },
    });
    const hints = detectPillar3aNotMaxed(
      facts({
        profile,
        policies: [policy({ category: "pillar3a", pillar: "3a", premiumAnnual: 6000 })],
      }),
    );
    expect(hints[0]?.data).toMatchObject({ limit: 24000, contribution: 6000, gap: 18000 });
  });

  it("reports an unknown contribution without inventing a gap", () => {
    const profile = { ...taylorProfile, pillar3a: {} };
    expect(detectPillar3aNotMaxed(facts({ profile }))[0]?.data).toMatchObject({
      contribution: null,
      gap: null,
    });
  });

  it("does not apply without earned income", () => {
    expect(detectPillar3aNotMaxed(facts({ profile: muellerProfile }))).toEqual([]);
  });
});

describe("coverage_mismatch", () => {
  it("flags low death cover for the earner of a young family", () => {
    const pax = policy({ insuredPerson: "May Müller", sumInsured: 150000 });
    const hints = detectCoverageMismatch(facts({ profile: muellerProfile, policies: [pax] }));
    expect(hints).toEqual([
      expect.objectContaining({
        type: "coverage_mismatch",
        severity: "warning",
        policyId: pax.id,
        key: "coverage_mismatch:death:partner",
        data: expect.objectContaining({ cover: 150000, need: 300000, gap: 150000 }),
      }),
    ]);
  });

  it("counts every death cover including the pension fund lump sum", () => {
    const policies = [
      policy({ insuredPerson: "May Müller", sumInsured: 150000 }),
      policy({ insuredPerson: "May Müller", sumInsured: 100000, insurer: "Helvetic Muster" }),
      policy({
        category: "pension_fund",
        insuredPerson: "May Müller",
        sumInsured: null,
        details: { deathLumpSum: 50000 },
      }),
    ];
    const hints = detectCoverageMismatch(facts({ profile: muellerProfile, policies }));
    expect(hints.filter((h) => h.data.risk === "death")).toEqual([]);
  });

  it("flags a disability gap from the pension certificate, counting the child pensions", () => {
    const certificate = (disabilityPension: number) => [
      policy({
        category: "pension_fund",
        insuredPerson: "May Müller",
        details: { disabilityPension, childPension: 1000 },
      }),
      policy({ insuredPerson: "May", sumInsured: 400000 }),
    ];
    const hints = detectCoverageMismatch(
      facts({ profile: muellerProfile, policies: certificate(20000) }),
    );
    const childPensions = MAX_IV_CHILD_PENSION + 1000;
    expect(hints).toEqual([
      expect.objectContaining({
        key: "coverage_mismatch:disability:partner",
        severity: "warning",
        data: expect.objectContaining({
          source: "estimate",
          need: 80000,
          childPensions,
          gap: 80000 - 30240 - childPensions - 20000,
        }),
      }),
    ]);
    // With the child pensions May's certificate covers the need, as the risk card says.
    expect(
      detectCoverageMismatch(facts({ profile: muellerProfile, policies: certificate(29420) })),
    ).toEqual([]);
  });

  describe("with a stored risk calculation", () => {
    const breakdown = (need: number, gap: number, policies = 0): IncomeBreakdown => ({
      ...emptyBreakdown(),
      need,
      pillar1: need - gap - policies,
      policies,
      total: need - gap,
      gap,
      capitalGap: gap * 20 + 210000,
    });
    const person = (
      number: 1 | 2,
      death: IncomeBreakdown,
      disability: IncomeBreakdown,
    ): RiskPersonResult => ({
      person: number,
      firstName: number === 1 ? "Jane" : "May",
      retired: false,
      scenarios: [
        { event: "disability", cause: "illness", breakdown: disability },
        { event: "death", cause: "illness", breakdown: death },
      ],
    });
    const pax = policy({ insuredPerson: "May Müller", sumInsured: 150000 });
    const fund = policy({
      category: "pension_fund",
      insuredPerson: "May Müller",
      details: { disabilityPension: 29420 },
    });

    it("uses the calculated gaps instead of the rules of thumb", () => {
      const risk = {
        persons: [
          person(1, breakdown(0, 0), breakdown(0, 0)),
          // Covered today, as on the card, even though the cumulative gap is positive.
          person(2, breakdown(70000, 0, 6000), breakdown(80000, 0)),
        ],
      };
      const hints = detectCoverageMismatch(
        facts({ profile: muellerProfile, policies: [pax, fund], risk }),
      );
      expect(hints).toEqual([]);
    });

    it("reports the calculated monthly gap", () => {
      const risk = { persons: [person(2, breakdown(70000, 14532), breakdown(80000, 2400))] };
      const hints = detectCoverageMismatch(
        facts({ profile: muellerProfile, policies: [pax], risk }),
      );
      expect(hints).toEqual([
        expect.objectContaining({
          key: "coverage_mismatch:death:partner",
          severity: "warning",
          policyId: pax.id,
          data: expect.objectContaining({
            source: "calculation",
            name: "May",
            gap: 14532,
            monthlyGap: 1211,
          }),
        }),
      ]);
    });

    it("falls back to the rules of thumb for a person the calculation does not cover", () => {
      const risk = { persons: [person(1, breakdown(0, 0), breakdown(0, 0))] };
      const hints = detectCoverageMismatch(
        facts({ profile: muellerProfile, policies: [pax], risk }),
      );
      expect(hints).toEqual([
        expect.objectContaining({
          key: "coverage_mismatch:death:partner",
          data: expect.objectContaining({ source: "rule_of_thumb", gap: 150000 }),
        }),
      ]);
    });
  });

  it("questions death cover nobody depends on", () => {
    const tf = policy({ insuredPerson: "Taylor Johnson", sumInsured: 200000 });
    const hints = detectCoverageMismatch(facts({ policies: [tf] }));
    expect(hints).toEqual([
      expect.objectContaining({
        key: "coverage_mismatch:death_without_dependants:self",
        severity: "info",
        policyId: tf.id,
      }),
    ]);
  });
});

describe("double_cover", () => {
  it("flags two household contracts as a warning", () => {
    const a = policy({ category: "nonlife_household", insurer: "A", isExternal: true });
    const b = policy({
      category: "nonlife_household",
      insurer: "B",
      isExternal: true,
      startDate: "2025-01-01",
    });
    const hints = detectDoubleCover(facts({ policies: [a, b] }));
    expect(hints).toEqual([
      expect.objectContaining({
        severity: "warning",
        policyId: b.id,
        key: "double_cover:nonlife_household",
      }),
    ]);
  });

  it("flags two term-life contracts at different insurers for the same person", () => {
    const pax = policy({ insuredPerson: "May Müller" });
    const ext = policy({
      insuredPerson: "May Müller",
      insurer: "Helvetic Muster",
      isExternal: true,
    });
    const otherPerson = policy({
      insuredPerson: "Jane Müller",
      insurer: "Other",
      isExternal: true,
    });
    const hints = detectDoubleCover(
      facts({ profile: muellerProfile, policies: [pax, ext, otherPerson] }),
    );
    expect(hints).toEqual([
      expect.objectContaining({
        severity: "info",
        policyId: ext.id,
        key: "double_cover:risk_death:partner",
        data: expect.objectContaining({ coverTotal: 300000 }),
      }),
    ]);
  });
});

describe("cheaper_equivalent", () => {
  const external = policy({
    insurer: "Helvetic Muster Leben AG",
    isExternal: true,
    insuredPerson: "May Müller",
    sumInsured: 200000,
    premiumAnnual: 2640,
    endDate: "2049-04-30",
    details: { insuredBirthDate: "1984-09-16" },
  });

  it("prices external term life like-for-like", () => {
    const [candidate] = cheaperEquivalentCandidates(
      facts({ profile: muellerProfile, policies: [external] }),
    );
    expect(candidate?.quoteInput).toEqual({
      productCode: "todesfall",
      pillar: "3b",
      birthDate: "1984-09-16",
      sex: "male",
      smoker: false,
      endAge: 65,
      sumInsured: 200000,
    });
  });

  it("only hints when Pax is clearly cheaper", () => {
    const [candidate] = cheaperEquivalentCandidates(
      facts({ profile: muellerProfile, policies: [external] }),
    );
    if (!candidate) throw new Error("no candidate");
    expect(
      cheaperEquivalentHint(candidate, { premiumAnnualNet: 1846, source: "quicksale" })?.data,
    ).toMatchObject({
      saving: 794,
      savingPercent: 30,
    });
    expect(
      cheaperEquivalentHint(candidate, { premiumAnnualNet: 2500, source: "estimate" }),
    ).toBeNull();
  });

  it("skips Pax policies and policies without sex or birth date", () => {
    const profile = lifeSituationSchema.parse({ person: { firstName: "Kim" } });
    expect(cheaperEquivalentCandidates(facts({ profile, policies: [external] }))).toEqual([]);
    expect(
      cheaperEquivalentCandidates(
        facts({ profile: muellerProfile, policies: [policy({ insuredPerson: "May" })] }),
      ),
    ).toEqual([]);
  });
});

describe("pension_buyin", () => {
  it("offers a buy-in from the certificate with the tax figure", () => {
    const [candidate] = pensionBuyInCandidates(facts({}));
    expect(candidate).toMatchObject({ subject: "self", maxBuyIn: 132600, income: 100000 });
    if (!candidate) throw new Error("no candidate");
    expect(
      pensionBuyInHint(candidate, { taxSavings: 9123.4, investment: 132600, years: 3 }).data,
    ).toMatchObject({
      taxSavings: 9123,
      source: "logismata",
    });
    expect(pensionBuyInHint(candidate, null).data).toMatchObject({
      taxSavings: null,
      source: null,
    });
  });

  it("uses the partner's certificate and skips small buy-ins", () => {
    const fund = policy({
      category: "pension_fund",
      insuredPerson: "May Müller",
      details: { maxBuyIn: 86350 },
    });
    expect(pensionBuyInCandidates(facts({ profile: muellerProfile, policies: [fund] }))).toEqual([
      expect.objectContaining({ subject: "partner", maxBuyIn: 86350 }),
    ]);
    const small = { ...taylorProfile, pillar2: { maxBuyIn: 2000 } };
    expect(pensionBuyInCandidates(facts({ profile: small }))).toEqual([]);
  });
});

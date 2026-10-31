import { describe, expect, it } from "vitest";
import { lifeSituationSchema } from "@/lib/domain/profile";
import {
  type Pillar3aPolicy,
  pillar3aContributionIn,
  pillar3aSaving,
  pillar3aSavingNote,
} from "./pillar3a";

/** The cashier from Basel: pays the 3a maximum into an insurance 3a, cancelled as of 31.12.2026. */
const cashier = lifeSituationSchema.parse({
  person: { birthYear: 1991, sex: "male", grossIncome: 65000 },
  pillar3a: { annualContribution: 7258 },
});

const insurance3a = (overrides: Partial<Pillar3aPolicy> = {}): Pillar3aPolicy => ({
  category: "pillar3a",
  status: "active",
  startDate: null,
  endDate: null,
  premiumAnnual: 7258,
  insuredPerson: null,
  details: { subject: "self", kind: "insurance_3a", mostlyRisk: true },
  ...overrides,
});

describe("pillar3aContributionIn", () => {
  it("frees the 3a room of the years after a cancelled policy ends", () => {
    const policies = [insurance3a({ endDate: "2026-12-31", details: { cancelled: true } })];
    expect(pillar3aContributionIn(2026, cashier, policies, 2026)).toBe(7258);
    expect(pillar3aContributionIn(2027, cashier, policies, 2026)).toBe(0);
  });

  it("keeps bank 3a contributions beyond the policies and counts new policies from their start", () => {
    const profile = { ...cashier, pillar3a: { annualContribution: 7258 } };
    const policies = [
      insurance3a({ premiumAnnual: 3000, endDate: "2026-12-31" }),
      insurance3a({ premiumAnnual: 7258, startDate: "2027-01-01", details: {} }),
    ];
    // 4'258 at the bank, 3'000 in the old policy in 2026; the bank part and the new policy in 2027.
    expect(pillar3aContributionIn(2026, profile, policies, 2026)).toBe(7258);
    expect(pillar3aContributionIn(2027, profile, policies, 2026)).toBe(4258 + 7258);
  });

  it("uses the policy premiums when the profile has no 3a figure", () => {
    const profile = lifeSituationSchema.parse({ person: { birthYear: 1991 } });
    expect(pillar3aContributionIn(2026, profile, [insurance3a()], 2026)).toBe(7258);
  });
});

describe("pillar3aSaving", () => {
  it("counts nothing from an insurance 3a that ends this year", () => {
    const saving = pillar3aSaving(
      cashier,
      [insurance3a({ endDate: "2026-12-31", details: { kind: "insurance_3a", cancelled: true } })],
      2026,
    );
    expect(saving).toMatchObject({ annualSaving: 0, annualContribution: 7258, assumptions: [] });
    expect(saving.ending).toEqual([{ endDate: "2026-12-31", premiumAnnual: 7258 }]);
    expect(pillar3aSavingNote(saving)).toContain("ends on 2026-12-31");
  });

  it("counts only the stated savings share, none when it is unknown, all of a savings 3a", () => {
    const share = pillar3aSaving(
      cashier,
      [insurance3a({ details: { kind: "insurance_3a", savingsSharePercent: 40 } })],
      2026,
    );
    expect(share).toMatchObject({ annualSaving: 2903, notCounted: 4355, assumptions: [] });

    const unknown = pillar3aSaving(cashier, [insurance3a()], 2026);
    expect(unknown).toMatchObject({ annualSaving: 0, assumptions: ["mostly_risk"] });
    expect(pillar3aSavingNote(unknown)).toContain("assumption");

    const savings3a = pillar3aSaving(
      cashier,
      [insurance3a({ details: {}, endDate: "2056-12-31" })],
      2026,
    );
    expect(savings3a).toMatchObject({ annualSaving: 7258, assumptions: [] });
    expect(pillar3aSavingNote(savings3a)).toBeNull();
  });

  it("keeps the profile figure when there are no 3a policies", () => {
    expect(pillar3aSaving(cashier, [], 2026).annualSaving).toBe(7258);
  });
});

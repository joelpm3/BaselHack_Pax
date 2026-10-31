import { describe, expect, it } from "vitest";
import { lifeSituationSchema } from "@/lib/domain/profile";
import { analysisReadiness } from "./readiness";

const core = {
  person: {
    birthYear: 1990,
    sex: "male",
    maritalStatus: "single",
    employment: "employed",
    grossIncome: 90000,
  },
  residence: { zip: "8004" },
};

describe("analysisReadiness", () => {
  it("asks about existing cover before the analyses", () => {
    const profile = lifeSituationSchema.parse(core);
    expect(analysisReadiness(profile, { hasRiskPolicies: false }).missing).toEqual([
      "privateCover",
    ]);
  });

  it("counts an answer or policies on file as known", () => {
    const answered = lifeSituationSchema.parse({ ...core, privateCover: "no" });
    expect(analysisReadiness(answered, { hasRiskPolicies: false }).missing).toEqual([]);
    const onFile = lifeSituationSchema.parse(core);
    expect(analysisReadiness(onFile, { hasRiskPolicies: true }).missing).toEqual([]);
  });

  it("lists savings, 3a and spending as worth asking until known", () => {
    const profile = lifeSituationSchema.parse(core);
    expect(analysisReadiness(profile, { hasRiskPolicies: false }).askFirst).toEqual([
      "assets.liquid",
      "pillar3a",
      "monthlySpending",
    ]);
    const known = lifeSituationSchema.parse({
      ...core,
      assets: { total: 40000 },
      pillar3a: { annualContribution: 7258 },
      monthlySpending: 6000,
    });
    expect(analysisReadiness(known, { hasRiskPolicies: false }).askFirst).toEqual([]);
  });

  it("keeps the calculation inputs first", () => {
    const profile = lifeSituationSchema.parse({});
    const { missing } = analysisReadiness(profile, { hasRiskPolicies: false });
    expect(missing[0]).toBe("person.birthYear");
    expect(missing.at(-1)).toBe("privateCover");
  });
});

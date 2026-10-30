import { describe, expect, it } from "vitest";
import {
  fundsFor,
  profileFor,
  type SuitabilityAnswers,
  scoreSuitability,
  suitabilityAnswersSchema,
} from "./suitability";

const answers: SuitabilityAnswers = {
  annualPremium: 7258,
  singlePremium: null,
  netIncome: "75k_150k",
  netAssets: "50k_150k",
  savingCapacity: "gt7k",
  oneOffCapacity: "10k_50k",
  goal: "moderate_gains", // 15
  horizon: "gt15", // 30
  knowledge: "experience", // 20
  drawdown: "hold", // 20
  guaranteedSharePercent: 0,
};

describe("profile bands (MATERIAL.md §4)", () => {
  it("Konservativ ≤ 44, Ausgewogen 45–84, Dynamisch ≥ 85", () => {
    expect(profileFor(0)).toBe("conservative");
    expect(profileFor(44)).toBe("conservative");
    expect(profileFor(45)).toBe("balanced");
    expect(profileFor(84)).toBe("balanced");
    expect(profileFor(85)).toBe("dynamic");
    expect(profileFor(120)).toBe("dynamic");
  });
});

describe("scoreSuitability", () => {
  it("adds the points of B1–C2", () => {
    const r = scoreSuitability(answers, "fondsstar");
    expect(r.points).toEqual({ goal: 15, horizon: 30, knowledge: 20, drawdown: 20 });
    expect(r.basePoints).toBe(85);
    expect(r.total).toBe(85);
    expect(r.profile).toBe("dynamic");
  });

  it("applies the guaranteed share: points × (100 % − g) + 120 × g", () => {
    const cautious: SuitabilityAnswers = {
      ...answers,
      goal: "minimise_loss",
      horizon: "10_15",
      knowledge: "none",
      drawdown: "sell_part",
    }; // 0 + 15 + 0 + 10 = 25
    expect(scoreSuitability({ ...cautious, guaranteedSharePercent: 0 }, "lifestar").total).toBe(25);
    // 25 × 0.5 + 120 × 0.5 = 72.5 → 73 (Ausgewogen)
    const half = scoreSuitability({ ...cautious, guaranteedSharePercent: 50 }, "lifestar");
    expect(half.total).toBe(73);
    expect(half.profile).toBe("balanced");
    // 25 × 0.2 + 120 × 0.8 = 101 (Dynamisch)
    expect(scoreSuitability({ ...cautious, guaranteedSharePercent: 80 }, "lifestar").profile).toBe(
      "dynamic",
    );
  });

  it("maps profiles to the Pax funds allowed for the product", () => {
    expect(fundsFor("conservative", "lifestar").map((f) => f.name)).toEqual([
      "Pax (CH) Sustainable Portfolio Target Return ALV T",
    ]);
    expect(fundsFor("balanced", "fondsstar")).toHaveLength(3);
    const dynamicPayout = fundsFor("dynamic", "auszahlungsplan").map((f) => f.name);
    expect(dynamicPayout).toContain("Pax (CH) Sustainable Portfolio Quality Select ALV T");
    expect(dynamicPayout).not.toContain("UBS MSCI World Selection UCITS ETF");
    expect(fundsFor("dynamic", "fondsstar").map((f) => f.name)).not.toContain(
      "Pax (CH) Sustainable Portfolio Quality Select ALV T",
    );
  });

  it("suggests the balanced fund by position in the band", () => {
    const at = (goal: SuitabilityAnswers["goal"], knowledge: SuitabilityAnswers["knowledge"]) =>
      scoreSuitability({ ...answers, goal, knowledge, drawdown: "sell_part" }, "fondsstar");
    expect(at("minimise_loss", "knowledge_only").suggestedFund).toContain("Portfolio 25"); // 50
    expect(at("moderate_gains", "knowledge_only").suggestedFund).toContain("Portfolio 50"); // 65
    expect(at("moderate_gains", "experience").suggestedFund).toContain("Portfolio 75"); // 75
  });

  it("checks affordability against A3 and A4", () => {
    expect(scoreSuitability(answers, "lifestar").affordability).toEqual({
      annual: true,
      single: null,
      ok: true,
    });
    const tooMuch = scoreSuitability({ ...answers, savingCapacity: "3k_7k" }, "lifestar");
    expect(tooMuch.affordability.ok).toBe(false);
    expect(tooMuch.suitable).toBe(false);
    const payout = scoreSuitability(
      { ...answers, annualPremium: null, singlePremium: 120_000, oneOffCapacity: "50k_150k" },
      "auszahlungsplan",
    );
    expect(payout.affordability).toEqual({ annual: null, single: true, ok: true });
    const nothing = scoreSuitability({ ...answers, annualPremium: null }, "lifestar");
    expect(nothing.affordability.ok).toBe(false);
  });

  it("rejects incomplete answers", () => {
    expect(suitabilityAnswersSchema.safeParse({ ...answers, goal: undefined }).success).toBe(false);
    expect(suitabilityAnswersSchema.safeParse(answers).success).toBe(true);
  });
});

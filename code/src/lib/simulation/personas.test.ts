import { describe, expect, it } from "vitest";
import { buildCast, createRng, generatePersona, personaEmail, summariseCast } from "./personas";
import { conversationSoFar, customerInstructions } from "./prompt";

describe("simulation personas", () => {
  it("is reproducible for a seed", () => {
    expect(buildCast(10, 42, 2026)).toEqual(buildCast(10, 42, 2026));
    expect(buildCast(10, 42, 2026)).not.toEqual(buildCast(10, 43, 2026));
  });

  it("mixes material personas (as existing clients) with generated ones", () => {
    const cast = buildCast(12, 7, 2026);
    expect(cast).toHaveLength(12);
    const material = cast.filter((p) => p.source !== "generated");
    expect(material.map((p) => p.source).sort()).toEqual([
      "material:affluent_couple",
      "material:single_professional",
      "material:young_family",
    ]);
    expect(material.every((p) => p.mode === "existing_customer")).toBe(true);
    expect(
      cast.filter((p) => p.source === "generated").every((p) => p.mode === "new_business"),
    ).toBe(true);
    expect(buildCast(5, 7, 2026).filter((p) => p.source !== "generated")).toHaveLength(1);
  });

  it("generates plausible Swiss profiles across languages and concerns", () => {
    const rng = createRng(1);
    const people = Array.from({ length: 300 }, () => generatePersona(rng, 2026));
    const summary = summariseCast(people);
    expect(Object.keys(summary.locales).sort()).toEqual(["de", "en", "fr", "it"]);
    expect(summary.locales.de).toBeGreaterThan(summary.locales.fr);
    expect(Object.keys(summary.concerns).length).toBeGreaterThanOrEqual(10);
    expect(summary.earlyLeavers).toBeGreaterThan(30);
    for (const p of people) {
      const age = 2026 - p.birthYear;
      expect(age).toBeGreaterThanOrEqual(22);
      expect(age).toBeLessThanOrEqual(63);
      expect(p.grossIncome).toBeGreaterThan(0);
      if (p.concern === "retirement_payout") expect(age).toBeGreaterThanOrEqual(58);
      if (p.concern === "high_wealth") expect(p.assets).toBeGreaterThan(300_000);
      if (p.concern === "external_policy") expect(p.externalPolicy).not.toBeNull();
      if (p.concern === "baby_on_the_way") expect(p.partner).not.toBeNull();
      if (p.concern === "self_employed") expect(p.employment).toBe("self_employed");
    }
  });

  it("writes the persona into the simulated customer's instructions", () => {
    const [persona] = buildCast(1, 3, 2026);
    const text = customerInstructions(persona, 2026);
    expect(text).toContain(persona.firstName);
    expect(text).toContain("not an assistant");
    expect(conversationSoFar([])).toContain("first message");
    expect(conversationSoFar([{ role: "advisor", text: "Hallo" }])).toContain("ADVISOR: Hallo");
    expect(personaEmail({ firstName: "Léa", lastName: "Müller" })).toBe("lea.muller@example.ch");
  });
});

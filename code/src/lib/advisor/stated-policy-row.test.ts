import { describe, expect, it } from "vitest";
import { lifeSituationSchema } from "@/lib/domain/profile";
import { isUnknownInsurer, statedPolicyRow } from "./stated-policy-row";

const single = lifeSituationSchema.parse({ person: { birthYear: 1991, sex: "male" } });

describe("statedPolicyRow", () => {
  it("stores an insurance 3a with an unknown insurer, cancelled at year end", () => {
    const row = statedPolicyRow(
      {
        type: "pillar3a",
        insured: "self",
        premiumAnnual: 7258,
        mostlyRisk: true,
        endDate: "2026-12-31",
        cancelled: true,
      },
      single,
      "de",
    );
    expect(row).toMatchObject({
      insurer: "Versicherer unbekannt",
      isExternal: true,
      category: "pillar3a",
      pillar: "3a",
      premiumAnnual: 7258,
      endDate: "2026-12-31",
      details: { kind: "insurance_3a", mostlyRisk: true, cancelled: true, insurerUnknown: true },
    });
    expect(row.summary).toBe(
      "Versicherer unbekannt: 3a-Lebensversicherung, CHF 7'258 / Jahr, gekündigt per 31.12.2026",
    );
  });

  it("keeps death and disability policies as before", () => {
    const row = statedPolicyRow(
      { insurer: "Pax", type: "disability", insured: "self", annuityAnnual: 24000, endYear: 2056 },
      single,
      "en",
    );
    expect(row).toMatchObject({
      insurer: "Pax",
      isExternal: false,
      category: "risk_disability",
      endDate: "2056-12-31",
    });
  });

  it("recognises an unknown insurer in the customer's words", () => {
    expect(isUnknownInsurer(undefined)).toBe(true);
    expect(isUnknownInsurer("unbekannt")).toBe(true);
    expect(isUnknownInsurer("Keine Ahnung")).toBe(true);
    expect(isUnknownInsurer("AXA")).toBe(false);
  });
});

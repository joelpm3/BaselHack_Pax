import { describe, expect, it } from "vitest";
import type { IncomeBreakdown } from "@/lib/advisor/types";
import { summarizeTool } from "./tool-summary";

const breakdown = (gap: number): IncomeBreakdown => ({
  grossIncome: 90000,
  need: 72000,
  pillar1: 30000,
  pillar2: 20000,
  other: 0,
  partner: 0,
  policies: 0,
  total: 72000 - gap,
  gap,
  surplus: 0,
  capitalGap: 0,
});

describe("summarizeTool", () => {
  it("passes profile changes through for the shared formatter", () => {
    const changes = [{ path: "children", value: [{ birthYear: 2026 }, { birthYear: 2027 }] }];
    expect(summarizeTool("updateProfile", { status: "ok", changes })).toEqual({
      key: "profile",
      values: {},
      amounts: {},
      changes,
    });
    expect(summarizeTool("updateProfile", { status: "invalid", changes: [] })?.key).toBe(
      "profileInvalid",
    );
  });

  it("sums up a savings plan with goal, years and monthly amount", () => {
    const output = {
      status: "ok",
      params: { goal: 50000, years: 10, startCapital: 0 },
      monthly: 367,
    };
    expect(summarizeTool("calculateSavingsPlan", output)).toEqual({
      key: "savingsPlan",
      values: { years: 10 },
      amounts: { goal: 50000, monthly: 367 },
    });
  });

  it("reports the largest monthly risk gap across persons and scenarios", () => {
    const output = {
      status: "ok",
      dependentChildren: 0,
      assumptions: {},
      persons: [
        {
          person: 1,
          firstName: "Max",
          retired: false,
          scenarios: [
            { event: "disability", cause: "illness", breakdown: breakdown(12000) },
            { event: "death", cause: "illness", breakdown: breakdown(14532) },
          ],
        },
      ],
    };
    expect(summarizeTool("showRiskAnalysis", output)).toEqual({
      key: "risk",
      values: {},
      amounts: { gap: 1211 },
    });
  });

  it("says when every risk is covered or inputs are missing", () => {
    const covered = {
      status: "ok",
      persons: [{ scenarios: [{ breakdown: breakdown(0) }] }],
    };
    expect(summarizeTool("showRiskAnalysis", covered)?.key).toBe("riskCovered");
    expect(summarizeTool("showRiskAnalysis", { status: "missing", missing: ["income"] })).toEqual({
      key: "missing",
      values: { fields: "income" },
      amounts: {},
    });
  });

  it("names signed offers by policy number", () => {
    const offer = { productName: "Pax Todesfallversicherung", price: { annualGross: 732.3 } };
    expect(
      summarizeTool("prepareOffer", {
        status: "ok",
        offer,
        signed: { policyNumber: "PAX-2026-1" },
      }),
    ).toMatchObject({ key: "offerSigned", values: { policy: "PAX-2026-1" } });
    expect(summarizeTool("prepareOffer", { status: "ok", offer })).toMatchObject({
      key: "offer",
      amounts: { premium: 732.3 },
    });
  });

  it("returns null for unknown tools and unfinished calls", () => {
    expect(summarizeTool("somethingNew", { a: 1 })).toBeNull();
    expect(summarizeTool("showRiskAnalysis", null)).toBeNull();
  });
});

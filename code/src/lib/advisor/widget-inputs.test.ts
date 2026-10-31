import { describe, expect, it } from "vitest";
import { emptyLifeSituation, type LifeSituation } from "@/lib/domain/profile";
import {
  type CustomerInputs,
  changedKeys,
  chfText,
  saveCandidates,
  widgetChange,
  widgetChangeNote,
  widgetValuesOf,
  withoutCustomerInputs,
} from "./widget-inputs";

const compoundOutput = {
  status: "ok",
  params: { startAmount: 10_000, monthlySaving: 200, ratePercent: 2, years: 30 },
  basis: "general",
};

function profileWith(patch: Partial<LifeSituation>): LifeSituation {
  return { ...emptyLifeSituation(), ...patch };
}

function inputs(values: Record<string, number>, reported = compoundOutput.params): CustomerInputs {
  return { values, reported, updatedAt: 0 };
}

describe("widgetValuesOf", () => {
  it("takes the numeric params of a tool output", () => {
    expect(widgetValuesOf({ params: { goal: 50_000, years: 10, label: "x" } })).toEqual({
      goal: 50_000,
      years: 10,
    });
    expect(widgetValuesOf(null)).toEqual({});
    expect(widgetValuesOf({ status: "missing" })).toEqual({});
  });
});

describe("changedKeys", () => {
  it("lists only the values that moved", () => {
    expect(changedKeys({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual(["b"]);
    expect(changedKeys({ a: 1 }, { a: 1 })).toEqual([]);
    expect(changedKeys({ a: 1, b: 2 }, { a: 1 })).toEqual(["b"]);
  });
});

describe("saveCandidates", () => {
  const base = {
    tool: "explainCompoundInterest" as const,
    variant: "general",
    values: { startAmount: 20_000, monthlySaving: 500, ratePercent: 3, years: 25 },
    changed: ["startAmount", "monthlySaving", "ratePercent", "years"],
    profile: profileWith({}),
    askedPaths: new Set<string>(),
  };

  it("treats start amount and monthly saving as the customer's own figures, not rate or years", () => {
    expect(saveCandidates(base)).toEqual([
      { key: "startAmount", path: "assets.liquid", value: 20_000, stored: null },
      { key: "monthlySaving", path: "monthlySavings", value: 500, stored: null },
    ]);
  });

  it("maps the 3a variant to the 3a balance and the yearly contribution", () => {
    expect(saveCandidates({ ...base, variant: "pillar3a" })).toEqual([
      { key: "startAmount", path: "pillar3a.balance", value: 20_000, stored: null },
      { key: "monthlySaving", path: "pillar3a.annualContribution", value: 6_000, stored: null },
    ]);
  });

  it("skips values that match the profile and paths already asked about", () => {
    const profile = profileWith({
      assets: { liquid: 20_000 },
      monthlySavings: 300,
    });
    expect(saveCandidates({ ...base, profile })).toEqual([
      { key: "monthlySaving", path: "monthlySavings", value: 500, stored: 300 },
    ]);
    expect(saveCandidates({ ...base, profile, askedPaths: new Set(["monthlySavings"]) })).toEqual(
      [],
    );
  });

  it("skips values the customer did not change and zero amounts", () => {
    expect(saveCandidates({ ...base, changed: ["ratePercent"] })).toEqual([]);
    expect(
      saveCandidates({
        ...base,
        values: { ...base.values, startAmount: 0 },
        changed: ["startAmount"],
      }),
    ).toEqual([]);
  });

  it("never treats a what-if as the customer's figures", () => {
    expect(
      saveCandidates({
        ...base,
        tool: "simulateScenario",
        variant: "pillar3a",
        values: { yearlyAmount: 7_000 },
        changed: ["yearlyAmount"],
      }),
    ).toEqual([]);
  });

  it("offers the savings plan's start capital as savings, not the goal", () => {
    expect(
      saveCandidates({
        ...base,
        tool: "calculateSavingsPlan",
        variant: null,
        values: { goal: 80_000, years: 8, startCapital: 15_000 },
        changed: ["goal", "startCapital"],
      }),
    ).toEqual([{ key: "startCapital", path: "assets.liquid", value: 15_000, stored: null }]);
  });
});

describe("widgetChange", () => {
  it("is null while the widget shows what the advisor saw", () => {
    expect(
      widgetChange({
        toolCallId: "t1",
        tool: "explainCompoundInterest",
        output: compoundOutput,
        inputs: inputs(compoundOutput.params),
        profile: profileWith({}),
        askedPaths: new Set(),
      }),
    ).toBeNull();
  });

  it("reports only the keys changed since the last report", () => {
    const change = widgetChange({
      toolCallId: "t1",
      tool: "explainCompoundInterest",
      output: compoundOutput,
      inputs: inputs(
        { startAmount: 20_000, monthlySaving: 500, ratePercent: 2, years: 25 },
        { startAmount: 20_000, monthlySaving: 200, ratePercent: 2, years: 30 },
      ),
      profile: profileWith({}),
      askedPaths: new Set(),
    });
    expect(change?.changed).toEqual(["monthlySaving", "years"]);
    expect(change?.variant).toBe("general");
    expect(change?.candidates.map((c) => c.path)).toEqual(["monthlySavings"]);
  });

  it("keeps a 3a widget on the 3a fields while it shows example values", () => {
    const change = widgetChange({
      toolCallId: "t1",
      tool: "explainCompoundInterest",
      output: { ...compoundOutput, basis: "general", account: "pillar3a" },
      inputs: inputs({ ...compoundOutput.params, startAmount: 12_000 }),
      profile: profileWith({}),
      askedPaths: new Set(),
    });
    expect(change?.candidates.map((c) => c.path)).toEqual(["pillar3a.balance"]);
  });
});

describe("widgetChangeNote", () => {
  const change = {
    toolCallId: "t1",
    tool: "explainCompoundInterest" as const,
    variant: "general",
    values: { startAmount: 20_000, monthlySaving: 500, ratePercent: 2, years: 25 },
    changed: ["startAmount", "monthlySaving"],
    candidates: [
      { key: "startAmount", path: "assets.liquid" as const, value: 20_000, stored: 15_000 },
    ],
  };

  it("states the values and asks to confirm before saving", () => {
    const note = widgetChangeNote(change);
    expect(note).toContain(
      "compound interest widget to start amount CHF 20'000, CHF 500 per month, 2 % interest, 25 years",
    );
    expect(note).toContain("CHF 20'000 as savings today (assets.liquid; profile: CHF 15'000)");
    expect(note).toContain("only after a yes");
    expect(note.startsWith("[Note from the chat system")).toBe(true);
    expect(note.endsWith("]")).toBe(true);
  });

  it("tells the advisor not to ask when nothing is worth saving", () => {
    expect(widgetChangeNote({ ...change, candidates: [] })).toContain("Nothing to save");
  });

  it("marks a what-if as never to be saved", () => {
    const note = widgetChangeNote({
      toolCallId: "t2",
      tool: "simulateScenario",
      variant: "early_retirement",
      values: { retirementAge: 62 },
      changed: ["retirementAge"],
      candidates: [],
    });
    expect(note).toContain("what-if widget (early_retirement) to retirement at 62");
    expect(note).toContain("never offer to save");
  });
});

describe("helpers", () => {
  it("formats CHF with Swiss grouping", () => {
    expect(chfText(1_234_567.4)).toBe("CHF 1'234'567");
    expect(chfText(500)).toBe("CHF 500");
  });

  it("keeps the widget state out of what the model reads", () => {
    expect(withoutCustomerInputs({ status: "ok", customerInputs: inputs({}) })).toEqual({
      status: "ok",
    });
  });
});

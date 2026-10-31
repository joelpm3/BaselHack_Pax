import { describe, expect, it } from "vitest";
import { classifyTopic, topicOfMessage } from "./picture-topic";
import type { IncomeBreakdown } from "./types";

describe("classifyTopic", () => {
  it.each([
    // de
    [
      "Wie wären Sie abgesichert, wenn Sie wegen Krankheit nicht mehr arbeiten könnten?",
      "disability",
    ],
    ["Haben Sie schon eine Erwerbsunfähigkeitsversicherung?", "disability"],
    ["Die IV-Rente deckt nur einen Teil Ihres Lohns.", "disability"],
    ["Was würde Ihre Familie im Todesfall brauchen?", "death"],
    ["Ihre Partnerin bekäme eine Witwenrente.", "death"],
    ["Falls Ihnen etwas zustösst, wovon lebt dann Ihre Familie?", "death"],
    ["Möchten Sie Ihre Partnerin finanziell absichern?", "death"],
    ["Mit wie vielen Jahren möchten Sie sich pensionieren lassen?", "retirement"],
    ["Was ist Ihnen für die Pension wichtig?", "retirement"],
    // fr
    ["Et en cas d'invalidité, de quoi vivriez-vous ?", "disability"],
    ["Recevez-vous une rente AI ?", "disability"],
    ["En cas de décès, votre famille serait-elle protégée ?", "death"],
    ["À quel âge souhaitez-vous prendre votre retraite ?", "retirement"],
    // it
    ["In caso di invalidità, quanto le mancherebbe?", "disability"],
    ["In caso di decesso, i superstiti riceverebbero una rendita.", "death"],
    ["Quando vorrebbe andare in pensione?", "retirement"],
    // en
    ["What if you could no longer work because of a disability?", "disability"],
    ["Would your family manage if you were to die?", "death"],
    ["Your retirement is covered. What would happen if your partner dies?", "death"],
    ["When would you like to retire?", "retirement"],
  ] as const)("%s → %s", (text, kind) => {
    expect(classifyTopic(text)).toBe(kind);
  });

  it.each([
    "Wie hoch ist Ihr Bruttolohn pro Jahr?",
    "Die AHV/IV ist die erste Säule.",
    "I'm Clara, an AI, not a person.",
    "Dies ist Ihr Vorsorgebild, und die Zahlen sind gerundet.",
    "Your pension fund statement shows the details.",
    "Haben Sie Kinder?",
  ])("names no situation: %s", (text) => {
    expect(classifyTopic(text)).toBeNull();
  });

  it("lets the last sentence that names a situation decide", () => {
    expect(
      classifyTopic(
        "Für die Pension sieht es gut aus. Bei Invalidität fehlen Ihnen aber CHF 1'200 im Monat. Möchten Sie das anschauen?",
      ),
    ).toBe("disability");
    expect(
      classifyTopic(
        "Im Todesfall sind Sie gut abgedeckt.\n\nWie sieht es bei der Pensionierung aus?",
      ),
    ).toBe("retirement");
  });

  it("gives a tie to the situation named first", () => {
    expect(
      classifyTopic("Wie wäre Ihre Familie bei Invalidität oder im Todesfall abgesichert?"),
    ).toBe("disability");
  });

  it("weighs the partner cue below a named situation", () => {
    expect(
      classifyTopic("Möchten Sie Ihre Partnerin für den Fall einer Invalidität absichern?"),
    ).toBe("disability");
  });
});

const breakdown = (gap: number): IncomeBreakdown => ({
  grossIncome: 100_000,
  need: 6000,
  pillar1: 0,
  pillar2: 0,
  other: 0,
  partner: 0,
  policies: 0,
  total: 6000 - gap,
  gap,
  surplus: 0,
  capitalGap: 0,
});

const risk = (disabilityGap: number, deathGap: number) => ({
  type: "tool-showRiskAnalysis",
  state: "output-available",
  output: {
    status: "ok",
    persons: [
      {
        person: 1,
        firstName: null,
        retired: false,
        scenarios: [
          { event: "disability", cause: "illness", breakdown: breakdown(disabilityGap) },
          { event: "death", cause: "illness", breakdown: breakdown(deathGap) },
        ],
      },
    ],
  },
});

const comparison = (kind: string, before: number, after: number) => ({
  kind,
  person: 1,
  firstName: null,
  before: breakdown(before),
  after: breakdown(after),
});

describe("topicOfMessage", () => {
  it("uses the latest text after a widget", () => {
    expect(
      topicOfMessage([
        risk(5000, 100),
        { type: "text", text: "Und für den Todesfall: haben Sie eine Police?" },
      ]),
    ).toBe("death");
  });

  it("falls back to the widget when the closing text names no situation", () => {
    expect(topicOfMessage([risk(100, 5000), { type: "text", text: "Was denken Sie?" }])).toBe(
      "death",
    );
    expect(topicOfMessage([risk(800, 800)])).toBe("disability");
  });

  it("ignores a risk widget still loading and the quick replies", () => {
    expect(
      topicOfMessage([
        { type: "text", text: "Schauen wir Ihre Pensionierung an." },
        { type: "tool-showRiskAnalysis", state: "input-available" },
        {
          type: "tool-suggestReplies",
          state: "output-available",
          output: { options: ["Todesfall"] },
        },
      ]),
    ).toBe("retirement");
  });

  it("maps the pension overview and retirement what-ifs to retirement", () => {
    expect(topicOfMessage([{ type: "tool-showPensionOverview", state: "output-available" }])).toBe(
      "retirement",
    );
    expect(
      topicOfMessage([
        {
          type: "tool-simulateScenario",
          state: "input-available",
          input: { scenario: "early_retirement" },
        },
      ]),
    ).toBe("retirement");
  });

  it("maps a child what-if to the situation whose gap grows most", () => {
    expect(
      topicOfMessage([
        {
          type: "tool-simulateScenario",
          state: "output-available",
          input: { scenario: "child" },
          output: {
            status: "ok",
            comparisons: [comparison("disability", 100, 300), comparison("death", 100, 900)],
          },
        },
      ]),
    ).toBe("death");
  });

  it("returns null for a message about something else", () => {
    expect(topicOfMessage([{ type: "text", text: "Wo wohnen Sie?" }])).toBeNull();
    expect(topicOfMessage([])).toBeNull();
  });
});

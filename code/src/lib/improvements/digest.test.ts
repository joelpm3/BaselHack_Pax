import { describe, expect, it } from "vitest";
import { type ConversationDigest, computeStats, formatDigest, prioritise } from "./digest";

function digest(overrides: Partial<ConversationDigest>): ConversationDigest {
  return {
    id: "c",
    stage: "getting_to_know",
    status: "active",
    mode: "new_business",
    locale: "de",
    isSimulated: false,
    messageCount: 4,
    summary: null,
    sentiment: "neutral",
    painPoints: [],
    handoverRequired: false,
    nps: null,
    feedbackComment: null,
    flags: [],
    toolErrors: 0,
    transcript: "CUSTOMER: Hallo",
    ...overrides,
  };
}

describe("computeStats", () => {
  it("counts drop-offs, NPS, flags and missed handovers", () => {
    const stats = computeStats([
      digest({ id: "a", status: "abandoned", stage: "situation_captured", nps: 3 }),
      digest({ id: "b", status: "handed_over", handoverRequired: true, nps: 9 }),
      digest({ id: "c", handoverRequired: true, flags: ["zu früh Zahlen"], sentiment: "negative" }),
      digest({
        id: "d",
        status: "idle",
        stage: "recommendation_shown",
        isSimulated: true,
        toolErrors: 2,
      }),
    ]);
    expect(stats.conversations).toBe(4);
    expect(stats.simulated).toBe(1);
    expect(stats.droppedBeforeRecommendation).toBe(1);
    expect(stats.npsAverage).toBe(6);
    expect(stats.detractors).toBe(1);
    expect(stats.flagged).toBe(1);
    expect(stats.handedOver).toBe(1);
    expect(stats.missedHandovers).toBe(1);
    expect(stats.negativeSentiment).toBe(1);
    expect(stats.toolErrors).toBe(2);
    expect(stats.endedAtStage.getting_to_know).toBe(2);
  });

  it("has no NPS average without feedback", () => {
    expect(computeStats([digest({})]).npsAverage).toBeNull();
  });
});

describe("prioritise", () => {
  it("puts flagged and unhappy conversations first and keeps order otherwise", () => {
    const list = [
      digest({ id: "plain1" }),
      digest({ id: "unhappy", nps: 2 }),
      digest({ id: "plain2" }),
      digest({ id: "flagged", flags: ["x"] }),
    ];
    expect(prioritise(list, 3).map((d) => d.id)).toEqual(["flagged", "unhappy", "plain1"]);
  });
});

describe("formatDigest", () => {
  it("marks advisor flags and missed handovers", () => {
    const text = formatDigest(
      digest({ id: "x1", flags: ["Antwort falsch"], handoverRequired: true }),
    );
    expect(text).toContain("### Conversation x1");
    expect(text).toContain('ADVISOR FLAGGED AS NOT GOOD: "Antwort falsch"');
    expect(text).toContain("handover required but none happened");
  });
});

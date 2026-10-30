import { describe, expect, it } from "vitest";
import { SITUATION_CAPTURED_AT, stageAfterTurn } from "./stage";

const facts = { completedTools: [], completeness: 0, hasUserMessage: true };

describe("stageAfterTurn", () => {
  it("moves to getting to know after the first message", () => {
    expect(stageAfterTurn("started", facts)).toBe("getting_to_know");
    expect(stageAfterTurn("started", { ...facts, hasUserMessage: false })).toBe("started");
  });

  it("captures the situation once the core profile is known", () => {
    expect(
      stageAfterTurn("getting_to_know", { ...facts, completeness: SITUATION_CAPTURED_AT }),
    ).toBe("situation_captured");
  });

  it("follows the furthest tool of the turn", () => {
    expect(
      stageAfterTurn("getting_to_know", {
        ...facts,
        completedTools: ["updateProfile", "showRiskAnalysis", "simulateScenario"],
      }),
    ).toBe("scenario_explored");
    expect(stageAfterTurn("analysis_shown", { ...facts, completedTools: ["prepareOffer"] })).toBe(
      "offer_viewed",
    );
  });

  it("never moves backwards", () => {
    expect(
      stageAfterTurn("offer_viewed", { ...facts, completedTools: ["showPensionOverview"] }),
    ).toBe("offer_viewed");
  });
});

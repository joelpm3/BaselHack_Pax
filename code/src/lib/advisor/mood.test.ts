import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { answerMood } from "./mood";

type Parts = UIMessage["parts"];

const text = (value: string): Parts => [{ type: "text", text: value }];
const tool = (name: string): Parts[number] =>
  ({
    type: `tool-${name}`,
    toolCallId: "call-1",
    state: "output-available",
    input: {},
    output: {},
  }) as Parts[number];

describe("answerMood", () => {
  it("starts from the request while nothing is written yet", () => {
    expect(answerMood("neutral", [])).toBe("neutral");
    expect(answerMood("curious", [])).toBe("curious");
  });

  it("turns curious when Clara asks a question", () => {
    expect(answerMood("neutral", text("Danke. Arbeiten Sie beide?"))).toBe("curious");
  });

  it("stays neutral for a plain statement", () => {
    expect(answerMood("neutral", text("Die AHV ist die erste Säule."))).toBe("neutral");
  });

  it("keeps good news and worries even when Clara asks back", () => {
    expect(answerMood("happy", text("Gratulation! Wann kommt das Kind?"))).toBe("happy");
    expect(answerMood("empathetic", text("Das verstehe ich. Darf ich nachfragen?"))).toBe(
      "empathetic",
    );
  });

  it("is confident once Clara recommends or prepares an offer", () => {
    expect(answerMood("empathetic", [...text("Ich empfehle:"), tool("recommendProducts")])).toBe(
      "confident",
    );
    expect(answerMood("neutral", [tool("prepareOffer")])).toBe("confident");
  });

  it("ignores other tools", () => {
    expect(answerMood("neutral", [tool("updateProfile")])).toBe("neutral");
  });
});

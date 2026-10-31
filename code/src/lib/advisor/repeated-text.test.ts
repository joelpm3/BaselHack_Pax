import { describe, expect, it } from "vitest";
import { withoutRepeatedText } from "./repeated-text";

describe("withoutRepeatedText", () => {
  it("drops a text part that repeats an earlier one after a tool call", () => {
    const parts = [
      { type: "step-start" },
      { type: "text", text: "Wie alt sind Sie beide?" },
      { type: "tool-updateProfile" },
      { type: "step-start" },
      { type: "text", text: "Wie alt sind Sie beide? " },
    ];
    expect(withoutRepeatedText(parts)).toEqual(parts.slice(0, 4));
  });

  it("hides the repeat while it is still streaming", () => {
    const parts = [
      { type: "text", text: "Gerne schauen wir gemeinsam, wie Sie Ihr Erspartes aufstellen." },
      { type: "tool-updateProfile" },
      { type: "text", text: "Gerne schauen wir gemeinsam, wie" },
    ];
    expect(withoutRepeatedText(parts)).toEqual(parts.slice(0, 2));
    expect(withoutRepeatedText([parts[0], { type: "text", text: "Gerne" }])).toHaveLength(2);
  });

  it("keeps different texts and non-text parts", () => {
    const parts = [
      { type: "text", text: "Kurz notiert." },
      { type: "tool-showRiskAnalysis" },
      {
        type: "text",
        text: "Bei Krankheit fehlen rund CHF 1'200 pro Monat. Wollen wir das anschauen?",
      },
    ];
    expect(withoutRepeatedText(parts)).toEqual(parts);
  });
});

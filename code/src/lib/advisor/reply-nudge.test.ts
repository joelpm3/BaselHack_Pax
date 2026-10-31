import { describe, expect, it } from "vitest";
import { REPLY_NUDGE, replyNudgeFor, WIDGET_REPLY_NUDGE, withReplyNudge } from "./reply-nudge";

const WAITING = ["suggestReplies", "suggestDocumentUpload"];
const step = (text: string, ...tools: string[]) => ({
  text,
  toolCalls: tools.map((toolName) => ({ toolName })),
});

describe("replyNudgeFor", () => {
  it("asks for the message after any tool while nothing was written", () => {
    expect(replyNudgeFor([step("", "updateProfile")], WAITING)).toBe(REPLY_NUDGE);
    expect(replyNudgeFor([step("", "calculateSomethingNew")], WAITING)).toBe(REPLY_NUDGE);
  });

  it("is firmer after a widget that waits for the customer", () => {
    expect(
      replyNudgeFor(
        [step("", "updateProfile"), step("", "calculateTaxSavings", "suggestReplies")],
        WAITING,
      ),
    ).toBe(WIDGET_REPLY_NUDGE);
  });

  it("stays out of the way once text exists or no tool ran", () => {
    expect(replyNudgeFor([step("Wie alt sind Sie?", "suggestReplies")], WAITING)).toBeNull();
    expect(
      replyNudgeFor(
        [step("Kurz notiert.", "updateProfile"), step("", "showRiskAnalysis")],
        WAITING,
      ),
    ).toBeNull();
    expect(replyNudgeFor([], WAITING)).toBeNull();
  });
});

describe("withReplyNudge", () => {
  it("appends the note as a user message and keeps the transcript", () => {
    const messages = [{ role: "user" as const, content: "Hallo" }];
    expect(withReplyNudge(messages, REPLY_NUDGE)).toEqual([
      ...messages,
      { role: "user", content: [{ type: "text", text: REPLY_NUDGE }] },
    ]);
  });
});

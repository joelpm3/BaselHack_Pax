import { describe, expect, it } from "vitest";
import {
  continueNudge,
  REPLY_NUDGE,
  readyToWait,
  replyNudgeFor,
  WIDGET_REPLY_NUDGE,
  withReplyNudge,
} from "./reply-nudge";

const WAITING = ["suggestReplies", "askForFeedback"];
const step = (text: string, ...tools: string[]) => ({
  text,
  toolCalls: tools.map((toolName) => ({ toolName })),
});

describe("replyNudgeFor", () => {
  it("asks for the message after any tool while nothing was written", () => {
    expect(replyNudgeFor([step("", "updateProfile")], WAITING)).toBe(REPLY_NUDGE);
    expect(replyNudgeFor([step("", "calculateSomethingNew")], WAITING)).toBe(REPLY_NUDGE);
    expect(
      replyNudgeFor(
        [step("", "updateProfile"), step("", "calculateTaxSavings", "suggestReplies")],
        WAITING,
      ),
    ).toBe(WIDGET_REPLY_NUDGE);
  });

  it("asks to finish a message that stops before its question", () => {
    const steps = [
      step(
        "Ich habe Ihren Wohnort geändert. Ich brauche noch eine letzte Angabe.",
        "updateProfile",
      ),
    ];
    expect(replyNudgeFor(steps, WAITING)).toBe(
      continueNudge("Ich habe Ihren Wohnort geändert. Ich brauche noch eine letzte Angabe."),
    );
    expect(replyNudgeFor([step("Ich rechne das durch.", "showRiskAnalysis")], WAITING)).toContain(
      "Ich rechne das durch.",
    );
  });

  it("stays out of the way once the message ends with a question or no tool ran", () => {
    expect(replyNudgeFor([step("Wie alt sind Sie?", "updateProfile")], WAITING)).toBeNull();
    expect(replyNudgeFor([step("Wie alt sind Sie?")], WAITING)).toBeNull();
    expect(replyNudgeFor([], WAITING)).toBeNull();
  });
});

describe("readyToWait", () => {
  it("ends the turn at a waiting widget once the message stands on its own", () => {
    expect(readyToWait([step("Wie hilfreich war das Gespräch?", "askForFeedback")], WAITING)).toBe(
      true,
    );
    expect(readyToWait([step("Danke für das Gespräch.", "askForFeedback")], WAITING)).toBe(true);
  });

  it("keeps going when the message is missing or dangling", () => {
    expect(readyToWait([step("", "suggestReplies")], WAITING)).toBe(false);
    expect(
      readyToWait([step("Beim Rückruf geht es um diese Punkte:", "askForFeedback")], WAITING),
    ).toBe(false);
    expect(readyToWait([step("Kurz notiert.", "updateProfile")], WAITING)).toBe(false);
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

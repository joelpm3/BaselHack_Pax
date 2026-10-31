import { describe, expect, it } from "vitest";
import { needsReplyNudge, REPLY_NUDGE, withReplyNudge } from "./reply-nudge";

const WAITING = ["suggestReplies", "suggestDocumentUpload"];
const step = (text: string, ...tools: string[]) => ({
  text,
  toolCalls: tools.map((toolName) => ({ toolName })),
});

describe("needsReplyNudge", () => {
  it("nudges after a widget when nothing was written yet", () => {
    expect(needsReplyNudge([step("", "updateProfile"), step("", "suggestReplies")], WAITING)).toBe(
      true,
    );
  });

  it("does not nudge once text exists or when the last step was no widget", () => {
    expect(needsReplyNudge([step("Wie alt sind Sie?", "suggestReplies")], WAITING)).toBe(false);
    expect(needsReplyNudge([step("", "updateProfile")], WAITING)).toBe(false);
    expect(needsReplyNudge([], WAITING)).toBe(false);
  });
});

describe("withReplyNudge", () => {
  it("appends the note as a user message and keeps the transcript", () => {
    const messages = [{ role: "user" as const, content: "Hallo" }];
    expect(withReplyNudge(messages)).toEqual([
      ...messages,
      { role: "user", content: [{ type: "text", text: REPLY_NUDGE }] },
    ]);
  });
});

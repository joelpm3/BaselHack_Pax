import { describe, expect, it } from "vitest";
import { appendTranscript, autoSendSeconds, isSpaceShortcutFree } from "./talk";

describe("appendTranscript", () => {
  it("starts with the transcript when nothing was said yet", () => {
    expect(appendTranscript("  ", " ich bin 38 ")).toBe("ich bin 38");
  });
  it("adds the next utterance with one space", () => {
    expect(appendTranscript("ich bin 38 ", "und verheiratet")).toBe("ich bin 38 und verheiratet");
  });
  it("keeps the draft when the transcript is empty", () => {
    expect(appendTranscript("ich bin 38", " ")).toBe("ich bin 38");
  });
});

describe("autoSendSeconds", () => {
  it("gives short answers the minimum", () => {
    expect(autoSendSeconds("ja genau")).toBe(4);
  });
  it("grows with the length of the transcript", () => {
    expect(autoSendSeconds(Array(36).fill("wort").join(" "))).toBe(7);
  });
  it("is capped for very long transcripts", () => {
    expect(autoSendSeconds(Array(400).fill("wort").join(" "))).toBe(10);
  });
});

describe("isSpaceShortcutFree", () => {
  const element = (tagName: string, interactive: boolean, isContentEditable = false) => ({
    tagName,
    isContentEditable,
    closest: () => (interactive ? {} : null),
  });

  it("is free on the page body and plain content", () => {
    expect(isSpaceShortcutFree(null)).toBe(true);
    expect(isSpaceShortcutFree(element("BODY", false))).toBe(true);
    expect(isSpaceShortcutFree(element("P", false))).toBe(true);
  });
  it("is not free in fields, on controls or in editable content", () => {
    expect(isSpaceShortcutFree(element("TEXTAREA", true))).toBe(false);
    expect(isSpaceShortcutFree(element("BUTTON", true))).toBe(false);
    expect(isSpaceShortcutFree(element("DIV", false, true))).toBe(false);
  });
});

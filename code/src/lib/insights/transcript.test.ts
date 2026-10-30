import { describe, expect, it } from "vitest";
import {
  compactJson,
  messageItems,
  messageText,
  toolNameOf,
  transcriptForModel,
} from "./transcript";

describe("transcript helpers", () => {
  it("reads tool names from static and dynamic tool parts", () => {
    expect(toolNameOf({ type: "tool-riskCheck" })).toBe("riskCheck");
    expect(toolNameOf({ type: "dynamic-tool", toolName: "quote" })).toBe("quote");
    expect(toolNameOf({ type: "text", text: "hi" })).toBeNull();
  });

  it("keeps text, tools and files, and drops step markers and reasoning", () => {
    const items = messageItems([
      { type: "step-start" },
      { type: "reasoning", text: "thinking" },
      { type: "text", text: "  Hallo  " },
      {
        type: "tool-riskCheck",
        toolCallId: "t1",
        state: "output-available",
        input: { a: 1 },
        output: { gap: 7200 },
      },
      { type: "file", filename: "ausweis.pdf", mediaType: "application/pdf" },
    ]);
    expect(items.map((i) => i.kind)).toEqual(["text", "tool", "file"]);
    expect(items[0]).toEqual({ kind: "text", text: "Hallo" });
  });

  it("builds a labelled transcript with compact tool results", () => {
    const text = transcriptForModel([
      { role: "user", parts: [{ type: "text", text: "Was kostet eine Todesfallversicherung?" }] },
      {
        role: "assistant",
        parts: [
          { type: "text", text: "Das hängt von der Summe ab." },
          {
            type: "tool-quote",
            state: "output-available",
            input: { sum: 150000 },
            output: { premium: 1384.8 },
          },
        ],
      },
    ]);
    expect(text).toContain("CUSTOMER: Was kostet");
    expect(text).toContain("ADVISOR: Das hängt");
    expect(text).toContain('[tool quote] input={"sum":150000} → {"premium":1384.8}');
  });

  it("keeps the end of very long transcripts", () => {
    const long = Array.from({ length: 50 }, (_, i) => ({
      role: "user" as const,
      parts: [{ type: "text", text: `Nachricht ${i} ${"x".repeat(50)}` }],
    }));
    const text = transcriptForModel(long, 500);
    expect(text.length).toBeLessThanOrEqual(502);
    expect(text).toContain("Nachricht 49");
    expect(text).not.toContain("Nachricht 0 ");
  });

  it("joins text parts and truncates JSON", () => {
    expect(
      messageText([{ type: "text", text: "a" }, { type: "tool-x" }, { type: "text", text: "b" }]),
    ).toBe("a\nb");
    expect(compactJson({ long: "y".repeat(1000) }, 50)).toHaveLength(50);
    expect(compactJson(undefined)).toBe("");
  });
});

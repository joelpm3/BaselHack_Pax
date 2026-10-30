import { describe, expect, it } from "vitest";
import { parseBlocks } from "./markdown";

describe("parseBlocks", () => {
  it("splits paragraphs and keeps line breaks inside one", () => {
    expect(parseBlocks("Erste Zeile\nzweite Zeile\n\nNeuer Absatz")).toEqual([
      { kind: "p", lines: ["Erste Zeile", "zweite Zeile"] },
      { kind: "p", lines: ["Neuer Absatz"] },
    ]);
  });

  it("groups bullet and numbered lists", () => {
    expect(parseBlocks("Intro\n- eins\n* zwei\n1. drei\n2) vier")).toEqual([
      { kind: "p", lines: ["Intro"] },
      { kind: "ul", items: ["eins", "zwei"] },
      { kind: "ol", items: ["drei", "vier"] },
    ]);
  });

  it("drops heading markers", () => {
    expect(parseBlocks("## Titel")).toEqual([{ kind: "p", lines: ["Titel"] }]);
  });
});

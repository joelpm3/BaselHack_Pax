import { describe, expect, it } from "vitest";
import { chunkSections, foldText, searchSections, tokenize } from "./retrieval";

const sections = [
  {
    heading: "Leistungen",
    page: 1,
    text: "Im Todesfall wird das vereinbarte Todesfallkapital ausbezahlt.",
  },
  {
    heading: "Wartefristen",
    page: 2,
    text: "Die Leistung bei Erwerbsunfähigkeit beginnt nach einer Wartefrist von 24 Monaten.",
  },
  { heading: "Prämienbefreiung", page: 2, text: "Bei Erwerbsunfähigkeit entfällt die Prämie." },
  { heading: "Kündigung", page: 3, text: "Der Vertrag kann jährlich gekündigt werden." },
];
const items = sections.map((section, i) => ({ ref: i, section }));

describe("tokenize", () => {
  it("folds umlauts and drops stopwords", () => {
    expect(foldText("Prämie für Kündigung")).toBe("praemie fuer kuendigung");
    expect(tokenize("Wie lange ist die Wartefrist?")).toEqual(["lange", "wartefrist"]);
  });
});

describe("searchSections", () => {
  it("finds plural and compound forms", () => {
    const hits = searchSections(items, "Wartefrist bei Erwerbsunfähigkeit");
    expect(hits[0]?.ref).toBe(1);
    expect(hits[0]?.matched).toContain("wartefrist");
  });

  it("ranks heading matches above body matches", () => {
    const hits = searchSections(items, "Prämie");
    expect(hits[0]?.ref).toBe(2);
  });

  it("returns nothing when no word matches", () => {
    expect(searchSections(items, "Hypothek Zinsen")).toEqual([]);
    expect(searchSections(items, "die der das")).toEqual([]);
  });

  it("respects the limit", () => {
    expect(searchSections(items, "Erwerbsunfähigkeit Prämie Todesfall", 2)).toHaveLength(2);
  });
});

describe("chunkSections", () => {
  it("drops empty sections and keeps short ones whole", () => {
    expect(chunkSections([{ heading: "A", page: 1, text: "  " }, sections[0]])).toEqual([
      sections[0],
    ]);
  });

  it("splits long sections at paragraphs, then words", () => {
    const paragraph = "Wort ".repeat(200).trim();
    const chunks = chunkSections([
      { heading: "Lang", page: 4, text: `${paragraph}\n\n${paragraph}\n\n${"x".repeat(3000)}` },
    ]);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((c) => c.text.length <= 1400)).toBe(true);
    expect(chunks[0]?.heading).toBe("Lang");
    expect(chunks[1]?.heading).toBe("Lang (Forts.)");
    expect(chunks.every((c) => c.page === 4)).toBe(true);
  });
});

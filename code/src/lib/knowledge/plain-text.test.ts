import { describe, expect, it } from "vitest";
import { sectionsFromMarkdown, sectionsFromPdfText } from "./plain-text";

describe("sectionsFromPdfText", () => {
  it("makes one section per page, headed by its first line", () => {
    const text =
      "PAX TODESFALL\n\nVorsorgeart        Säule 3b\n\fLeistungen\n  Todesfallkapital   CHF 100'000\n\f";
    expect(sectionsFromPdfText(text)).toEqual([
      { heading: "PAX TODESFALL", page: 1, text: "PAX TODESFALL\nVorsorgeart · Säule 3b" },
      { heading: "Leistungen", page: 2, text: "Leistungen\nTodesfallkapital · CHF 100'000" },
    ]);
  });
});

describe("sectionsFromMarkdown", () => {
  it("splits on headings and drops the crawl source line", () => {
    const md =
      "# Pax 3a\n\n> Source: https://www.pax.ch (crawled)\n\n## Warum Pax 3a?\n\nSie sparen Steuern.\n\n#### Leer\n";
    expect(sectionsFromMarkdown(md)).toEqual([
      { heading: "Warum Pax 3a?", page: null, text: "Sie sparen Steuern." },
    ]);
  });
});

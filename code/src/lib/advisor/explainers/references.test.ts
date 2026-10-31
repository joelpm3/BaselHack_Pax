import { describe, expect, it } from "vitest";
import deMessages from "../../../../messages/de/explainers.json";
import enMessages from "../../../../messages/en/explainers.json";
import frMessages from "../../../../messages/fr/explainers.json";
import itMessages from "../../../../messages/it/explainers.json";
import { articleLink, isPaxArticleId, PAX_ARTICLE_IDS, PAX_ARTICLES } from "./references";

describe("Pax article catalogue", () => {
  it("links only to pax.ch pages in the matching language", () => {
    for (const id of PAX_ARTICLE_IDS) {
      for (const lang of ["de", "fr", "it"] as const) {
        const path = PAX_ARTICLES[id][lang];
        expect(path.startsWith(`/${lang}/`)).toBe(true);
        expect(articleLink(id, lang).url).toBe(`https://www.pax.ch${path}`);
      }
    }
  });

  it("uses the German page for English", () => {
    expect(articleLink("pillar3a_tax", "en")).toEqual({
      url: "https://www.pax.ch/de/ratgeber/vorsorge/steuerersparnis-saeule-3a",
      lang: "de",
    });
  });

  it("rejects ids outside the catalogue", () => {
    expect(isPaxArticleId("compound_interest")).toBe(true);
    expect(isPaxArticleId("made_up")).toBe(false);
    expect(isPaxArticleId("toString")).toBe(false);
  });

  it("has a title for every article in every language", () => {
    for (const messages of [deMessages, frMessages, itMessages, enMessages]) {
      const titles = messages.references.articles as Record<string, string>;
      expect(Object.keys(titles).sort()).toEqual([...PAX_ARTICLE_IDS].sort());
    }
  });
});

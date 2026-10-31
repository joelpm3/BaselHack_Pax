import type { KnowledgeSection } from "@/lib/domain/learning";

/**
 * Keyword retrieval over the sections of the company's product documents. No embeddings: the
 * documents are few and short, and the advisor phrases its question in the documents' own
 * vocabulary (German product terms). Matching is accent-insensitive and tolerant of German
 * compounds ("Wartefrist" finds "Wartefristen", "Prämie" finds "Prämienbefreiung").
 */

const STOPWORDS = new Set(
  [
    // de
    "der die das den dem des ein eine einer eines einem einen und oder aber ist sind wird werden",
    "wie was wer wann wo welche welcher welches gibt es bei mit von für fuer auf aus nach zum zur",
    "im in an am ich sie er wir ihr kann können koennen muss müssen muessen soll hat haben nicht",
    "auch noch nur wenn dann als bis über ueber unter vor durch ohne pax",
    // fr
    "le la les un une des du de et ou est sont pour avec sur dans par que qui quoi quel quelle",
    // it
    "il lo gli una del della dei delle per con che chi cosa quale sono",
    // en
    "the a an and or is are for with of to in on what which how when does do can",
  ]
    .join(" ")
    .split(/\s+/),
);

const MIN_TOKEN = 3;
/** Query tokens at least this long also match inside longer document words (compounds). */
const MIN_INFIX = 5;
const SECTION_MAX_CHARS = 1400;

export function foldText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function tokenize(value: string): string[] {
  return foldText(value)
    .split(/[^a-z0-9]+/)
    .filter((t) => (t.length >= MIN_TOKEN || /^\d+$/.test(t)) && !STOPWORDS.has(t));
}

/** Plural/inflection tolerant: "fristen" ~ "frist", "praemien" ~ "praemie". */
function matches(query: string, word: string): boolean {
  if (word === query) return true;
  const shorter = query.length <= word.length ? query : word;
  const longer = shorter === query ? word : query;
  if (shorter.length >= 4 && longer.startsWith(shorter) && longer.length - shorter.length <= 2)
    return true;
  return query.length >= MIN_INFIX && word.includes(query);
}

/** Splits long sections at paragraph boundaries so one hit does not return a whole document. */
export function chunkSections(sections: KnowledgeSection[]): KnowledgeSection[] {
  return sections.flatMap((section) => {
    const text = section.text.trim();
    if (!text) return [];
    if (text.length <= SECTION_MAX_CHARS) return [{ ...section, text }];
    const chunks: string[] = [];
    let current = "";
    for (const paragraph of text.split(/\n{2,}|\n(?=[-•*]\s)/)) {
      const next = current ? `${current}\n\n${paragraph}` : paragraph;
      if (next.length > SECTION_MAX_CHARS && current) {
        chunks.push(current);
        current = paragraph;
      } else current = next;
    }
    if (current) chunks.push(current);
    // A single paragraph longer than the limit is cut hard, at a word boundary.
    return chunks.flatMap((chunk, i) => {
      const parts: string[] = [];
      let rest = chunk;
      while (rest.length > SECTION_MAX_CHARS) {
        const cut = rest.lastIndexOf(" ", SECTION_MAX_CHARS);
        const at = cut > SECTION_MAX_CHARS / 2 ? cut : SECTION_MAX_CHARS;
        parts.push(rest.slice(0, at).trim());
        rest = rest.slice(at).trim();
      }
      if (rest) parts.push(rest);
      return parts.map((text, j) => ({
        heading: i + j === 0 ? section.heading : `${section.heading} (Forts.)`,
        page: section.page,
        text,
      }));
    });
  });
}

export interface Searchable<T> {
  ref: T;
  section: KnowledgeSection;
}

export interface SearchHit<T> extends Searchable<T> {
  score: number;
  matched: string[];
}

/**
 * Ranks sections by the query words they contain, weighted by rarity across all searched
 * sections (a word in every section says little) and doubled for heading matches.
 */
export function searchSections<T>(
  items: Array<Searchable<T>>,
  query: string,
  limit = 3,
): Array<SearchHit<T>> {
  const terms = [...new Set(tokenize(query))];
  if (terms.length === 0 || items.length === 0) return [];
  const indexed = items.map((item) => ({
    item,
    heading: new Set(tokenize(item.section.heading)),
    body: new Set(tokenize(item.section.text)),
  }));
  const has = (words: Set<string>, term: string) => {
    for (const word of words) if (matches(term, word)) return true;
    return false;
  };
  const weight = new Map(
    terms.map((term) => {
      const df = indexed.filter((d) => has(d.heading, term) || has(d.body, term)).length;
      return [term, df === 0 ? 0 : Math.log(1 + indexed.length / df)];
    }),
  );
  return indexed
    .map(({ item, heading, body }) => {
      let score = 0;
      const matched: string[] = [];
      for (const term of terms) {
        const w = weight.get(term) ?? 0;
        if (w === 0) continue;
        const inHeading = has(heading, term);
        if (inHeading || has(body, term)) {
          score += inHeading ? w * 2 : w;
          matched.push(term);
        }
      }
      return { ...item, score, matched };
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

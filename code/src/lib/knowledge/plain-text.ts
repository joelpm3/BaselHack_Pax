import type { KnowledgeSection } from "@/lib/domain/learning";

const MAX_HEADING = 90;

function cleanLine(line: string): string {
  // pdftotext -layout aligns table columns with runs of spaces: keep them apart as "label · value".
  return line
    .trim()
    .replace(/\s{3,}/g, " · ")
    .replace(/\s{2}/g, " ");
}

function heading(lines: string[], fallback: string): string {
  const first = lines.find((l) => l.length > 2) ?? fallback;
  return first.length > MAX_HEADING ? `${first.slice(0, MAX_HEADING - 1)}…` : first;
}

/** Sections from a `pdftotext -layout` extract: one per page (pages end with a form feed). */
export function sectionsFromPdfText(text: string): KnowledgeSection[] {
  return text
    .split("\f")
    .map((page, index) => {
      const lines = page.split("\n").map(cleanLine).filter(Boolean);
      return {
        heading: heading(lines, `Seite ${index + 1}`),
        page: index + 1,
        text: lines.join("\n"),
      };
    })
    .filter((s) => s.text.length > 0);
}

/** Sections from a crawled website page in Markdown: one per heading, source line dropped. */
export function sectionsFromMarkdown(markdown: string): KnowledgeSection[] {
  const sections: KnowledgeSection[] = [];
  let current: { heading: string; lines: string[] } | null = null;
  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    const match = /^#{1,6}\s+(.*)$/.exec(line);
    if (match) {
      if (current)
        sections.push({ heading: current.heading, page: null, text: current.lines.join("\n") });
      current = { heading: match[1].trim(), lines: [] };
    } else if (line && !line.startsWith("> Source:")) {
      current ??= { heading: "Einleitung", lines: [] };
      current.lines.push(line);
    }
  }
  if (current)
    sections.push({ heading: current.heading, page: null, text: current.lines.join("\n") });
  return sections.filter((s) => s.text.length > 0);
}

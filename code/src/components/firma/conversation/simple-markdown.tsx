import type { ReactNode } from "react";

/**
 * The advisor writes light Markdown (bold, bullet lists, paragraphs). Rendered as React
 * elements, never as HTML, so transcript content cannot inject markup.
 */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((chunk, i) =>
    chunk.startsWith("**") && chunk.endsWith("**") && chunk.length > 4 ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: static split of one string
      <strong key={i}>{chunk.slice(2, -2)}</strong>
    ) : (
      chunk
    ),
  );
}

export function SimpleMarkdown({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        const isList = lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l));
        if (isList) {
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: blocks have no identity
            <ul key={i} className="grid list-disc gap-0.5 pl-5">
              {lines.map((line, j) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: lines have no identity
                <li key={j}>{inline(line.replace(/^\s*([-*•]|\d+\.)\s+/, ""))}</li>
              ))}
            </ul>
          );
        }
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: blocks have no identity
          <p key={i} className="whitespace-pre-wrap">
            {inline(block.replace(/^#+\s*/gm, ""))}
          </p>
        );
      })}
    </>
  );
}

import { Fragment, type ReactNode } from "react";

/**
 * The small Markdown subset the advisor uses: paragraphs, bullet and numbered lists, **bold**.
 * Rendered as React text nodes, so model output can never inject HTML.
 */

const BOLD = /\*\*(.+?)\*\*/g;
const BULLET = /^\s*[-*•]\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;

function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(BOLD)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(text.slice(last, index));
    nodes.push(
      <strong key={index} className="font-bold">
        {match[1]}
      </strong>,
    );
    last = index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

type Block = { kind: "p"; lines: string[] } | { kind: "ul" | "ol"; items: string[] };

export function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of source.replace(/\r/g, "").split("\n")) {
    const line = raw.replace(/^#{1,6}\s+/, "");
    const last = blocks.at(-1);
    if (line.trim() === "") {
      blocks.push({ kind: "p", lines: [] });
      continue;
    }
    const listKind = BULLET.test(line) ? "ul" : NUMBERED.test(line) ? "ol" : null;
    if (listKind) {
      const item = line.replace(listKind === "ul" ? BULLET : NUMBERED, "");
      if (last?.kind === listKind) last.items.push(item);
      else blocks.push({ kind: listKind, items: [item] });
    } else if (last?.kind === "p") {
      last.lines.push(line);
    } else {
      blocks.push({ kind: "p", lines: [line] });
    }
  }
  return blocks.filter((b) => (b.kind === "p" ? b.lines.length > 0 : b.items.length > 0));
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-3">
      {parseBlocks(text).map((block, i) => {
        if (block.kind === "p") {
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: blocks are positional
            <p key={i}>
              {block.lines.map((line, j) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional
                <Fragment key={j}>
                  {j > 0 ? <br /> : null}
                  {inline(line)}
                </Fragment>
              ))}
            </p>
          );
        }
        const List = block.kind;
        return (
          <List
            // biome-ignore lint/suspicious/noArrayIndexKey: blocks are positional
            key={i}
            className={
              List === "ul"
                ? "flex flex-col gap-1 pl-5 [list-style:square]"
                : "flex list-decimal flex-col gap-1 pl-5"
            }
          >
            {block.items.map((item, j) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: items are positional
              <li key={j} className="marker:text-pax-purple">
                {inline(item)}
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}

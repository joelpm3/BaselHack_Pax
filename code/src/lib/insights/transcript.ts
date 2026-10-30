/**
 * Turns persisted AI SDK UI message parts into something readable: a compact text transcript
 * for the classifier and structured items for the dashboard. Tool names are not known here
 * (they belong to other areas), so every tool part is summarised generically.
 */

export type TranscriptRole = "user" | "assistant" | "system";

export interface ToolSummary {
  toolCallId: string | null;
  name: string;
  state: string;
  input: unknown;
  output: unknown;
  errorText: string | null;
}

export type TranscriptItem =
  | { kind: "text"; text: string }
  | { kind: "tool"; tool: ToolSummary }
  | { kind: "file"; filename: string | null; mediaType: string | null };

interface PartLike {
  type?: unknown;
  [key: string]: unknown;
}

function asPart(value: unknown): PartLike | null {
  return value && typeof value === "object" ? (value as PartLike) : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** `tool-riskCheck` → `riskCheck`; dynamic tools carry their name in `toolName`. */
export function toolNameOf(part: unknown): string | null {
  const p = asPart(part);
  const type = str(p?.type);
  if (!p || !type) return null;
  if (type === "dynamic-tool") return str(p.toolName) ?? "tool";
  if (type.startsWith("tool-")) return type.slice(5);
  return null;
}

export function partToItem(part: unknown): TranscriptItem | null {
  const p = asPart(part);
  const type = str(p?.type);
  if (!p || !type) return null;
  if (type === "text") {
    const text = str(p.text)?.trim();
    return text ? { kind: "text", text } : null;
  }
  if (type === "file") {
    return { kind: "file", filename: str(p.filename), mediaType: str(p.mediaType) };
  }
  const name = toolNameOf(p);
  if (name) {
    return {
      kind: "tool",
      tool: {
        toolCallId: str(p.toolCallId),
        name,
        state: str(p.state) ?? "unknown",
        input: p.input ?? null,
        output: p.output ?? null,
        errorText: str(p.errorText),
      },
    };
  }
  return null;
}

export function messageItems(parts: unknown[]): TranscriptItem[] {
  return parts.flatMap((part) => {
    const item = partToItem(part);
    return item ? [item] : [];
  });
}

export function messageText(parts: unknown[]): string {
  return messageItems(parts)
    .flatMap((item) => (item.kind === "text" ? [item.text] : []))
    .join("\n")
    .trim();
}

/** JSON without noise, cut to `max` characters. */
export function compactJson(value: unknown, max = 400): string {
  if (value === null || value === undefined) return "";
  let json: string;
  try {
    json = JSON.stringify(value, (_key, v) =>
      typeof v === "string" && v.length > 160 ? `${v.slice(0, 157)}...` : v,
    );
  } catch {
    json = String(value);
  }
  return json.length > max ? `${json.slice(0, max - 1)}…` : json;
}

export interface TranscriptMessage {
  role: TranscriptRole;
  parts: unknown[];
}

const ROLE_LABEL: Record<TranscriptRole, string> = {
  user: "CUSTOMER",
  assistant: "ADVISOR",
  system: "SYSTEM",
};

/**
 * Plain-text transcript for the classifier. Tool calls become one line each with a compact
 * input/output so calculated gaps and shown products are visible to the model. Keeps the end
 * of very long conversations (the most recent state matters most).
 */
export function transcriptForModel(messages: TranscriptMessage[], maxChars = 30_000): string {
  const lines: string[] = [];
  for (const message of messages) {
    if (message.role === "system") continue;
    const label = ROLE_LABEL[message.role];
    for (const item of messageItems(message.parts)) {
      if (item.kind === "text") lines.push(`${label}: ${item.text}`);
      else if (item.kind === "file") lines.push(`${label} [uploaded file ${item.filename ?? ""}]`);
      else {
        const { tool } = item;
        const result = tool.errorText
          ? `error: ${tool.errorText}`
          : compactJson(tool.output, 600) || tool.state;
        lines.push(
          `${label} [tool ${tool.name}] input=${compactJson(tool.input, 300)} → ${result}`,
        );
      }
    }
  }
  const text = lines.join("\n");
  return text.length > maxChars ? `…\n${text.slice(text.length - maxChars)}` : text;
}

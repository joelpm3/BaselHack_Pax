import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getProfile } from "@/lib/profile/service";
import { loadMessageRows } from "./conversations";
import type { AdvisorMessageMetadata } from "./types";
import {
  type CustomerInputs,
  isWidgetInputTool,
  type WidgetChange,
  type WidgetInputTool,
  type WidgetValues,
  widgetChange,
  widgetValuesOf,
} from "./widget-inputs";

/**
 * Persists what the customer set in a widget (inside the tool output, no new chat message) and
 * hands the changes to the advisor's next turn: each change is reported once, then the widget's
 * `reported` values catch up.
 */

interface ToolPart {
  type?: string;
  toolCallId?: string;
  state?: string;
  output?: unknown;
}

function inputsOf(output: unknown): CustomerInputs | null {
  const inputs = (output as { customerInputs?: CustomerInputs } | null)?.customerInputs;
  return inputs && typeof inputs.values === "object" && typeof inputs.reported === "object"
    ? inputs
    : null;
}

/**
 * Stores the widget's current values in its tool part. Returns false when the part does not
 * exist (yet): the message of a running turn is only stored when the turn ends.
 */
export function recordWidgetInputs(
  conversationId: string,
  toolCallId: string,
  tool: WidgetInputTool,
  values: WidgetValues,
): boolean {
  for (const row of loadMessageRows(conversationId)) {
    if (row.role !== "assistant") continue;
    const index = (row.parts as ToolPart[]).findIndex(
      (p) => p.toolCallId === toolCallId && p.type === `tool-${tool}`,
    );
    if (index < 0) continue;
    const part = row.parts[index] as ToolPart;
    if (part.state !== "output-available" || !part.output || typeof part.output !== "object")
      return false;
    const reported = inputsOf(part.output)?.reported ?? widgetValuesOf(part.output);
    const customerInputs: CustomerInputs = { values, reported, updatedAt: Date.now() };
    const parts = row.parts.map((p, i) =>
      i === index ? { ...part, output: { ...(part.output as object), customerInputs } } : p,
    );
    db.update(schema.messages).set({ parts }).where(eq(schema.messages.id, row.id)).run();
    return true;
  }
  return false;
}

/**
 * Collects every widget change the advisor has not seen, marks it as seen and keeps it on the
 * customer's message (`metadata.widgetChanges`), so the note is replayed the same way in every
 * later turn. Profile paths already asked about in this conversation are not asked again.
 */
export function takeWidgetChanges(
  conversationId: string,
  customerId: string,
  userMessageId: string,
): WidgetChange[] {
  return db.transaction(() => {
    const rows = loadMessageRows(conversationId);
    const userRow = rows.find((r) => r.id === userMessageId && r.role === "user");
    if (!userRow) return [];
    const askedPaths = new Set(
      rows.flatMap((r) =>
        ((r.metadata as AdvisorMessageMetadata | null)?.widgetChanges ?? []).flatMap((c) =>
          c.candidates.map((candidate) => candidate.path),
        ),
      ),
    );
    const profile = getProfile(customerId);
    const changes: WidgetChange[] = [];
    for (const row of rows) {
      if (row.role !== "assistant") continue;
      let touched = false;
      const parts = (row.parts as ToolPart[]).map((part) => {
        const tool = part.type?.startsWith("tool-") ? part.type.slice(5) : "";
        const inputs = inputsOf(part.output);
        if (!inputs || !part.toolCallId || !isWidgetInputTool(tool)) return part;
        const change = widgetChange({
          toolCallId: part.toolCallId,
          tool,
          output: part.output,
          inputs,
          profile,
          askedPaths,
        });
        if (!change) return part;
        for (const candidate of change.candidates) askedPaths.add(candidate.path);
        changes.push(change);
        touched = true;
        return {
          ...part,
          output: {
            ...(part.output as object),
            customerInputs: { ...inputs, reported: inputs.values },
          },
        };
      });
      if (touched)
        db.update(schema.messages).set({ parts }).where(eq(schema.messages.id, row.id)).run();
    }
    if (changes.length > 0) {
      const metadata = (userRow.metadata ?? {}) as AdvisorMessageMetadata;
      db.update(schema.messages)
        .set({
          metadata: {
            ...metadata,
            widgetChanges: [...(metadata.widgetChanges ?? []), ...changes],
          },
        })
        .where(eq(schema.messages.id, userRow.id))
        .run();
    }
    return changes;
  });
}

import "server-only";
import type { UIMessage } from "ai";
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { ConversationMode, Locale } from "@/lib/domain/taxonomy";
import { publish } from "@/lib/events/bus";
import { getActiveRuleSet } from "@/lib/rules/active";
import { type GreetingVariant, greetingText } from "./greeting";
import type { AdvisorMessageMetadata } from "./types";

export type Conversation = typeof schema.conversations.$inferSelect;
export type AdvisorUIMessage = UIMessage<AdvisorMessageMetadata>;
export type InputMode = NonNullable<AdvisorMessageMetadata["inputMode"]>;

export interface CreateConversationInput {
  customerId: string;
  locale: Locale;
  mode: ConversationMode;
  /** Opening line: personal by default; "upload" also acknowledges documents at hand. */
  variant?: "default" | "upload";
  isSimulated?: boolean;
  simulationRunId?: string;
}

/**
 * Creates a conversation bound to the active company rule set, writes the advisor's opening
 * message and announces it on the event bus. Used by the chat entry and the simulation.
 */
export async function createConversation(input: CreateConversationInput): Promise<Conversation> {
  const ruleSet = getActiveRuleSet();
  const customer = db.query.customers
    .findFirst({ where: eq(schema.customers.id, input.customerId) })
    .sync();
  const variant: GreetingVariant =
    input.mode === "existing_customer" ? "existing" : (input.variant ?? "default");
  const text = await greetingText(input.locale, variant, customer?.firstName ?? null);
  const now = new Date();
  const conversation = db.transaction((tx) => {
    const [row] = tx
      .insert(schema.conversations)
      .values({
        customerId: input.customerId,
        locale: input.locale,
        mode: input.mode,
        ruleSetId: ruleSet.id,
        isSimulated: input.isSimulated ?? false,
        simulationRunId: input.simulationRunId,
        messageCount: 1,
        lastMessageAt: now,
      })
      .returning()
      .all();
    tx.insert(schema.messages)
      .values({
        id: crypto.randomUUID(),
        conversationId: row.id,
        role: "assistant",
        parts: [{ type: "text", text }],
        metadata: { kind: "greeting", variant, createdAt: now.getTime() },
        createdAt: now,
      })
      .run();
    return row;
  });
  publish({
    type: "conversation.started",
    conversationId: conversation.id,
    customerId: input.customerId,
    isSimulated: conversation.isSimulated,
  });
  return conversation;
}

export function getConversation(conversationId: string): Conversation | null {
  return (
    db.query.conversations
      .findFirst({ where: eq(schema.conversations.id, conversationId) })
      .sync() ?? null
  );
}

/** The conversation only if it belongs to this customer (cookie owner). */
export function getOwnedConversation(
  conversationId: string,
  customerId: string,
): Conversation | null {
  const conversation = getConversation(conversationId);
  return conversation?.customerId === customerId ? conversation : null;
}

export function latestConversation(customerId: string): Conversation | null {
  return (
    db
      .select()
      .from(schema.conversations)
      .where(eq(schema.conversations.customerId, customerId))
      .orderBy(desc(schema.conversations.lastMessageAt))
      .limit(1)
      .get() ?? null
  );
}

type MessageRow = typeof schema.messages.$inferSelect;

function toUIMessage(row: MessageRow): AdvisorUIMessage {
  return {
    id: row.id,
    role: row.role,
    parts: row.parts as AdvisorUIMessage["parts"],
    metadata: { ...(row.metadata ?? {}), createdAt: row.createdAt.getTime() },
  };
}

export function loadMessageRows(conversationId: string): MessageRow[] {
  return db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .orderBy(asc(schema.messages.createdAt), asc(sql`rowid`))
    .all();
}

export function loadMessages(conversationId: string): AdvisorUIMessage[] {
  return loadMessageRows(conversationId).map(toUIMessage);
}

/** Idempotent: a retried request re-sends the same user message id. */
export function saveUserMessage(
  conversationId: string,
  message: AdvisorUIMessage,
  inputMode: InputMode,
): boolean {
  const result = db
    .insert(schema.messages)
    .values({
      id: message.id,
      conversationId,
      role: "user",
      parts: message.parts,
      metadata: message.metadata ? { ...message.metadata } : null,
      inputMode,
    })
    .onConflictDoNothing()
    .run();
  return result.changes > 0;
}

export function saveAssistantMessage(
  conversationId: string,
  message: AdvisorUIMessage,
  details: { model: string; inputTokens?: number; outputTokens?: number; ruleSetId: string },
): void {
  const metadata = { ...(message.metadata ?? {}), ruleSetId: details.ruleSetId };
  db.insert(schema.messages)
    .values({
      id: message.id,
      conversationId,
      role: "assistant",
      parts: message.parts,
      metadata,
      model: details.model,
      inputTokens: details.inputTokens,
      outputTokens: details.outputTokens,
    })
    .onConflictDoUpdate({
      target: schema.messages.id,
      set: { parts: message.parts, metadata, model: details.model },
    })
    .run();
}

/** Regenerating replaces the answer to the last user message. */
export function deleteAnswersAfterLastUserMessage(conversationId: string): void {
  const lastUser = db
    .select()
    .from(schema.messages)
    .where(
      and(eq(schema.messages.conversationId, conversationId), eq(schema.messages.role, "user")),
    )
    .orderBy(desc(schema.messages.createdAt), desc(sql`rowid`))
    .limit(1)
    .get();
  if (!lastUser) return;
  db.delete(schema.messages)
    .where(
      and(
        eq(schema.messages.conversationId, conversationId),
        eq(schema.messages.role, "assistant"),
        gt(schema.messages.createdAt, lastUser.createdAt),
      ),
    )
    .run();
}

export function countMessages(conversationId: string): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .get();
  return row?.n ?? 0;
}

/** Plain text of a UI message (for previews, titles and events). */
export function messageText(message: Pick<UIMessage, "parts">): string {
  return message.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Stores a widget interaction inside the persisted tool output, so a reloaded chat shows the
 * widget in its final state (booked callback, given feedback). Domain tables stay the source
 * of truth; this only keeps the transcript faithful.
 */
export function patchToolOutput(
  conversationId: string,
  toolCallId: string,
  patch: Record<string, unknown>,
): boolean {
  for (const row of loadMessageRows(conversationId)) {
    if (row.role !== "assistant") continue;
    let found = false;
    const parts = row.parts.map((part) => {
      const p = part as { toolCallId?: string; output?: unknown };
      if (p.toolCallId !== toolCallId || typeof p.output !== "object" || p.output === null)
        return part;
      found = true;
      return { ...p, output: { ...(p.output as Record<string, unknown>), ...patch } };
    });
    if (found) {
      db.update(schema.messages).set({ parts }).where(eq(schema.messages.id, row.id)).run();
      return true;
    }
  }
  return false;
}

/**
 * Opening a conversation from a cockpit hint (`/chat/<id>?hint=<hintId>`): until the customer
 * has written, the greeting is rewritten to name the hint and remembers it for the prompt.
 * Idempotent; ignores hints of other customers.
 */
export async function attachHint(conversation: Conversation, hintId: string): Promise<void> {
  const hint = db
    .select()
    .from(schema.hints)
    .where(and(eq(schema.hints.id, hintId), eq(schema.hints.customerId, conversation.customerId)))
    .get();
  if (!hint) return;
  const rows = loadMessageRows(conversation.id);
  const greeting = rows.find((r) => r.metadata?.kind === "greeting");
  if (!greeting || greeting.metadata?.hintId || rows.some((r) => r.role === "user")) return;
  const customer = db.query.customers
    .findFirst({ where: eq(schema.customers.id, conversation.customerId) })
    .sync();
  const text = await greetingText(
    conversation.locale,
    "hint",
    customer?.firstName ?? null,
    hint.title,
  );
  db.update(schema.messages)
    .set({
      parts: [{ type: "text", text }],
      metadata: { ...greeting.metadata, variant: "hint", hintId: hint.id },
    })
    .where(eq(schema.messages.id, greeting.id))
    .run();
}

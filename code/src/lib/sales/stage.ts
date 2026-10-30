import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { advanceStage, type FunnelStage } from "@/lib/domain/taxonomy";
import { publish } from "@/lib/events/bus";

/** Moves the conversation's funnel stage forward (never back) and notifies the dashboard. */
export function advanceConversationStage(conversationId: string, stage: FunnelStage): void {
  const conversation = db
    .select({ stage: schema.conversations.stage })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, conversationId))
    .get();
  if (!conversation) return;
  const next = advanceStage(conversation.stage, stage);
  if (next === conversation.stage) return;
  db.update(schema.conversations)
    .set({ stage: next })
    .where(eq(schema.conversations.id, conversationId))
    .run();
  publish({ type: "conversation.updated", conversationId });
}

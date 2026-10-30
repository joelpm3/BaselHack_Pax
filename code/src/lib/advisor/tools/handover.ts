import "server-only";
import { tool } from "ai";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { db, schema } from "@/lib/db";
import { publish } from "@/lib/events/bus";
import type { FeedbackOutput, HandoverOutput, QuickRepliesOutput } from "../types";
import type { ToolContext } from "./context";

export function createHandoverTools(ctx: ToolContext) {
  const ruleIds = new Set(ctx.ruleSet.rules.filter((r) => r.active).map((r) => r.id));

  return {
    requestHandover: tool({
      description:
        "Hand the conversation to a human Pax advisor: when an active company handover rule " +
        "applies (cite its ids), when the customer asks for a person, or when the case is too " +
        "complex or high-impact for self-service. Creates the handover for the advisor team and " +
        "shows the customer a callback form (channel, time, phone).",
      inputSchema: z.object({
        reason: z
          .string()
          .min(5)
          .max(1500)
          .describe("For the human advisor: what the customer needs and why a person should help"),
        ruleIds: z
          .array(z.string())
          .describe("Ids of the company rules that require this handover; [] if none"),
        urgency: z.enum(["normal", "high"]).default("normal"),
      }),
      execute: async (input): Promise<HandoverOutput> => {
        const cited = input.ruleIds.filter((id) => ruleIds.has(id));
        const existing = db
          .select()
          .from(schema.handovers)
          .where(
            and(
              eq(schema.handovers.conversationId, ctx.conversationId),
              inArray(schema.handovers.status, ["open", "scheduled"]),
            ),
          )
          .get();
        const handover = existing
          ? db
              .update(schema.handovers)
              .set({
                reason: input.reason,
                ruleIds: [...new Set([...existing.ruleIds, ...cited])],
                urgency: input.urgency === "high" ? "high" : existing.urgency,
              })
              .where(eq(schema.handovers.id, existing.id))
              .returning()
              .get()
          : db
              .insert(schema.handovers)
              .values({
                conversationId: ctx.conversationId,
                customerId: ctx.customerId,
                reason: input.reason,
                ruleIds: cited,
                urgency: input.urgency,
              })
              .returning()
              .get();
        db.update(schema.conversations)
          .set({ status: "handed_over" })
          .where(eq(schema.conversations.id, ctx.conversationId))
          .run();
        audit({
          actorType: "ai",
          action: "handover.requested",
          entityType: "handover",
          entityId: handover.id,
          data: { ruleIds: handover.ruleIds, urgency: handover.urgency, ruleSetId: ctx.ruleSet.id },
        });
        publish({
          type: "handover.created",
          handoverId: handover.id,
          conversationId: ctx.conversationId,
        });
        publish({ type: "conversation.updated", conversationId: ctx.conversationId });
        const customer = db.query.customers
          .findFirst({ where: eq(schema.customers.id, ctx.customerId) })
          .sync();
        return {
          handoverId: handover.id,
          reason: handover.reason,
          ruleIds: handover.ruleIds,
          urgency: handover.urgency,
          phone: customer?.phone ?? null,
          booked:
            handover.preferredChannel && handover.preferredTime
              ? { channel: handover.preferredChannel, preferredTime: handover.preferredTime }
              : null,
        };
      },
    }),

    askForFeedback: tool({
      description:
        "Ask how helpful the conversation was (0–10 and an optional comment). Only at a natural " +
        "end: after a recommendation, an offer or a handover, or when the customer says goodbye.",
      inputSchema: z.object({}),
      execute: async (): Promise<FeedbackOutput> => ({ submitted: null }),
    }),

    suggestReplies: tool({
      description:
        "Offer 2–4 short tap-to-send answers to the question you just asked, written from the " +
        "customer's point of view in their language. Call it last, after your text.",
      inputSchema: z.object({
        options: z.array(z.string().min(1).max(60)).min(2).max(4),
      }),
      execute: async ({ options }): Promise<QuickRepliesOutput> => ({ options }),
    }),
  };
}

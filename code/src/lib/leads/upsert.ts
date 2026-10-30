import "server-only";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { db, schema } from "@/lib/db";
import type { IdentifiedGap, ProductInterest } from "@/lib/db/schema";
import type { IntentStage, LeadType } from "@/lib/domain/taxonomy";
import { determineLeadTypes, leadPriority, scoreLead } from "./scoring";

type Conversation = typeof schema.conversations.$inferSelect;
type Customer = typeof schema.customers.$inferSelect;

export interface LeadSignals {
  intentStage: IntentStage;
  gaps: IdentifiedGap[];
  productInterest: ProductInterest[];
  serviceRequest: string | null;
  externalPolicy: { insurer: string; category: string; note: string } | null;
  reasonToCall: string;
  talkingPoints: string[];
  /** Open or scheduled handover for this conversation. */
  handover: { urgency: "normal" | "high" } | null;
  handoverRequired: boolean;
}

function reasonFor(type: LeadType, signals: LeadSignals): { reason: string; points: string[] } {
  if (type === "service" && signals.serviceRequest) {
    return { reason: signals.serviceRequest, points: signals.talkingPoints };
  }
  if (type === "switch_opportunity" && signals.externalPolicy) {
    const { insurer, note } = signals.externalPolicy;
    return {
      reason: signals.reasonToCall,
      points: [`${insurer}: ${note}`, ...signals.talkingPoints],
    };
  }
  return { reason: signals.reasonToCall, points: signals.talkingPoints };
}

function estimatedPremium(conversationId: string): number | null {
  const rows = db
    .select({
      productCode: schema.recommendations.productCode,
      premium: schema.recommendations.premiumAnnual,
    })
    .from(schema.recommendations)
    .where(eq(schema.recommendations.conversationId, conversationId))
    .all();
  // Latest premium per product (rows come in insertion order).
  const byProduct = new Map<string, number>();
  for (const row of rows) if (row.premium !== null) byProduct.set(row.productCode, row.premium);
  if (byProduct.size === 0) return null;
  return [...byProduct.values()].reduce((a, b) => a + b, 0);
}

/**
 * A lead type the latest analysis no longer supports is removed, but only while nobody has
 * worked on it (still new, unassigned, no advisor activity). Returns the removed ids.
 */
function withdrawUntouchedLeads(conversationId: string, keep: LeadType[]): string[] {
  const candidates = db
    .select()
    .from(schema.leads)
    .where(
      and(
        eq(schema.leads.conversationId, conversationId),
        eq(schema.leads.status, "new"),
        isNull(schema.leads.assignedAdvisorId),
      ),
    )
    .all()
    .filter((lead) => !keep.includes(lead.type));
  const withdrawn: string[] = [];
  for (const lead of candidates) {
    const touched = db
      .select({ id: schema.leadActivities.id })
      .from(schema.leadActivities)
      .where(
        and(eq(schema.leadActivities.leadId, lead.id), isNotNull(schema.leadActivities.advisorId)),
      )
      .get();
    if (touched) continue;
    db.delete(schema.leads).where(eq(schema.leads.id, lead.id)).run();
    audit({
      actorType: "ai",
      action: "lead.withdrawn",
      entityType: "lead",
      entityId: lead.id,
      data: { type: lead.type, score: lead.score, conversationId },
    });
    withdrawn.push(lead.id);
  }
  return withdrawn;
}

/**
 * Creates or updates one lead per (conversation, type). Pipeline fields an advisor owns
 * (status, assignment, next action) are never touched here. Returns the ids that changed.
 */
export function upsertLeadsForConversation(
  conversation: Conversation,
  customer: Customer,
  signals: LeadSignals,
): string[] {
  const policies = db
    .select({ isExternal: schema.policies.isExternal, status: schema.policies.status })
    .from(schema.policies)
    .where(eq(schema.policies.customerId, customer.id))
    .all()
    .filter((p) => p.status === "active");
  const hasPaxPolicy = policies.some((p) => !p.isExternal);
  const hasExternalPolicy = policies.some((p) => p.isExternal) || signals.externalPolicy !== null;

  const types = determineLeadTypes({
    lifecycle: customer.lifecycle,
    hasPaxPolicy,
    hasExternalPolicy,
    intentStage: signals.intentStage,
    gaps: signals.gaps,
    productInterest: signals.productInterest,
    serviceRequest: signals.serviceRequest,
  });
  const changed = withdrawUntouchedLeads(conversation.id, types);
  if (types.length === 0) return changed;

  const premium = estimatedPremium(conversation.id);

  db.transaction((tx) => {
    for (const type of types) {
      const { score, breakdown } = scoreLead({
        type,
        intentStage: signals.intentStage,
        gaps: signals.gaps,
        productInterest: signals.productInterest,
        lifecycle: customer.lifecycle,
        hasContactDetails: Boolean(customer.email || customer.phone),
        stage: conversation.stage,
        mode: conversation.mode,
        handover: signals.handoverRequired
          ? { required: true, urgency: signals.handover?.urgency ?? "normal" }
          : null,
      });
      const priority = leadPriority(score, signals.handover);
      const { reason, points } = reasonFor(type, signals);
      const values = {
        score,
        scoreBreakdown: breakdown,
        priority,
        reasonToCall: reason,
        talkingPoints: points,
        productInterest: type === "service" ? [] : signals.productInterest,
        estimatedAnnualPremium: type === "service" ? null : premium,
      };

      const existing = tx
        .select()
        .from(schema.leads)
        .where(and(eq(schema.leads.conversationId, conversation.id), eq(schema.leads.type, type)))
        .get();

      if (!existing) {
        const [lead] = tx
          .insert(schema.leads)
          .values({
            ...values,
            customerId: customer.id,
            conversationId: conversation.id,
            type,
            isSimulated: conversation.isSimulated,
          })
          .returning()
          .all();
        tx.insert(schema.leadActivities)
          .values({ leadId: lead.id, type: "system", data: { event: "created", score, priority } })
          .run();
        audit({
          actorType: "ai",
          action: "lead.created",
          entityType: "lead",
          entityId: lead.id,
          data: { type, score, priority, conversationId: conversation.id },
        });
        changed.push(lead.id);
        continue;
      }

      tx.update(schema.leads).set(values).where(eq(schema.leads.id, existing.id)).run();
      if (existing.score !== score || existing.priority !== priority) {
        tx.insert(schema.leadActivities)
          .values({
            leadId: existing.id,
            type: "system",
            data: {
              event: "rescored",
              fromScore: existing.score,
              score,
              fromPriority: existing.priority,
              priority,
            },
          })
          .run();
      }
      changed.push(existing.id);
    }
  });

  return changed;
}

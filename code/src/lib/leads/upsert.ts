import "server-only";
import { and, eq, isNotNull, isNull, ne, notExists } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { db, schema } from "@/lib/db";
import type { IdentifiedGap, ProductInterest } from "@/lib/db/schema";
import type { IntentStage, LeadType, PolicyCategory } from "@/lib/domain/taxonomy";
import { leadToUpdate } from "./merge";
import { determineLeadType, externalPolicyState, leadPriority, scoreLead } from "./scoring";

type Conversation = typeof schema.conversations.$inferSelect;
type Customer = typeof schema.customers.$inferSelect;

export interface LeadSignals {
  intentStage: IntentStage;
  gaps: IdentifiedGap[];
  productInterest: ProductInterest[];
  serviceRequest: string | null;
  externalPolicy: { insurer: string; category: PolicyCategory; note: string } | null;
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
 * Leads of this conversation the latest analysis no longer supports are removed, but only while
 * nobody has worked on them (still new, unassigned, no advisor activity). Returns the removed ids.
 */
function withdrawUntouchedLeads(conversationId: string, keepId: string | undefined): string[] {
  const candidates = db
    .select()
    .from(schema.leads)
    .where(
      and(
        eq(schema.leads.conversationId, conversationId),
        eq(schema.leads.status, "new"),
        isNull(schema.leads.assignedAdvisorId),
        keepId ? ne(schema.leads.id, keepId) : undefined,
      ),
    )
    .all();
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
 * Creates or updates the single lead of a conversation. An existing lead is updated (and
 * re-typed) rather than duplicated, also when the customer already has an open lead of that type
 * from another conversation. Pipeline fields an advisor owns (status, assignment, next action)
 * are never touched here. Returns the ids that changed.
 */
export function upsertLeadForConversation(
  conversation: Conversation,
  customer: Customer,
  signals: LeadSignals,
): string[] {
  const policies = db
    .select({
      isExternal: schema.policies.isExternal,
      category: schema.policies.category,
      status: schema.policies.status,
    })
    .from(schema.policies)
    .where(eq(schema.policies.customerId, customer.id))
    .all();
  const hasPaxPolicy = policies.some((p) => p.status === "active" && !p.isExternal);

  // Judge by who the customer was when the conversation started: a policy signed in this very
  // conversation is the new-business sale, not a reason to re-type it as an upsell.
  const existingCustomer = conversation.mode === "existing_customer";
  const type = determineLeadType({
    lifecycle: existingCustomer ? customer.lifecycle : "prospect",
    hasPaxPolicy: existingCustomer && hasPaxPolicy,
    externalPolicy: externalPolicyState(policies, signals.externalPolicy),
    intentStage: signals.intentStage,
    gaps: signals.gaps,
    productInterest: signals.productInterest,
    serviceRequest: signals.serviceRequest,
  });

  // Wiedervorlage leads belong to their future event; a later conversation gets its own lead.
  const customerLeads = db
    .select()
    .from(schema.leads)
    .where(
      and(
        eq(schema.leads.customerId, customer.id),
        notExists(
          db
            .select({ id: schema.futureEvents.id })
            .from(schema.futureEvents)
            .where(eq(schema.futureEvents.leadId, schema.leads.id)),
        ),
      ),
    )
    .all();
  const existing = type ? leadToUpdate(customerLeads, conversation.id, type) : undefined;
  const changed = withdrawUntouchedLeads(conversation.id, existing?.id);
  if (!type) return changed;

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
    type,
    score,
    scoreBreakdown: breakdown,
    priority,
    reasonToCall: reason,
    talkingPoints: points,
    productInterest: type === "service" ? [] : signals.productInterest,
    estimatedAnnualPremium: type === "service" ? null : estimatedPremium(conversation.id),
  };

  db.transaction((tx) => {
    if (!existing) {
      const [lead] = tx
        .insert(schema.leads)
        .values({
          ...values,
          customerId: customer.id,
          conversationId: conversation.id,
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
      return;
    }

    tx.update(schema.leads).set(values).where(eq(schema.leads.id, existing.id)).run();
    const system = (data: Record<string, unknown>) =>
      tx.insert(schema.leadActivities).values({ leadId: existing.id, type: "system", data }).run();
    if (existing.conversationId !== conversation.id)
      system({ event: "merged", conversationId: conversation.id });
    if (existing.type !== type) system({ event: "retyped", fromType: existing.type, type });
    if (existing.score !== score || existing.priority !== priority) {
      system({
        event: "rescored",
        fromScore: existing.score,
        score,
        fromPriority: existing.priority,
        priority,
      });
    }
    changed.push(existing.id);
  });

  return changed;
}

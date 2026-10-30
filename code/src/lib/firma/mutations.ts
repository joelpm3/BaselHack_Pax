import "server-only";
import { eq } from "drizzle-orm";
import { audit } from "@/lib/audit";
import type { Advisor } from "@/lib/auth/advisor";
import { db, schema } from "@/lib/db";
import type { HandoverStatus, LeadStatus } from "@/lib/domain/taxonomy";
import { publish } from "@/lib/events/bus";
import { getActiveRuleSet } from "@/lib/rules/active";
import {
  createRuleSetVersion,
  draftFromVersion,
  isSameRuleSet,
  type RuleSetDraft,
} from "./rule-sets";

/**
 * Advisor actions on the dashboard. Every change records who did it (lead activity and/or
 * audit log) and notifies other open dashboards.
 */

function getLead(leadId: string) {
  const lead = db.select().from(schema.leads).where(eq(schema.leads.id, leadId)).get();
  if (!lead) throw new Error(`Lead ${leadId} not found`);
  return lead;
}

function advisorExists(advisorId: string | null): boolean {
  if (advisorId === null) return true;
  return Boolean(
    db
      .select({ id: schema.advisors.id })
      .from(schema.advisors)
      .where(eq(schema.advisors.id, advisorId))
      .get(),
  );
}

export function changeLeadStatus(advisor: Advisor, leadId: string, status: LeadStatus): void {
  const lead = getLead(leadId);
  if (lead.status === status) return;
  db.transaction((tx) => {
    tx.update(schema.leads).set({ status }).where(eq(schema.leads.id, leadId)).run();
    tx.insert(schema.leadActivities)
      .values({
        leadId,
        advisorId: advisor.id,
        type: "status_change",
        data: { from: lead.status, to: status },
      })
      .run();
  });
  audit({
    actorType: "advisor",
    actorId: advisor.id,
    action: "lead.status_changed",
    entityType: "lead",
    entityId: leadId,
    data: { from: lead.status, to: status },
  });
  publish({ type: "lead.upserted", leadId, conversationId: lead.conversationId });
}

export function assignLead(advisor: Advisor, leadId: string, advisorId: string | null): void {
  const lead = getLead(leadId);
  if (lead.assignedAdvisorId === advisorId || !advisorExists(advisorId)) return;
  db.transaction((tx) => {
    tx.update(schema.leads)
      .set({ assignedAdvisorId: advisorId })
      .where(eq(schema.leads.id, leadId))
      .run();
    tx.insert(schema.leadActivities)
      .values({
        leadId,
        advisorId: advisor.id,
        type: "system",
        data: { event: "assigned", from: lead.assignedAdvisorId, to: advisorId },
      })
      .run();
  });
  audit({
    actorType: "advisor",
    actorId: advisor.id,
    action: "lead.assigned",
    entityType: "lead",
    entityId: leadId,
    data: { to: advisorId },
  });
  publish({ type: "lead.upserted", leadId, conversationId: lead.conversationId });
}

export function addLeadNote(
  advisor: Advisor,
  leadId: string,
  note: { type: "note" | "call" | "email"; body: string },
): void {
  const lead = getLead(leadId);
  db.insert(schema.leadActivities)
    .values({ leadId, advisorId: advisor.id, type: note.type, body: note.body })
    .run();
  // Touch the lead so "last activity" sorting reflects the note.
  db.update(schema.leads).set({ updatedAt: new Date() }).where(eq(schema.leads.id, leadId)).run();
  publish({ type: "lead.upserted", leadId, conversationId: lead.conversationId });
}

function getHandover(handoverId: string) {
  const handover = db
    .select()
    .from(schema.handovers)
    .where(eq(schema.handovers.id, handoverId))
    .get();
  if (!handover) throw new Error(`Handover ${handoverId} not found`);
  return handover;
}

export function updateHandover(
  advisor: Advisor,
  handoverId: string,
  change: { status?: HandoverStatus; assignedAdvisorId?: string | null },
): void {
  const handover = getHandover(handoverId);
  const set: Partial<typeof schema.handovers.$inferInsert> = {};
  if (change.status && change.status !== handover.status) set.status = change.status;
  if (
    change.assignedAdvisorId !== undefined &&
    change.assignedAdvisorId !== handover.assignedAdvisorId &&
    advisorExists(change.assignedAdvisorId)
  ) {
    set.assignedAdvisorId = change.assignedAdvisorId;
  }
  if (Object.keys(set).length === 0) return;
  db.update(schema.handovers).set(set).where(eq(schema.handovers.id, handoverId)).run();
  audit({
    actorType: "advisor",
    actorId: advisor.id,
    action: "handover.updated",
    entityType: "handover",
    entityId: handoverId,
    data: {
      from: { status: handover.status, assignedAdvisorId: handover.assignedAdvisorId },
      to: set,
    },
  });
  publish({ type: "conversation.updated", conversationId: handover.conversationId });
}

export type SaveRuleSetResult = { status: "created"; version: number } | { status: "unchanged" };

export function saveRuleSet(advisor: Advisor, draft: RuleSetDraft): SaveRuleSetResult {
  const active = getActiveRuleSet();
  const current = draftFromVersion(db, active.id);
  if (current && isSameRuleSet(current, draft)) return { status: "unchanged" };
  const created = createRuleSetVersion(db, draft, advisor.id);
  audit({
    actorType: "advisor",
    actorId: advisor.id,
    action: "rule_set.created",
    entityType: "rule_set",
    entityId: created.id,
    data: { version: created.version, previousVersion: active.version, rules: draft.rules.length },
  });
  return { status: "created", version: created.version };
}

import "server-only";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Scope } from "./aggregate";
import { customerColumns, OPEN_LEAD_SQL, scopeWhere } from "./common";

const h = schema.handovers;
const l = schema.leads;
const c = schema.conversations;

const SHOWN = 5;
/** A lead is "hot" when it is still open and either flagged high/urgent or scores this high. */
export const HOT_SCORE = 70;

const PRIORITY_ORDER = sql`case ${l.priority} when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end`;
const hotWhere = (scope: Scope) =>
  and(
    OPEN_LEAD_SQL,
    or(inArray(l.priority, ["urgent", "high"]), sql`${l.score} >= ${HOT_SCORE}`),
    scopeWhere(l.isSimulated, scope),
  );

/**
 * "Where do I have to act now?": open handovers (a person asked for, or a rule requires, a human)
 * first, then hot sales leads. A customer with an open handover is reached through the handover,
 * so their leads are attached to it instead of being listed twice.
 */
export function getActionQueue(scope: Scope) {
  const handoverWhere = and(eq(h.status, "open"), scopeWhere(c.isSimulated, scope));
  const handoverCounts = db
    .select({
      open: sql<number>`count(*)`,
      urgent: sql<number>`coalesce(sum(${h.urgency} = 'high'), 0)`,
      unassigned: sql<number>`coalesce(sum(${h.assignedAdvisorId} is null), 0)`,
    })
    .from(h)
    .innerJoin(c, eq(c.id, h.conversationId))
    .where(handoverWhere)
    .get() ?? { open: 0, urgent: 0, unassigned: 0 };

  const handovers = db
    .select({
      id: h.id,
      reason: h.reason,
      urgency: h.urgency,
      preferredChannel: h.preferredChannel,
      preferredTime: h.preferredTime,
      createdAt: h.createdAt,
      conversationId: h.conversationId,
      assignee: schema.advisors.name,
      isSimulated: c.isSimulated,
      ...customerColumns,
    })
    .from(h)
    .innerJoin(c, eq(c.id, h.conversationId))
    .innerJoin(schema.customers, eq(schema.customers.id, h.customerId))
    .leftJoin(schema.profiles, eq(schema.profiles.customerId, h.customerId))
    .leftJoin(schema.advisors, eq(schema.advisors.id, h.assignedAdvisorId))
    .where(handoverWhere)
    // Urgent first, then whoever has waited longest.
    .orderBy(sql`case ${h.urgency} when 'high' then 0 else 1 end`, asc(h.createdAt))
    .limit(SHOWN)
    .all();

  // The open-handover customers in scope, so their leads ride on the handover row.
  const handoverCustomers = new Set(
    db
      .selectDistinct({ id: h.customerId })
      .from(h)
      .innerJoin(c, eq(c.id, h.conversationId))
      .where(handoverWhere)
      .all()
      .map((r) => r.id),
  );

  const hot = db
    .select({
      id: l.id,
      type: l.type,
      status: l.status,
      score: l.score,
      priority: l.priority,
      reasonToCall: l.reasonToCall,
      conversationId: l.conversationId,
      isSimulated: l.isSimulated,
      assignee: schema.advisors.name,
      ...customerColumns,
    })
    .from(l)
    .innerJoin(schema.customers, eq(schema.customers.id, l.customerId))
    .leftJoin(schema.profiles, eq(schema.profiles.customerId, l.customerId))
    .leftJoin(schema.advisors, eq(schema.advisors.id, l.assignedAdvisorId))
    .where(hotWhere(scope))
    .orderBy(PRIORITY_ORDER, desc(l.score), desc(l.updatedAt))
    .all();

  const leadsByCustomer = new Map<string, Array<{ id: string; type: string; score: number }>>();
  const hotLeads: typeof hot = [];
  for (const lead of hot) {
    if (handoverCustomers.has(lead.customerId)) {
      const list = leadsByCustomer.get(lead.customerId) ?? [];
      list.push({ id: lead.id, type: lead.type, score: lead.score });
      leadsByCustomer.set(lead.customerId, list);
    } else {
      hotLeads.push(lead);
    }
  }

  return {
    handoverCounts,
    handovers: handovers.map((row) => ({
      ...row,
      leads: leadsByCustomer.get(row.customerId) ?? [],
    })),
    hotLeadCount: hotLeads.length,
    hotLeadsWithHandover: hot.length - hotLeads.length,
    hotLeads: hotLeads.slice(0, SHOWN),
  };
}

export type ActionQueue = ReturnType<typeof getActionQueue>;

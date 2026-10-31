import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { HANDOVER_STATUSES, type HandoverStatus } from "@/lib/domain/taxonomy";
import type { Scope } from "./aggregate";
import { customerColumns, OPEN_LEAD_SQL, scopeWhere } from "./common";

export function parseHandoverStatus(value: unknown): HandoverStatus {
  return HANDOVER_STATUSES.includes(value as HandoverStatus) ? (value as HandoverStatus) : "open";
}

/** The queue: urgent first, then whoever has waited longest. Closed ones newest first. */
export function listHandovers(status: HandoverStatus, scope: Scope, limit: number) {
  const h = schema.handovers;
  const c = schema.conversations;
  const where = and(eq(h.status, status), scopeWhere(c.isSimulated, scope));
  return db
    .select({
      id: h.id,
      reason: h.reason,
      urgency: h.urgency,
      preferredChannel: h.preferredChannel,
      preferredTime: h.preferredTime,
      status: h.status,
      assignedAdvisorId: h.assignedAdvisorId,
      createdAt: h.createdAt,
      conversationId: h.conversationId,
      isSimulated: c.isSimulated,
      /** The same person's open sales leads, linked from the handover row. */
      openLeads: sql<number>`(select count(*) from ${schema.leads} where ${schema.leads.customerId} = ${h.customerId} and ${OPEN_LEAD_SQL})`,
      ...customerColumns,
    })
    .from(h)
    .innerJoin(c, eq(c.id, h.conversationId))
    .innerJoin(schema.customers, eq(schema.customers.id, h.customerId))
    .leftJoin(schema.profiles, eq(schema.profiles.customerId, h.customerId))
    .where(where)
    .orderBy(
      sql`case ${h.urgency} when 'high' then 0 else 1 end`,
      status === "open" ? asc(h.createdAt) : desc(h.createdAt),
    )
    .limit(limit)
    .all();
}

export function handoverCounts(scope: Scope): Record<HandoverStatus, number> {
  const h = schema.handovers;
  const c = schema.conversations;
  const rows = db
    .select({ status: h.status, count: sql<number>`count(*)` })
    .from(h)
    .innerJoin(c, eq(c.id, h.conversationId))
    .where(scopeWhere(c.isSimulated, scope))
    .groupBy(h.status)
    .all();
  const counts = Object.fromEntries(HANDOVER_STATUSES.map((s) => [s, 0])) as Record<
    HandoverStatus,
    number
  >;
  for (const row of rows) counts[row.status] = row.count;
  return counts;
}

import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { HANDOVER_STATUSES, type HandoverStatus } from "@/lib/domain/taxonomy";
import type { Scope } from "./aggregate";
import { customerColumns, scopeWhere } from "./common";
import { resolveRules } from "./conversations";

export function parseHandoverStatus(value: unknown): HandoverStatus {
  return HANDOVER_STATUSES.includes(value as HandoverStatus) ? (value as HandoverStatus) : "open";
}

export function listHandovers(status: HandoverStatus, scope: Scope) {
  const h = schema.handovers;
  const c = schema.conversations;
  const rows = db
    .select({
      id: h.id,
      reason: h.reason,
      ruleIds: h.ruleIds,
      urgency: h.urgency,
      preferredChannel: h.preferredChannel,
      preferredTime: h.preferredTime,
      status: h.status,
      assignedAdvisorId: h.assignedAdvisorId,
      createdAt: h.createdAt,
      updatedAt: h.updatedAt,
      conversationId: h.conversationId,
      stage: c.stage,
      isSimulated: c.isSimulated,
      summary: schema.analyses.summary,
      email: schema.customers.email,
      phone: schema.customers.phone,
      ...customerColumns,
    })
    .from(h)
    .innerJoin(c, eq(c.id, h.conversationId))
    .innerJoin(schema.customers, eq(schema.customers.id, h.customerId))
    .leftJoin(schema.profiles, eq(schema.profiles.customerId, h.customerId))
    .leftJoin(schema.analyses, eq(schema.analyses.conversationId, h.conversationId))
    .where(and(eq(h.status, status), scopeWhere(c.isSimulated, scope)))
    .orderBy(sql`case ${h.urgency} when 'high' then 0 else 1 end`, desc(h.createdAt))
    .limit(300)
    .all();
  return { rows, rules: resolveRules(rows.flatMap((r) => r.ruleIds)) };
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

import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import {
  LEAD_STATUSES,
  LEAD_TYPES,
  type LeadStatus,
  type LeadType,
  TOPICS,
  type Topic,
} from "@/lib/domain/taxonomy";
import type { Scope } from "./aggregate";
import { customerColumns, scopeWhere } from "./common";

export interface LeadFilters {
  scope: Scope;
  type: LeadType | null;
  status: LeadStatus | null;
  topic: Topic | null;
  minScore: number;
}

export const MIN_SCORE_OPTIONS = [0, 30, 55, 75] as const;

export function parseLeadFilters(
  params: Record<string, string | string[] | undefined>,
  scope: Scope,
) {
  const one = (key: string) => (typeof params[key] === "string" ? params[key] : undefined);
  const minScore = Number(one("minScore"));
  return {
    scope,
    type: LEAD_TYPES.includes(one("type") as LeadType) ? (one("type") as LeadType) : null,
    status: LEAD_STATUSES.includes(one("status") as LeadStatus)
      ? (one("status") as LeadStatus)
      : null,
    topic: TOPICS.includes(one("topic") as Topic) ? (one("topic") as Topic) : null,
    minScore: MIN_SCORE_OPTIONS.includes(minScore as (typeof MIN_SCORE_OPTIONS)[number])
      ? minScore
      : 0,
  } satisfies LeadFilters;
}

const PRIORITY_ORDER = sql`case ${schema.leads.priority} when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end`;

export function listLeads(filters: LeadFilters) {
  const l = schema.leads;
  const c = schema.conversations;
  return db
    .select({
      id: l.id,
      type: l.type,
      status: l.status,
      score: l.score,
      priority: l.priority,
      reasonToCall: l.reasonToCall,
      estimatedAnnualPremium: l.estimatedAnnualPremium,
      assignedAdvisorId: l.assignedAdvisorId,
      isSimulated: l.isSimulated,
      updatedAt: l.updatedAt,
      createdAt: l.createdAt,
      conversationId: l.conversationId,
      stage: c.stage,
      topics: schema.analyses.topics,
      email: schema.customers.email,
      phone: schema.customers.phone,
      ...customerColumns,
    })
    .from(l)
    .innerJoin(schema.customers, eq(schema.customers.id, l.customerId))
    .leftJoin(schema.profiles, eq(schema.profiles.customerId, l.customerId))
    .leftJoin(c, eq(c.id, l.conversationId))
    .leftJoin(schema.analyses, eq(schema.analyses.conversationId, l.conversationId))
    .where(
      and(
        scopeWhere(l.isSimulated, filters.scope),
        filters.type ? eq(l.type, filters.type) : undefined,
        filters.status ? eq(l.status, filters.status) : undefined,
        filters.minScore > 0 ? gte(l.score, filters.minScore) : undefined,
        filters.topic
          ? sql`exists (select 1 from json_each(${schema.analyses.topics}) where value = ${filters.topic})`
          : undefined,
      ),
    )
    .orderBy(PRIORITY_ORDER, desc(l.score), desc(l.updatedAt))
    .limit(400)
    .all();
}

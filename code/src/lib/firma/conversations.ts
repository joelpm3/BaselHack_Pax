import "server-only";
import { and, asc, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { CONVERSATION_STATUSES, type ConversationStatus } from "@/lib/domain/taxonomy";
import { messageText } from "@/lib/insights/transcript";
import { getProfile } from "@/lib/profile/service";
import type { Scope } from "./aggregate";
import { customerColumns, scopeWhere } from "./common";

const c = schema.conversations;
const a = schema.analyses;

const listColumns = {
  id: c.id,
  title: c.title,
  mode: c.mode,
  status: c.status,
  stage: c.stage,
  locale: c.locale,
  isSimulated: c.isSimulated,
  messageCount: sql<number>`(select count(*) from ${schema.messages} m where m.conversation_id = ${c.id})`,
  createdAt: c.createdAt,
  lastMessageAt: c.lastMessageAt,
  summary: a.summary,
  topics: a.topics,
  intentStage: a.intentStage,
  sentiment: a.sentiment,
  handoverRequired: sql<boolean>`coalesce(json_extract(${a.handover}, '$.required'), 0)`,
  ...customerColumns,
};

function baseList() {
  return db
    .select(listColumns)
    .from(c)
    .innerJoin(schema.customers, eq(schema.customers.id, c.customerId))
    .leftJoin(schema.profiles, eq(schema.profiles.customerId, c.customerId))
    .leftJoin(a, eq(a.conversationId, c.id))
    .$dynamic();
}

export function parseStatus(value: unknown): ConversationStatus | null {
  return CONVERSATION_STATUSES.includes(value as ConversationStatus)
    ? (value as ConversationStatus)
    : null;
}

export function listConversations(filters: { scope: Scope; status: ConversationStatus | null }) {
  return baseList()
    .where(
      and(
        scopeWhere(c.isSimulated, filters.scope),
        filters.status ? eq(c.status, filters.status) : undefined,
      ),
    )
    .orderBy(desc(sql`coalesce(${c.lastMessageAt}, ${c.createdAt})`))
    .limit(300)
    .all();
}

/** Window for the live screen: active conversations and those that just ended. */
const LIVE_LOOKBACK_MS = 30 * 60_000;

function lastMessages(ids: string[]) {
  if (ids.length === 0) return new Map<string, { role: string; text: string; at: Date }>();
  const rows = db
    .select({
      conversationId: schema.messages.conversationId,
      role: schema.messages.role,
      parts: schema.messages.parts,
      createdAt: schema.messages.createdAt,
    })
    .from(schema.messages)
    .where(
      and(
        inArray(schema.messages.conversationId, ids),
        sql`${schema.messages.createdAt} = (select max(m2.created_at) from ${schema.messages} m2 where m2.conversation_id = ${schema.messages.conversationId})`,
      ),
    )
    .all();
  return new Map(
    rows.map((r) => [
      r.conversationId,
      {
        role: r.role,
        text: messageText(r.parts)
          .replace(/[*_#`>]+/g, "")
          .slice(0, 220),
        at: r.createdAt,
      },
    ]),
  );
}

export function getLiveConversations(scope: Scope, now: Date) {
  const since = new Date(now.getTime() - LIVE_LOOKBACK_MS);
  const rows = baseList()
    .where(
      and(
        scopeWhere(c.isSimulated, scope),
        or(gte(c.lastMessageAt, since), and(eq(c.status, "active"), gte(c.createdAt, since))),
      ),
    )
    .orderBy(desc(sql`coalesce(${c.lastMessageAt}, ${c.createdAt})`))
    .limit(60)
    .all();
  const last = lastMessages(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, lastMessage: last.get(r.id) ?? null }));
}

export type LiveConversation = ReturnType<typeof getLiveConversations>[number];

/** Everything the conversation screen shows, in one synchronous read. */
export function getConversationDetail(id: string) {
  const conversation = db.query.conversations.findFirst({ where: eq(c.id, id) }).sync();
  if (!conversation) return null;
  const customerId = conversation.customerId;
  const customer = db.query.customers
    .findFirst({ where: eq(schema.customers.id, customerId) })
    .sync();
  if (!customer) return null;

  const messages = db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, id))
    .orderBy(asc(schema.messages.createdAt))
    .all();
  const analysis = db.query.analyses.findFirst({ where: eq(a.conversationId, id) }).sync() ?? null;
  const policies = db
    .select()
    .from(schema.policies)
    .where(eq(schema.policies.customerId, customerId))
    .orderBy(asc(schema.policies.isExternal), asc(schema.policies.createdAt))
    .all();
  const calculations = db
    .select()
    .from(schema.calculations)
    .where(eq(schema.calculations.conversationId, id))
    .orderBy(asc(schema.calculations.createdAt))
    .all();
  const recommendations = db
    .select()
    .from(schema.recommendations)
    .where(eq(schema.recommendations.conversationId, id))
    .orderBy(asc(schema.recommendations.createdAt))
    .all();
  const documents = db
    .select({
      id: schema.documents.id,
      filename: schema.documents.filename,
      docType: schema.documents.docType,
      status: schema.documents.status,
      sizeBytes: schema.documents.sizeBytes,
      createdAt: schema.documents.createdAt,
      deletedAt: schema.documents.deletedAt,
      conversationId: schema.documents.conversationId,
    })
    .from(schema.documents)
    .where(eq(schema.documents.customerId, customerId))
    .orderBy(desc(schema.documents.createdAt))
    .all();
  const handovers = db
    .select()
    .from(schema.handovers)
    .where(eq(schema.handovers.conversationId, id))
    .orderBy(desc(schema.handovers.createdAt))
    .all();
  const leads = db
    .select()
    .from(schema.leads)
    .where(eq(schema.leads.conversationId, id))
    .orderBy(desc(schema.leads.score))
    .all();
  const leadIds = leads.map((l) => l.id);
  const activities = leadIds.length
    ? db
        .select({
          id: schema.leadActivities.id,
          leadId: schema.leadActivities.leadId,
          type: schema.leadActivities.type,
          body: schema.leadActivities.body,
          data: schema.leadActivities.data,
          createdAt: schema.leadActivities.createdAt,
          advisorName: schema.advisors.name,
        })
        .from(schema.leadActivities)
        .leftJoin(schema.advisors, eq(schema.advisors.id, schema.leadActivities.advisorId))
        .where(inArray(schema.leadActivities.leadId, leadIds))
        .orderBy(desc(schema.leadActivities.createdAt))
        .all()
    : [];
  const applications = db
    .select()
    .from(schema.applications)
    .where(eq(schema.applications.conversationId, id))
    .all();
  const feedback = db
    .select()
    .from(schema.feedback)
    .where(eq(schema.feedback.conversationId, id))
    .all();

  const auditIds = [
    id,
    customerId,
    ...leadIds,
    ...handovers.map((h) => h.id),
    ...recommendations.map((r) => r.id),
    ...applications.map((ap) => ap.id),
  ];
  const auditTrail = db
    .select()
    .from(schema.auditLog)
    .where(inArray(schema.auditLog.entityId, auditIds))
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(100)
    .all();
  const profileEvents = db
    .select()
    .from(schema.profileEvents)
    .where(eq(schema.profileEvents.conversationId, id))
    .orderBy(asc(schema.profileEvents.createdAt))
    .all();

  const ruleIds = [...(analysis?.handover.ruleIds ?? []), ...handovers.flatMap((h) => h.ruleIds)];
  const ruleSet = conversation.ruleSetId
    ? (db.query.ruleSets
        .findFirst({ where: eq(schema.ruleSets.id, conversation.ruleSetId) })
        .sync() ?? null)
    : null;

  return {
    conversation,
    customer,
    profile: getProfile(customerId),
    messages,
    analysis,
    policies,
    calculations,
    recommendations,
    documents,
    handovers,
    leads,
    activities,
    applications,
    feedback,
    auditTrail,
    profileEvents,
    rules: resolveRules(ruleIds),
    ruleSetVersion: ruleSet?.version ?? null,
    advisors: listAdvisors(),
  };
}

export type ConversationDetail = NonNullable<ReturnType<typeof getConversationDetail>>;

/** Rule ids (from any version) → rule text and version, for "why was this flagged". */
export function resolveRules(ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return {};
  const rows = db
    .select({
      id: schema.rules.id,
      text: schema.rules.text,
      action: schema.rules.action,
      version: schema.ruleSets.version,
    })
    .from(schema.rules)
    .innerJoin(schema.ruleSets, eq(schema.ruleSets.id, schema.rules.ruleSetId))
    .where(inArray(schema.rules.id, unique))
    .all();
  return Object.fromEntries(rows.map((r) => [r.id, r]));
}

export function listAdvisors() {
  return db
    .select({ id: schema.advisors.id, name: schema.advisors.name, team: schema.advisors.team })
    .from(schema.advisors)
    .orderBy(asc(schema.advisors.name))
    .all();
}

export type AdvisorOption = ReturnType<typeof listAdvisors>[number];

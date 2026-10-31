import "server-only";
import { and, asc, desc, eq, inArray, like, or, type SQL, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getProfile } from "@/lib/profile/service";
import type { Scope } from "./aggregate";
import { customerColumns, OPEN_LEAD_SQL, scopeWhere } from "./common";
import { listAdvisors, resolveRules } from "./conversations";
import { buildCommunications, buildTimeline } from "./customer-timeline";

const cu = schema.customers;
const c = schema.conversations;
const h = schema.handovers;
const l = schema.leads;

const openHandoverCount = sql<number>`(select count(*) from ${h} where ${h.customerId} = ${cu.id} and ${h.status} = 'open')`;
const openLeadCount = sql<number>`(select count(*) from ${l} where ${l.customerId} = ${cu.id} and ${OPEN_LEAD_SQL})`;

/** Customers the dashboard knows something about: at least one conversation or lead. */
export function listCustomers(scope: Scope, query: string) {
  const q = query.trim().slice(0, 80);
  const lastContact =
    sql<Date | null>`(select max(coalesce(${c.lastMessageAt}, ${c.createdAt})) from ${c} where ${c.customerId} = ${cu.id})`.mapWith(
      c.createdAt,
    );
  const search: SQL | undefined = q
    ? or(
        like(cu.firstName, `%${q}%`),
        like(cu.lastName, `%${q}%`),
        like(sql`${cu.firstName} || ' ' || ${cu.lastName}`, `%${q}%`),
        like(cu.email, `%${q}%`),
        like(sql`json_extract(${schema.profiles.data}, '$.residence.city')`, `%${q}%`),
      )
    : undefined;
  return db
    .select({
      ...customerColumns,
      isSimulated: cu.isSimulated,
      email: cu.email,
      phone: cu.phone,
      conversationCount: sql<number>`(select count(*) from ${c} where ${c.customerId} = ${cu.id})`,
      openHandovers: openHandoverCount,
      openLeads: openLeadCount,
      topLeadScore: sql<
        number | null
      >`(select max(${l.score}) from ${l} where ${l.customerId} = ${cu.id} and ${OPEN_LEAD_SQL})`,
      lastContactAt: lastContact,
    })
    .from(cu)
    .leftJoin(schema.profiles, eq(schema.profiles.customerId, cu.id))
    .where(
      and(
        scopeWhere(cu.isSimulated, scope),
        sql`(exists (select 1 from ${c} where ${c.customerId} = ${cu.id}) or exists (select 1 from ${l} where ${l.customerId} = ${cu.id}))`,
        search,
      ),
    )
    .orderBy(desc(openHandoverCount), desc(openLeadCount), desc(lastContact))
    .limit(300)
    .all();
}

export type CustomerListRow = ReturnType<typeof listCustomers>[number];

/** Everything Pax knows about one person, across all of their conversations. */
export function getCustomerDetail(id: string) {
  const customer = db.query.customers.findFirst({ where: eq(cu.id, id) }).sync();
  if (!customer) return null;

  const conversations = db
    .select({
      id: c.id,
      title: c.title,
      mode: c.mode,
      status: c.status,
      stage: c.stage,
      locale: c.locale,
      isSimulated: c.isSimulated,
      createdAt: c.createdAt,
      lastMessageAt: c.lastMessageAt,
      messageCount: sql<number>`(select count(*) from ${schema.messages} m where m.conversation_id = ${c.id})`,
    })
    .from(c)
    .where(eq(c.customerId, id))
    .orderBy(desc(sql`coalesce(${c.lastMessageAt}, ${c.createdAt})`))
    .all();
  const conversationIds = conversations.map((x) => x.id);

  const analyses = conversationIds.length
    ? db
        .select()
        .from(schema.analyses)
        .where(inArray(schema.analyses.conversationId, conversationIds))
        .all()
    : [];

  const policies = db
    .select()
    .from(schema.policies)
    .where(eq(schema.policies.customerId, id))
    .orderBy(asc(schema.policies.isExternal), asc(schema.policies.createdAt))
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
    .where(eq(schema.documents.customerId, id))
    .orderBy(desc(schema.documents.createdAt))
    .all();
  const handovers = db
    .select()
    .from(h)
    .where(eq(h.customerId, id))
    .orderBy(
      sql`case ${h.status} when 'open' then 0 when 'scheduled' then 1 else 2 end`,
      desc(h.createdAt),
    )
    .all();
  const leads = db
    .select()
    .from(l)
    .where(eq(l.customerId, id))
    .orderBy(sql`case when ${OPEN_LEAD_SQL} then 0 else 1 end`, desc(l.score))
    .all();
  const leadIds = leads.map((x) => x.id);
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
  const recommendations = db
    .select()
    .from(schema.recommendations)
    .where(eq(schema.recommendations.customerId, id))
    .orderBy(desc(schema.recommendations.createdAt))
    .all();
  const applications = db
    .select()
    .from(schema.applications)
    .where(eq(schema.applications.customerId, id))
    .orderBy(desc(schema.applications.createdAt))
    .all();
  const feedback = db
    .select()
    .from(schema.feedback)
    .where(eq(schema.feedback.customerId, id))
    .all();

  const entityIds = [
    id,
    ...conversationIds,
    ...leadIds,
    ...handovers.map((x) => x.id),
    ...recommendations.map((x) => x.id),
    ...applications.map((x) => x.id),
    ...documents.map((x) => x.id),
    ...policies.map((x) => x.id),
  ];
  const audit = db
    .select({
      id: schema.auditLog.id,
      action: schema.auditLog.action,
      actorType: schema.auditLog.actorType,
      actorName: schema.advisors.name,
      entityId: schema.auditLog.entityId,
      data: schema.auditLog.data,
      createdAt: schema.auditLog.createdAt,
    })
    .from(schema.auditLog)
    .leftJoin(
      schema.advisors,
      and(
        eq(schema.auditLog.actorType, "advisor"),
        eq(schema.advisors.id, schema.auditLog.actorId),
      ),
    )
    .where(inArray(schema.auditLog.entityId, entityIds))
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(300)
    .all();

  const timeline = buildTimeline({
    conversations,
    handovers,
    leads,
    activities,
    recommendations,
    applications,
    policies,
    documents,
    feedback,
    audit,
  });

  return {
    customer,
    profile: getProfile(id),
    conversations,
    analyses: Object.fromEntries(analyses.map((a) => [a.conversationId, a])),
    policies,
    documents,
    handovers,
    leads,
    activities,
    recommendations,
    applications,
    feedback,
    timeline,
    communications: buildCommunications({ activities, audit }),
    rules: resolveRules([
      ...handovers.flatMap((x) => x.ruleIds),
      ...analyses.flatMap((a) => a.handover.ruleIds),
    ]),
    advisors: listAdvisors(),
  };
}

export type CustomerDetail = NonNullable<ReturnType<typeof getCustomerDetail>>;

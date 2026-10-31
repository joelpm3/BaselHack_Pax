import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { toIsoDate } from "@/lib/documents/dates";
import { customerColumns } from "@/lib/firma/common";
import { followUpConfig } from "./engine";
import { followUpDate, nextCheckinDate } from "./plan";

/** Reads for the Wiedervorlagen page and the customer follow-up panel. */

const fe = schema.futureEvents;

const eventColumns = {
  id: fe.id,
  kind: fe.kind,
  subject: fe.subject,
  expectedDate: fe.expectedDate,
  precision: fe.precision,
  confidence: fe.confidence,
  sourceQuote: fe.sourceQuote,
  note: fe.note,
  status: fe.status,
  leadId: fe.leadId,
  conversationId: fe.conversationId,
  conversationDate: sql<
    number | null
  >`coalesce(${schema.conversations.lastMessageAt}, ${schema.conversations.createdAt})`,
};

function withFollowUpDate<T extends { expectedDate: string }>(rows: T[]) {
  const config = followUpConfig();
  return rows.map((r) => ({ ...r, followUpOn: followUpDate(r.expectedDate, config) }));
}

function emailsFor(eventIds: string[]) {
  if (eventIds.length === 0) return new Map<string, OutboxRow[]>();
  const rows = db
    .select(outboxColumns)
    .from(schema.outboxEmails)
    .where(inArray(schema.outboxEmails.futureEventId, eventIds))
    .orderBy(asc(schema.outboxEmails.sequence))
    .all();
  const map = new Map<string, OutboxRow[]>();
  for (const row of rows) {
    const key = row.futureEventId as string;
    map.set(key, [...(map.get(key) ?? []), row]);
  }
  return map;
}

/** Open Wiedervorlagen (due), then the ones that ended (responded, lost), newest first. */
export function listFollowUps(status: "due" | "responded" | "lost") {
  const rows = db
    .select({
      ...eventColumns,
      leadStatus: schema.leads.status,
      leadType: schema.leads.type,
      priority: schema.leads.priority,
      score: schema.leads.score,
      reasonToCall: schema.leads.reasonToCall,
      talkingPoints: schema.leads.talkingPoints,
      assignedAdvisorId: schema.leads.assignedAdvisorId,
      email: schema.customers.email,
      phone: schema.customers.phone,
      ...customerColumns,
    })
    .from(fe)
    .innerJoin(schema.customers, eq(schema.customers.id, fe.customerId))
    .leftJoin(schema.profiles, eq(schema.profiles.customerId, fe.customerId))
    .leftJoin(schema.leads, eq(schema.leads.id, fe.leadId))
    .leftJoin(schema.conversations, eq(schema.conversations.id, fe.conversationId))
    .where(and(eq(fe.status, status), eq(schema.customers.isSimulated, false)))
    .orderBy(asc(fe.expectedDate))
    .limit(200)
    .all();
  const emails = emailsFor(rows.map((r) => r.id));
  return withFollowUpDate(rows).map((r) => ({ ...r, emails: emails.get(r.id) ?? [] }));
}

export function listUpcomingEvents() {
  const rows = db
    .select({ ...eventColumns, ...customerColumns })
    .from(fe)
    .innerJoin(schema.customers, eq(schema.customers.id, fe.customerId))
    .leftJoin(schema.profiles, eq(schema.profiles.customerId, fe.customerId))
    .leftJoin(schema.conversations, eq(schema.conversations.id, fe.conversationId))
    .where(and(eq(fe.status, "upcoming"), eq(schema.customers.isSimulated, false)))
    .orderBy(asc(fe.expectedDate))
    .limit(200)
    .all();
  return withFollowUpDate(rows);
}

export function followUpCounts(): Record<"upcoming" | "due" | "responded" | "lost", number> {
  const rows = db
    .select({ status: fe.status, count: sql<number>`count(*)` })
    .from(fe)
    .innerJoin(schema.customers, eq(schema.customers.id, fe.customerId))
    .where(eq(schema.customers.isSimulated, false))
    .groupBy(fe.status)
    .all();
  const counts = { upcoming: 0, due: 0, responded: 0, lost: 0 };
  for (const row of rows)
    if (row.status in counts) counts[row.status as keyof typeof counts] = row.count;
  return counts;
}

const outboxColumns = {
  id: schema.outboxEmails.id,
  customerId: schema.outboxEmails.customerId,
  kind: schema.outboxEmails.kind,
  futureEventId: schema.outboxEmails.futureEventId,
  leadId: schema.outboxEmails.leadId,
  sequence: schema.outboxEmails.sequence,
  toAddress: schema.outboxEmails.toAddress,
  locale: schema.outboxEmails.locale,
  subject: schema.outboxEmails.subject,
  body: schema.outboxEmails.body,
  sentOn: schema.outboxEmails.sentOn,
  repliedAt: schema.outboxEmails.repliedAt,
  createdAt: schema.outboxEmails.createdAt,
};
export type OutboxRow = {
  [K in keyof typeof outboxColumns]: (typeof schema.outboxEmails.$inferSelect)[K];
};

export function listOutbox(limit = 50) {
  return db
    .select({ ...outboxColumns, ...customerColumns })
    .from(schema.outboxEmails)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.outboxEmails.customerId))
    .leftJoin(schema.profiles, eq(schema.profiles.customerId, schema.outboxEmails.customerId))
    .orderBy(desc(schema.outboxEmails.sentOn), desc(schema.outboxEmails.createdAt))
    .limit(limit)
    .all();
}

/** Every real customer with an email address: check-in on or off, and when the next one is due. */
export function listCheckins() {
  const c = schema.customers;
  const rows = db
    .select({
      ...customerColumns,
      email: c.email,
      createdAt: c.createdAt,
      enabled: schema.contactPreferences.yearlyCheckin,
      lastSentOn: sql<
        string | null
      >`(select max(${schema.outboxEmails.sentOn}) from ${schema.outboxEmails} where ${schema.outboxEmails.customerId} = ${c.id} and ${schema.outboxEmails.kind} = 'yearly_checkin')`,
    })
    .from(c)
    .innerJoin(schema.profiles, eq(schema.profiles.customerId, c.id))
    .leftJoin(schema.contactPreferences, eq(schema.contactPreferences.customerId, c.id))
    .where(and(eq(c.isSimulated, false), isNotNull(c.email)))
    .all();
  return rows
    .map((r) => ({
      ...r,
      enabled: r.enabled ?? true,
      nextOn: nextCheckinDate({ lastSentOn: r.lastSentOn, since: toIsoDate(r.createdAt) }),
    }))
    .sort((a, b) => a.nextOn.localeCompare(b.nextOn));
}

/** Everything the follow-up panel of one customer shows. */
export function customerFollowUps(customerId: string) {
  const events = withFollowUpDate(
    db
      .select(eventColumns)
      .from(fe)
      .leftJoin(schema.conversations, eq(schema.conversations.id, fe.conversationId))
      .where(eq(fe.customerId, customerId))
      .orderBy(asc(fe.expectedDate))
      .all(),
  );
  const emails = db
    .select(outboxColumns)
    .from(schema.outboxEmails)
    .where(eq(schema.outboxEmails.customerId, customerId))
    .orderBy(desc(schema.outboxEmails.sentOn), desc(schema.outboxEmails.createdAt))
    .all();
  const customer = db
    .select({ email: schema.customers.email, createdAt: schema.customers.createdAt })
    .from(schema.customers)
    .where(eq(schema.customers.id, customerId))
    .get();
  const pref = db
    .select({ enabled: schema.contactPreferences.yearlyCheckin })
    .from(schema.contactPreferences)
    .where(eq(schema.contactPreferences.customerId, customerId))
    .get();
  const lastCheckin = emails.find((e) => e.kind === "yearly_checkin")?.sentOn ?? null;
  return {
    events,
    emails,
    checkin: customer
      ? {
          enabled: pref?.enabled ?? true,
          hasEmail: Boolean(customer.email),
          nextOn: nextCheckinDate({
            lastSentOn: lastCheckin,
            since: toIsoDate(customer.createdAt),
          }),
        }
      : null,
  };
}

import "server-only";
import { and, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import { env } from "@/env";
import { modelName } from "@/lib/ai/models";
import { audit } from "@/lib/audit";
import { db, schema } from "@/lib/db";
import type { ProductInterest } from "@/lib/db/schema";
import { toIsoDate } from "@/lib/documents/dates";
import type { LeadStatus, LeadType, Locale } from "@/lib/domain/taxonomy";
import { publish } from "@/lib/events/bus";
import { leadPriority, scoreLead } from "@/lib/leads/scoring";
import { getProfile } from "@/lib/profile/service";
import { type FollowUpInput, writeCheckin, writeFollowUp, writeReminder } from "./emails";
import { type EventAction, type FollowUpConfig, isCheckinDue, planEvent } from "./plan";
import type { FutureEventKind } from "./taxonomy";

/**
 * The follow-up engine: turns due future events into Wiedervorlage leads with a personalised
 * email, sends the reminder, marks unanswered leads lost, reopens them when the customer reacts,
 * and writes the yearly check-in. Idempotent for a given "today", so the dashboard can run it on
 * demand (and with a simulated date for the demo). Simulated customers are left out.
 */

export function followUpConfig(): FollowUpConfig {
  return {
    leadDays: env.FOLLOW_UP_LEAD_DAYS,
    reminderDays: env.FOLLOW_UP_REMINDER_DAYS,
    maxEmails: 2,
  };
}

/** German labels for texts written into leads (the dashboard's working language). */
export const KIND_LABEL_DE: Record<FutureEventKind, string> = {
  end_of_studies: "Studienabschluss",
  first_job: "Erste Stelle",
  wedding: "Heirat",
  child_birth: "Geburt eines Kindes",
  home_purchase: "Kauf eines Eigenheims",
  retirement: "Pensionierung",
  child_turns_18: "Kind wird 18",
  child_turns_25: "Kind wird 25",
  contract_end: "Vertragsende",
  job_change: "Stellenwechsel",
  self_employment: "Selbstständigkeit",
  other: "Lebensereignis",
};

/** Pax products that typically matter at this event (shown as interest on the lead). */
const PRODUCTS_FOR: Record<FutureEventKind, ProductInterest["productCode"][]> = {
  end_of_studies: ["pax3a", "erwerbsunfaehigkeit"],
  first_job: ["pax3a", "erwerbsunfaehigkeit"],
  wedding: ["todesfall"],
  child_birth: ["todesfall", "erwerbsunfaehigkeit"],
  home_purchase: ["todesfall"],
  retirement: ["auszahlungsplan"],
  child_turns_18: [],
  child_turns_25: [],
  contract_end: [],
  job_change: ["pax3a"],
  self_employment: ["erwerbsunfaehigkeit", "pax3a"],
  other: [],
};

export interface RunSummary {
  opened: number;
  reminded: number;
  lost: number;
  responded: number;
  reopened: number;
  checkins: number;
  failed: number;
}

const emptySummary = (): RunSummary => ({
  opened: 0,
  reminded: 0,
  lost: 0,
  responded: 0,
  reopened: 0,
  checkins: 0,
  failed: 0,
});

type EventRow = typeof schema.futureEvents.$inferSelect;
type Customer = typeof schema.customers.$inferSelect;

const IN_PROGRESS: readonly LeadStatus[] = ["meeting", "offer", "won"];
const LLM_CONCURRENCY = 3;

async function pool(tasks: Array<() => Promise<void>>, limit: number): Promise<void> {
  const queue = [...tasks];
  const worker = async () => {
    for (let task = queue.shift(); task; task = queue.shift()) await task();
  };
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, worker));
}

function eventEmails(eventId: string) {
  return db
    .select()
    .from(schema.outboxEmails)
    .where(eq(schema.outboxEmails.futureEventId, eventId))
    .all();
}

/** Did the customer write in a (real) chat after `since`? */
function customerWroteAfter(customerId: string, since: Date): boolean {
  return Boolean(
    db
      .select({ id: schema.messages.id })
      .from(schema.messages)
      .innerJoin(schema.conversations, eq(schema.conversations.id, schema.messages.conversationId))
      .where(
        and(
          eq(schema.conversations.customerId, customerId),
          eq(schema.messages.role, "user"),
          gt(schema.messages.createdAt, since),
        ),
      )
      .get(),
  );
}

function sourceOf(event: EventRow) {
  if (!event.conversationId) return null;
  const conversation = db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.id, event.conversationId))
    .get();
  if (!conversation) return null;
  const analysis = db
    .select()
    .from(schema.analyses)
    .where(eq(schema.analyses.conversationId, conversation.id))
    .get();
  return { conversation, analysis };
}

function emailInput(
  event: EventRow,
  customer: Customer,
  sequence: number,
  today: string,
): FollowUpInput {
  const source = sourceOf(event);
  return {
    locale: customer.locale as Locale,
    firstName: customer.firstName,
    lastName: customer.lastName,
    kind: event.kind,
    kindLabel: KIND_LABEL_DE[event.kind],
    subject: event.subject,
    expectedDate: event.expectedDate,
    precision: event.precision,
    sourceQuote: event.sourceQuote,
    note: event.note,
    conversationDate: source
      ? toIsoDate(source.conversation.lastMessageAt ?? source.conversation.createdAt)
      : null,
    conversationSummary: source?.analysis?.summary ?? null,
    sequence,
    today,
  };
}

function leadTypeFor(event: EventRow, customer: Customer): LeadType {
  const policies = db
    .select({ isExternal: schema.policies.isExternal, status: schema.policies.status })
    .from(schema.policies)
    .where(eq(schema.policies.customerId, customer.id))
    .all();
  const hasPax = policies.some((p) => p.status === "active" && !p.isExternal);
  const hasExternal = policies.some((p) => p.status === "active" && p.isExternal);
  if (event.kind === "contract_end" && hasExternal && !hasPax) return "switch_opportunity";
  return hasPax || customer.lifecycle === "client" ? "existing_upsell" : "new_business";
}

function storeEmail(values: typeof schema.outboxEmails.$inferInsert): string {
  const [row] = db
    .insert(schema.outboxEmails)
    .values(values)
    .returning({ id: schema.outboxEmails.id })
    .all();
  // The company's customer view lists emails from lead activities of type "email" and from
  // `email.*` audit entries on the customer; each email is recorded in exactly one of them.
  const shown = {
    subject: values.subject,
    body: values.body,
    to: values.toAddress,
    direction: "outbound",
    outboxId: row.id,
    sequence: values.sequence,
    sentOn: values.sentOn,
  };
  if (values.leadId) {
    db.insert(schema.leadActivities)
      .values({ leadId: values.leadId, type: "email", body: values.body, data: shown })
      .run();
  } else {
    audit({
      actorType: "system",
      action: "email.sent",
      entityType: "customer",
      entityId: values.customerId,
      data: { ...shown, kind: values.kind },
    });
  }
  return row.id;
}

async function openFollowUp(event: EventRow, customer: Customer, today: string): Promise<void> {
  const input = emailInput(event, customer, 1, today);
  const text = await writeFollowUp(input);
  const source = sourceOf(event);
  const productInterest: ProductInterest[] = PRODUCTS_FOR[event.kind].map((productCode) => ({
    productCode,
    strength: "medium",
  }));
  const type = leadTypeFor(event, customer);
  const { score, breakdown } = scoreLead({
    type,
    intentStage: source?.analysis?.intentStage ?? "exploring",
    gaps: source?.analysis?.gaps ?? [],
    productInterest,
    lifecycle: customer.lifecycle,
    hasContactDetails: Boolean(customer.email || customer.phone),
    stage: source?.conversation.stage ?? "started",
    mode: source?.conversation.mode ?? "new_business",
    handover: null,
  });
  const priority = leadPriority(score, null);
  const quotePoint = `Zitat: «${event.sourceQuote}»`;

  const leadId = db.transaction((tx) => {
    // A follow-up lead is not tied to the conversation: the conversation's own lead stays as it is.
    const [lead] = tx
      .insert(schema.leads)
      .values({
        customerId: customer.id,
        conversationId: null,
        type,
        score,
        scoreBreakdown: breakdown,
        priority,
        reasonToCall: text.reasonToCall,
        talkingPoints: [quotePoint, ...text.talkingPoints].slice(0, 5),
        productInterest,
        nextActionAt: new Date(`${today}T08:00:00Z`),
        isSimulated: false,
      })
      .returning({ id: schema.leads.id })
      .all();
    tx.insert(schema.leadActivities)
      .values({
        leadId: lead.id,
        type: "system",
        data: { event: "created", score, priority, futureEventId: event.id },
      })
      .run();
    tx.update(schema.futureEvents)
      .set({ status: "due", leadId: lead.id })
      .where(eq(schema.futureEvents.id, event.id))
      .run();
    return lead.id;
  });
  audit({
    actorType: "system",
    action: "lead.created",
    entityType: "lead",
    entityId: leadId,
    data: { type, score, priority, source: "follow_up", futureEventId: event.id, today },
  });
  if (customer.email) {
    storeEmail({
      customerId: customer.id,
      kind: "event_follow_up",
      futureEventId: event.id,
      leadId,
      sequence: 1,
      toAddress: customer.email,
      locale: customer.locale,
      subject: text.subject,
      body: text.body,
      sentOn: today,
      model: modelName("analysis"),
    });
  }
  publish({ type: "lead.upserted", leadId, conversationId: null });
}

async function remind(
  event: EventRow,
  customer: Customer,
  sequence: number,
  today: string,
): Promise<void> {
  if (!customer.email) return;
  const text = await writeReminder(emailInput(event, customer, sequence, today));
  storeEmail({
    customerId: customer.id,
    kind: "event_follow_up",
    futureEventId: event.id,
    leadId: event.leadId,
    sequence,
    toAddress: customer.email,
    locale: customer.locale,
    subject: text.subject,
    body: text.body,
    sentOn: today,
    model: modelName("analysis"),
  });
  if (event.leadId) publish({ type: "lead.upserted", leadId: event.leadId, conversationId: null });
}

function setLeadStatus(leadId: string, to: LeadStatus, note: string): void {
  const lead = db.select().from(schema.leads).where(eq(schema.leads.id, leadId)).get();
  if (!lead) return;
  db.transaction((tx) => {
    if (lead.status !== to) {
      tx.update(schema.leads).set({ status: to }).where(eq(schema.leads.id, leadId)).run();
      tx.insert(schema.leadActivities)
        .values({ leadId, type: "status_change", data: { from: lead.status, to } })
        .run();
    }
    tx.insert(schema.leadActivities).values({ leadId, type: "note", body: note }).run();
  });
  if (lead.status !== to) {
    audit({
      actorType: "system",
      action: "lead.status_changed",
      entityType: "lead",
      entityId: leadId,
      data: { from: lead.status, to, source: "follow_up" },
    });
  }
  publish({ type: "lead.upserted", leadId, conversationId: lead.conversationId });
}

function lose(event: EventRow, today: string): void {
  db.update(schema.futureEvents)
    .set({ status: "lost" })
    .where(eq(schema.futureEvents.id, event.id))
    .run();
  if (event.leadId) {
    setLeadStatus(
      event.leadId,
      "lost",
      `Keine Reaktion auf zwei E-Mails (Stand ${today}). Wird wieder geöffnet, sobald sich die Person meldet.`,
    );
  }
}

function respond(event: EventRow, reopen: boolean): void {
  db.update(schema.futureEvents)
    .set({ status: "responded" })
    .where(eq(schema.futureEvents.id, event.id))
    .run();
  if (!event.leadId) return;
  const lead = db
    .select({ status: schema.leads.status })
    .from(schema.leads)
    .where(eq(schema.leads.id, event.leadId))
    .get();
  if (!lead) return;
  if (reopen && lead.status === "lost") {
    setLeadStatus(
      event.leadId,
      "new",
      "Die Person hat sich wieder gemeldet: Lead wieder geöffnet.",
    );
  } else if (!IN_PROGRESS.includes(lead.status)) {
    setLeadStatus(event.leadId, lead.status, "Die Person hat auf die Wiedervorlage reagiert.");
  }
}

async function runEvents(
  today: string,
  config: FollowUpConfig,
  customerId: string | undefined,
  summary: RunSummary,
): Promise<void> {
  const rows = db
    .select({ event: schema.futureEvents, customer: schema.customers })
    .from(schema.futureEvents)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.futureEvents.customerId))
    .where(
      and(
        inArray(schema.futureEvents.status, ["upcoming", "due", "lost"]),
        eq(schema.customers.isSimulated, false),
        customerId ? eq(schema.futureEvents.customerId, customerId) : undefined,
      ),
    )
    .all();

  const tasks: Array<() => Promise<void>> = [];
  for (const { event, customer } of rows) {
    const emails = eventEmails(event.id);
    const first = emails.find((e) => e.sequence === 1);
    const leadStatus = event.leadId
      ? db
          .select({ status: schema.leads.status })
          .from(schema.leads)
          .where(eq(schema.leads.id, event.leadId))
          .get()?.status
      : undefined;
    const action: EventAction | null = planEvent(
      {
        status: event.status,
        expectedDate: event.expectedDate,
        emails: emails.map((e) => ({
          sequence: e.sequence,
          sentOn: e.sentOn,
          replied: e.repliedAt !== null,
        })),
        cameBack: first ? customerWroteAfter(customer.id, first.createdAt) : false,
        leadInProgress: leadStatus ? IN_PROGRESS.includes(leadStatus) : false,
      },
      today,
      config,
    );
    if (!action) continue;
    // Without an email address the advisor follows up by phone; nothing to remind or lose.
    if (!customer.email && (action.type === "remind" || action.type === "lose")) continue;

    tasks.push(async () => {
      try {
        if (action.type === "open") {
          await openFollowUp(event, customer, today);
          summary.opened++;
        } else if (action.type === "remind") {
          await remind(event, customer, action.sequence, today);
          summary.reminded++;
        } else if (action.type === "lose") {
          lose(event, today);
          summary.lost++;
        } else {
          respond(event, action.reopen);
          if (action.reopen) summary.reopened++;
          else summary.responded++;
        }
      } catch (error) {
        summary.failed++;
        console.error(`[followups] ${action.type} failed for event ${event.id}`, error);
      }
    });
  }
  await pool(tasks, LLM_CONCURRENCY);
}

function profileFacts(customerId: string): string {
  const p = getProfile(customerId);
  return JSON.stringify({
    maritalStatus: p.person.maritalStatus,
    employment: p.person.employment,
    children: p.children.length,
    city: p.residence.city,
    goals: p.goals,
    plannedEvents: p.plannedEvents,
  });
}

async function runCheckins(
  today: string,
  customerId: string | undefined,
  summary: RunSummary,
): Promise<void> {
  const c = schema.customers;
  const lastCheckin = db
    .select({
      customerId: schema.outboxEmails.customerId,
      lastSentOn: sql<string>`max(${schema.outboxEmails.sentOn})`.as("last_sent_on"),
    })
    .from(schema.outboxEmails)
    .where(eq(schema.outboxEmails.kind, "yearly_checkin"))
    .groupBy(schema.outboxEmails.customerId)
    .as("last_checkin");
  const rows = db
    .select({
      customer: c,
      enabled: schema.contactPreferences.yearlyCheckin,
      lastSentOn: lastCheckin.lastSentOn,
    })
    .from(c)
    .innerJoin(schema.profiles, eq(schema.profiles.customerId, c.id))
    .leftJoin(schema.contactPreferences, eq(schema.contactPreferences.customerId, c.id))
    .leftJoin(lastCheckin, eq(lastCheckin.customerId, c.id))
    .where(
      and(
        eq(c.isSimulated, false),
        isNotNull(c.email),
        customerId ? eq(c.id, customerId) : undefined,
      ),
    )
    .all();

  const tasks = rows
    .filter((r) =>
      isCheckinDue(
        {
          enabled: r.enabled ?? true,
          hasEmail: Boolean(r.customer.email),
          lastSentOn: r.lastSentOn,
          since: toIsoDate(r.customer.createdAt),
        },
        today,
      ),
    )
    .map(({ customer }) => async () => {
      try {
        const text = await writeCheckin({
          locale: customer.locale as Locale,
          firstName: customer.firstName,
          lastName: customer.lastName,
          today,
          profileFacts: profileFacts(customer.id),
        });
        storeEmail({
          customerId: customer.id,
          kind: "yearly_checkin",
          sequence: 1,
          toAddress: customer.email as string,
          locale: customer.locale,
          subject: text.subject,
          body: text.body,
          sentOn: today,
          model: modelName("analysis"),
        });
        summary.checkins++;
      } catch (error) {
        summary.failed++;
        console.error(`[followups] check-in failed for customer ${customer.id}`, error);
      }
    });
  await pool(tasks, LLM_CONCURRENCY);
}

// One run at a time: a double click or the post-analysis hook must not open an event twice.
const globalForRuns = globalThis as unknown as { paxFollowUpRun?: Promise<unknown> };

export function runFollowUps(options: { today: string; customerId?: string }): Promise<RunSummary> {
  const run = (globalForRuns.paxFollowUpRun ?? Promise.resolve()).then(async () => {
    const summary = emptySummary();
    await runEvents(options.today, followUpConfig(), options.customerId, summary);
    await runCheckins(options.today, options.customerId, summary);
    return summary;
  });
  globalForRuns.paxFollowUpRun = run.catch(() => undefined);
  return run;
}

/** Demo helper: removes everything the engine created and sets events back to "upcoming". */
export function resetFollowUps(): void {
  db.transaction((tx) => {
    const leadIds = tx
      .select({ leadId: schema.futureEvents.leadId })
      .from(schema.futureEvents)
      .where(isNotNull(schema.futureEvents.leadId))
      .all()
      .map((r) => r.leadId as string);
    tx.delete(schema.outboxEmails).run();
    // Check-in emails are also recorded as audit entries for the customer view.
    tx.delete(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.action, "email.sent"),
          sql`json_extract(${schema.auditLog.data}, '$.outboxId') is not null`,
        ),
      )
      .run();
    tx.update(schema.futureEvents).set({ status: "upcoming", leadId: null }).run();
    if (leadIds.length > 0) tx.delete(schema.leads).where(inArray(schema.leads.id, leadIds)).run();
  });
}

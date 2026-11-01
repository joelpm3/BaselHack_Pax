/**
 * The Müller family for the pitch demo (documentation/DEMO_JOURNEY.md), in the state Pax knows
 * before the demo: Jane and May met Clara in autumn 2024 with two incomes and no children,
 * uploaded their salary and pension certificates, saw May's disability gap and decided to wait
 * until a child is on the way. In December 2025 Jane answered the yearly check-in: nothing new,
 * but they still hope for a child next year. In August 2026 Pax asked about it; Jane replied that
 * their first child is due in December, that she will stop working after the birth and that she
 * would come back to Clara. The demo starts with that chat in November 2026, and May's disability
 * gap is CHF 1'239 a month.
 *
 * The 2024 conversation is a real recording (fixtures/mueller-2024-chat.json): messages with
 * their widgets, the uploaded documents and their confirmed extractions, the Logismata
 * calculations, the recommendation and the analysis. A few of Clara's sentences were edited to
 * match the pitch. The seed gives every row a new id and moves it to October 2024; the PDFs come
 * from public/samples (scripts/sample-docs.ts) and are stored encrypted like an upload.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { asc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";
import { encryptBuffer, parseEncryptionKey } from "@/lib/documents/crypto";
import { day, insertCheckin, type SeedPersona, stamp } from "./seed-personas";

type Db = BetterSQLite3Database<typeof schema>;

const EMAIL = "jane.mueller@example.ch";
/** Mid-October 2024 when seeded in early November 2026; 15:00 UTC is 17:00 in Basel. */
const FIRST_CHAT_DAYS_AGO = 745;
const FIRST_CHAT_HOUR = 15;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

interface Fixture {
  /** Ids of the recording's company rules, replaced by the seeded ones. */
  refs: { ruleSet: string; rules: Record<string, number> };
  customer: typeof schema.customers.$inferInsert;
  profile: typeof schema.profiles.$inferInsert;
  conversation: typeof schema.conversations.$inferInsert;
  messages: Array<typeof schema.messages.$inferInsert>;
  documents: Array<typeof schema.documents.$inferInsert>;
  extractions: Array<typeof schema.extractions.$inferInsert>;
  profileEvents: Array<typeof schema.profileEvents.$inferInsert>;
  policies: Array<typeof schema.policies.$inferInsert>;
  calculations: Array<typeof schema.calculations.$inferInsert>;
  recommendations: Array<typeof schema.recommendations.$inferInsert>;
  analyses: Array<typeof schema.analyses.$inferInsert>;
  auditLog: Array<typeof schema.auditLog.$inferInsert>;
}

// Day offsets for a seed run in early November 2026: check-in early December 2025, Pax's e-mail
// about the child in late August 2026 and Jane's reply two days later. The birth is due in
// December 2026, a month after the demo.
const CHECKIN_DAYS_AGO = 330;
const OUTREACH_DAYS_AGO = 73;
const OUTREACH_REPLY_DAYS_AGO = 71;
const EXPECTED_DAYS_AHEAD = 40;

const lastCheckin: NonNullable<SeedPersona["lastCheckin"]> = {
  daysAgo: CHECKIN_DAYS_AGO,
  subject: "Ihr jährlicher Vorsorge-Check: Hat sich etwas verändert?",
  body: "Grüezi Frau Müller\n\nVor gut einem Jahr haben wir zusammen Ihre Vorsorge angeschaut. Hat sich bei Ihnen oder May etwas verändert, zum Beispiel in der Familie, bei der Arbeit oder beim Lohn? Sie hatten damals erwähnt, dass Sie sich Kinder wünschen. Antworten Sie einfach auf diese E-Mail oder schreiben Sie Clara im Chat.\n\nDiese jährliche E-Mail können Sie in Ihrem Vorsorge-Cockpit jederzeit abschalten.\n\nFreundliche Grüsse\nIhr Pax-Team",
  reply:
    "Grüezi, danke der Nachfrage. Bei uns ist alles beim Alten. Wir wünschen uns aber nach wie vor ein Kind, vielleicht klappt es nächstes Jahr. Freundliche Grüsse, Jane Müller",
};

const babyOutreach = {
  subject: "Ihre Vorsorge, wenn Sie Familie planen",
  body: "Grüezi Frau Müller\n\nIm Dezember haben Sie uns geschrieben, dass Sie sich ein Kind wünschen. Darum melden wir uns heute kurz.\n\nMit einem Kind ändert sich Ihre Vorsorge. Im Herbst 2024 hat Clara gezeigt, dass Ihnen Geld fehlt, wenn May wegen Krankheit nicht mehr arbeiten kann. Mit Kind, und wenn sich Ihr Pensum ändert, sieht diese Rechnung anders aus. Wenn es bei Ihnen so weit ist, schreiben Sie Clara im Chat oder antworten Sie auf diese E-Mail. Dann rechnen wir Ihre Absicherung neu.\n\nFreundliche Grüsse\nIhr Pax-Team",
  reply:
    "Danke für die Nachricht, sie kommt genau richtig: Wir erwarten unser erstes Kind im Dezember! Nach der Geburt bleibe ich zu Hause. Ich melde mich bei Clara, damit wir alles neu rechnen. Liebe Grüsse, Jane Müller",
};

/** Pax's e-mail about the child Jane hoped for, her answer and the birth it announces. */
function insertBabyOutreach(db: Db, customerId: string): void {
  const [event] = db
    .insert(schema.futureEvents)
    .values({
      customerId,
      kind: "child_birth",
      subject: "Erstes Kind",
      expectedDate: `${day(-EXPECTED_DAYS_AHEAD).slice(0, 7)}-01`,
      precision: "month",
      confidence: 0.9,
      sourceQuote: "Wir erwarten unser erstes Kind im Dezember!",
      note: "Geburt des ersten Kindes, Jane hört danach auf zu arbeiten: Absicherung bei Tod und Erwerbsunfähigkeit von May neu rechnen.",
      status: "responded",
      createdAt: stamp(OUTREACH_REPLY_DAYS_AGO, 19),
      updatedAt: stamp(OUTREACH_REPLY_DAYS_AGO, 19),
    })
    .returning()
    .all();
  const sentAt = stamp(OUTREACH_DAYS_AGO, 7);
  const repliedAt = stamp(OUTREACH_REPLY_DAYS_AGO, 19);
  const [outbox] = db
    .insert(schema.outboxEmails)
    .values({
      customerId,
      kind: "event_follow_up",
      futureEventId: event.id,
      sequence: 1,
      toAddress: EMAIL,
      locale: "de",
      subject: babyOutreach.subject,
      body: babyOutreach.body,
      sentOn: day(OUTREACH_DAYS_AGO),
      repliedAt,
      model: "seed",
      createdAt: sentAt,
    })
    .returning()
    .all();
  db.insert(schema.auditLog)
    .values([
      {
        actorType: "system",
        action: "email.sent",
        entityType: "customer",
        entityId: customerId,
        data: {
          subject: babyOutreach.subject,
          body: babyOutreach.body,
          to: EMAIL,
          direction: "outbound",
          outboxId: outbox.id,
          sequence: 1,
          sentOn: day(OUTREACH_DAYS_AGO),
          kind: "event_follow_up",
        },
        createdAt: sentAt,
      },
      {
        actorType: "customer",
        actorId: customerId,
        action: "email.received",
        entityType: "customer",
        entityId: customerId,
        data: {
          subject: `AW: ${babyOutreach.subject}`,
          body: babyOutreach.reply,
          direction: "inbound",
        },
        createdAt: repliedAt,
      },
    ])
    .run();
}

/** Reads the recording with fresh ids, the seeded rules and dates relative to `start`. */
function loadFixture(db: Db, start: Date): Fixture {
  const raw = readFileSync(path.join(__dirname, "fixtures", "mueller-2024-chat.json"), "utf8");
  const { refs } = JSON.parse(raw) as Pick<Fixture, "refs">;
  const ruleSet = db.select().from(schema.ruleSets).where(eq(schema.ruleSets.isActive, true)).get();
  if (!ruleSet) throw new Error("No active rule set: run the main seed first");
  const rules = db
    .select({ id: schema.rules.id })
    .from(schema.rules)
    .where(eq(schema.rules.ruleSetId, ruleSet.id))
    .orderBy(asc(schema.rules.position))
    .all();
  const ids = new Map<string, string>([[refs.ruleSet, ruleSet.id]]);
  for (const [id, position] of Object.entries(refs.rules)) ids.set(id, rules[position].id);
  const fresh = raw.replace(UUID, (id) => {
    if (!ids.has(id)) ids.set(id, crypto.randomUUID());
    return ids.get(id) as string;
  });
  return JSON.parse(fresh, (_key, value) =>
    value && typeof value === "object" && "$at" in value
      ? new Date(start.getTime() + value.$at)
      : value,
  );
}

/** Returns 1 if the family was seeded, 0 if Jane already exists. */
export function seedMueller(db: Db): number {
  if (db.select().from(schema.customers).where(eq(schema.customers.email, EMAIL)).get()) return 0;
  const start = stamp(FIRST_CHAT_DAYS_AGO, FIRST_CHAT_HOUR);
  const f = loadFixture(db, start);
  const key = parseEncryptionKey(process.env.DOCUMENT_ENCRYPTION_KEY ?? "");
  const dataDir = process.env.DATA_DIR ?? "./data";

  db.transaction((tx) => {
    const [customer] = tx
      .insert(schema.customers)
      .values({
        ...f.customer,
        phone: "+41 79 000 00 01",
        birthDate: "1986-06-01",
        isDemo: true,
        createdAt: start,
        updatedAt: start,
      })
      .returning()
      .all();
    tx.insert(schema.conversations).values(f.conversation).run();
    tx.insert(schema.messages).values(f.messages).run();
    for (const doc of f.documents) {
      const pdf = readFileSync(path.join(process.cwd(), "public", "samples", doc.filename));
      const file = path.join(dataDir, doc.storagePath);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, encryptBuffer(pdf, key, doc.id as string), { mode: 0o600 });
    }
    tx.insert(schema.documents).values(f.documents).run();
    tx.insert(schema.extractions).values(f.extractions).run();
    tx.insert(schema.profiles).values(f.profile).run();
    tx.insert(schema.profileEvents).values(f.profileEvents).run();
    tx.insert(schema.policies).values(f.policies).run();
    tx.insert(schema.calculations).values(f.calculations).run();
    tx.insert(schema.recommendations).values(f.recommendations).run();
    tx.insert(schema.analyses).values(f.analyses).run();
    tx.insert(schema.auditLog).values(f.auditLog).run();
    tx.insert(schema.feedback)
      .values({
        conversationId: f.conversation.id as string,
        customerId: customer.id,
        nps: 9,
        comment: "Endlich verstehe ich unseren Vorsorgeausweis.",
        createdAt: f.conversation.lastMessageAt ?? start,
      })
      .run();
    insertCheckin(tx, { customerId: customer.id, email: EMAIL, locale: "de" }, lastCheckin);
    insertBabyOutreach(tx, customer.id);
  });
  return 1;
}

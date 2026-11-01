/**
 * Demo data for Wiedervorlagen: one earlier advisor conversation per demo customer in which they
 * announced a life event, plus the extracted future event. Dates are relative to the day the seed
 * runs and go through the real date normaliser, so the time-travel demo always works.
 */
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";
import { addDays, toIsoDate } from "@/lib/documents/dates";
import type { FutureEventKind } from "@/lib/followups/taxonomy";
import { resolveExpression } from "@/lib/followups/timing";

interface SeedConversation {
  email: string;
  daysAgo: number;
  title: string;
  user: string;
  assistant: string;
  event: {
    kind: FutureEventKind;
    subject: string | null;
    expression: string;
    note: string;
    confidence: number;
  };
}

const conversations: SeedConversation[] = [
  {
    email: "taylor.johnson@example.ch",
    daysAgo: 52,
    title: "3a-Bezug für Wohnungskauf",
    user: "Wir möchten nächsten Sommer eine Wohnung in Zürich kaufen. Kann ich dafür mein 3a-Guthaben brauchen?",
    assistant:
      "Ja, für selbst bewohntes Wohneigentum können Sie Ihr 3a-Guthaben vorbeziehen. Wenn es konkret wird, rechnen wir gerne zusammen durch, was das für Ihre Vorsorge bedeutet.",
    event: {
      kind: "home_purchase",
      subject: null,
      expression: "nächsten Sommer",
      note: "Kauf einer Eigentumswohnung in Zürich, 3a-Vorbezug geplant.",
      confidence: 0.8,
    },
  },
  {
    email: "lily.smith@example.ch",
    daysAgo: 40,
    title: "Pensionierung des Ehemanns",
    user: "Mein Mann Wilson wird Ende nächsten Jahres pensioniert. Wir überlegen noch, ob er Kapital oder Rente nimmt.",
    assistant:
      "Das ist eine wichtige Entscheidung. Gerne schauen wir uns vor der Pensionierung beide Varianten mit Ihren Zahlen an.",
    event: {
      kind: "retirement",
      subject: "Ehemann Wilson",
      expression: "Ende nächsten Jahres",
      note: "Pensionierung von Wilson; Entscheid Kapital oder Rente offen.",
      confidence: 0.9,
    },
  },
];

export function seedFollowUps(db: BetterSQLite3Database<typeof schema>): number {
  const today = toIsoDate(new Date());
  let count = 0;
  for (const seed of conversations) {
    const customer = db
      .select({ id: schema.customers.id })
      .from(schema.customers)
      .where(eq(schema.customers.email, seed.email))
      .get();
    if (!customer) continue;
    const day = addDays(today, -seed.daysAgo);
    const at = (minutes: number) => new Date(`${day}T09:${String(minutes).padStart(2, "0")}:00Z`);
    const [conversation] = db
      .insert(schema.conversations)
      .values({
        customerId: customer.id,
        mode: "existing_customer",
        status: "completed",
        stage: "getting_to_know",
        title: seed.title,
        messageCount: 2,
        createdAt: at(0),
        lastMessageAt: at(2),
      })
      .returning()
      .all();
    db.insert(schema.messages)
      .values([
        {
          id: crypto.randomUUID(),
          conversationId: conversation.id,
          role: "user",
          parts: [{ type: "text", text: seed.user }],
          inputMode: "text",
          createdAt: at(1),
        },
        {
          id: crypto.randomUUID(),
          conversationId: conversation.id,
          role: "assistant",
          parts: [{ type: "text", text: seed.assistant }],
          createdAt: at(2),
        },
      ])
      .run();
    const resolved = resolveExpression(seed.event.expression, null, day);
    if (!resolved) continue;
    db.insert(schema.futureEvents)
      .values({
        customerId: customer.id,
        conversationId: conversation.id,
        kind: seed.event.kind,
        subject: seed.event.subject,
        expectedDate: resolved.date,
        precision: resolved.precision,
        confidence: seed.event.confidence,
        sourceQuote: seed.user,
        note: seed.event.note,
      })
      .run();
    count++;
  }
  return count;
}

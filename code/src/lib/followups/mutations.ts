import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { db, schema } from "@/lib/db";

/** Demo: the customer answered a follow-up email. Returns the customer id, or null. */
export function markEmailReplied(emailId: string, advisorId: string): string | null {
  const email = db
    .select({ customerId: schema.outboxEmails.customerId })
    .from(schema.outboxEmails)
    .where(and(eq(schema.outboxEmails.id, emailId), isNull(schema.outboxEmails.repliedAt)))
    .get();
  if (!email) return null;
  db.update(schema.outboxEmails)
    .set({ repliedAt: new Date() })
    .where(eq(schema.outboxEmails.id, emailId))
    .run();
  audit({
    actorType: "advisor",
    actorId: advisorId,
    action: "outbox.reply_recorded",
    entityType: "outbox_email",
    entityId: emailId,
  });
  return email.customerId;
}

/** An advisor closes a future event that no longer applies (it will not be followed up). */
export function dismissFutureEvent(eventId: string, advisorId: string): void {
  db.update(schema.futureEvents)
    .set({ status: "dismissed" })
    .where(eq(schema.futureEvents.id, eventId))
    .run();
  audit({
    actorType: "advisor",
    actorId: advisorId,
    action: "future_event.dismissed",
    entityType: "future_event",
    entityId: eventId,
  });
}

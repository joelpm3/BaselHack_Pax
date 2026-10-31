import "server-only";
import { eq } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { db, schema } from "@/lib/db";
import type { ActorType } from "@/lib/domain/taxonomy";

/** Yearly check-in is on by default; a customer (or an advisor on their behalf) can opt out. */
export function isYearlyCheckinEnabled(customerId: string): boolean {
  const row = db
    .select({ yearlyCheckin: schema.contactPreferences.yearlyCheckin })
    .from(schema.contactPreferences)
    .where(eq(schema.contactPreferences.customerId, customerId))
    .get();
  return row?.yearlyCheckin ?? true;
}

export function setYearlyCheckin(
  customerId: string,
  enabled: boolean,
  actor: { type: ActorType; id?: string | null },
): void {
  db.insert(schema.contactPreferences)
    .values({ customerId, yearlyCheckin: enabled, updatedBy: actor.type })
    .onConflictDoUpdate({
      target: schema.contactPreferences.customerId,
      set: { yearlyCheckin: enabled, updatedBy: actor.type, updatedAt: new Date() },
    })
    .run();
  audit({
    actorType: actor.type,
    actorId: actor.id ?? null,
    action: enabled ? "checkin.opted_in" : "checkin.opted_out",
    entityType: "customer",
    entityId: customerId,
  });
}

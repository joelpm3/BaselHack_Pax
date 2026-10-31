import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { LIFE_AND_PENSION_CATEGORIES, type PolicyCategory } from "@/lib/domain/taxonomy";

/**
 * Active life and pension policies of the customer (Pax and other insurers). A policy whose end
 * date has passed (e.g. cancelled as of the end of last year) no longer counts.
 */
export function activeLifePolicies(customerId: string) {
  const today = new Date().toISOString().slice(0, 10);
  return db
    .select()
    .from(schema.policies)
    .where(
      and(
        eq(schema.policies.customerId, customerId),
        eq(schema.policies.status, "active"),
        inArray(schema.policies.category, LIFE_AND_PENSION_CATEGORIES as PolicyCategory[]),
      ),
    )
    .all()
    .filter((p) => !p.endDate || p.endDate >= today);
}

/**
 * The customer's 3a policies including ended ones: the stated 3a contribution may still count
 * the premium of a policy that ended, which must not turn into bank 3a saving after its end.
 */
export function pillar3aPolicies(customerId: string) {
  return db
    .select()
    .from(schema.policies)
    .where(
      and(
        eq(schema.policies.customerId, customerId),
        eq(schema.policies.status, "active"),
        eq(schema.policies.category, "pillar3a"),
      ),
    )
    .all();
}

/** True when the household has an active death or disability policy on file. */
export function hasRiskPolicies(customerId: string): boolean {
  return activeLifePolicies(customerId).some(
    (p) => p.category === "risk_death" || p.category === "risk_disability",
  );
}

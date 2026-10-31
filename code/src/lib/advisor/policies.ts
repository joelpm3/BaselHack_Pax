import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { LifeSituation } from "@/lib/domain/profile";
import { LIFE_AND_PENSION_CATEGORIES, type PolicyCategory } from "@/lib/domain/taxonomy";
import { policyCoverFor } from "./policy-cover";
import type { PolicyCover } from "./types";

/** Active life and pension policies of the customer (Pax and other insurers). */
export function activeLifePolicies(customerId: string) {
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
    .all();
}

/** Death and disability cover from the household's policies, per person. */
export function policyCoverOf(
  customerId: string,
  profile: LifeSituation,
  year: number,
): PolicyCover[] {
  return policyCoverFor(activeLifePolicies(customerId), profile, year);
}

import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { LifeSituation } from "@/lib/domain/profile";
import type { Locale } from "@/lib/domain/taxonomy";
import { type StatedPolicy, statedPolicyRow } from "./stated-policy-row";

/**
 * Death and disability policies the customer mentions in the chat ("wir haben beide eine
 * Todesfallversicherung bei der AXA"). They are stored as policies (source "chat") so the risk
 * analysis counts them like any other policy. Telling the same policy again updates it.
 */
export function saveStatedPolicies(
  customerId: string,
  stated: StatedPolicy[],
  profile: LifeSituation,
  locale: Locale,
): string[] {
  const existing = db
    .select()
    .from(schema.policies)
    .where(
      and(
        eq(schema.policies.customerId, customerId),
        eq(schema.policies.source, "chat"),
        inArray(schema.policies.category, ["risk_death", "risk_disability"]),
      ),
    )
    .all();
  const summaries: string[] = [];
  for (const policy of stated) {
    const { summary, ...row } = statedPolicyRow(policy, profile, locale);
    const same = existing.find(
      (p) =>
        p.category === row.category &&
        p.details?.subject === policy.insured &&
        p.insurer.toLowerCase() === row.insurer.toLowerCase(),
    );
    if (same) {
      db.update(schema.policies)
        .set({
          sumInsured: row.sumInsured ?? same.sumInsured,
          annuityAnnual: row.annuityAnnual ?? same.annuityAnnual,
          premiumAnnual: row.premiumAnnual ?? same.premiumAnnual,
          endDate: row.endDate ?? same.endDate,
          status: "active",
        })
        .where(eq(schema.policies.id, same.id))
        .run();
    } else {
      db.insert(schema.policies)
        .values({ ...row, customerId })
        .run();
    }
    summaries.push(summary);
  }
  return summaries;
}

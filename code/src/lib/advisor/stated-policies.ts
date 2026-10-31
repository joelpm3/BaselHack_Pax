import "server-only";
import { and, eq, inArray, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { LifeSituation } from "@/lib/domain/profile";
import type { Locale } from "@/lib/domain/taxonomy";
import { endNote, type StatedPolicy, statedPolicyRow } from "./stated-policy-row";

/**
 * Policies the customer mentions in the chat ("wir haben beide eine Todesfallversicherung bei
 * der AXA", "eine 3a-Versicherung, Versicherer weiss ich nicht"). They are stored as policies
 * (source "chat") so the risk analysis, the pension overview and the cockpit count them like
 * any other policy. Telling the same policy again updates it.
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
        inArray(schema.policies.category, ["risk_death", "risk_disability", "pillar3a"]),
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
        (p.insurer.toLowerCase() === row.insurer.toLowerCase() ||
          (p.details?.insurerUnknown === true && row.details.insurerUnknown === true)),
    );
    if (same) {
      db.update(schema.policies)
        .set({
          sumInsured: row.sumInsured ?? same.sumInsured,
          annuityAnnual: row.annuityAnnual ?? same.annuityAnnual,
          premiumAnnual: row.premiumAnnual ?? same.premiumAnnual,
          endDate: row.endDate ?? same.endDate,
          details: { ...same.details, ...row.details },
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

export interface PolicyEnd {
  policy: string;
  endDate: string;
  cancelled?: boolean;
}

/**
 * Records that a policy on file ends (notice given, or a known end date). The policy stays
 * active until then: its premiums count for the 3a room of the years it still runs and its
 * cover until the end date. Returns a summary line per policy it found.
 */
export function endPolicies(customerId: string, ends: PolicyEnd[], locale: Locale): string[] {
  const done: string[] = [];
  for (const end of ends) {
    const ref = end.policy.trim();
    const row = db
      .select()
      .from(schema.policies)
      .where(
        and(
          eq(schema.policies.customerId, customerId),
          or(eq(schema.policies.id, ref), eq(schema.policies.policyNumber, ref)),
        ),
      )
      .get();
    if (!row) continue;
    db.update(schema.policies)
      .set({
        endDate: end.endDate,
        details: { ...row.details, ...(end.cancelled ? { cancelled: true } : {}) },
      })
      .where(eq(schema.policies.id, row.id))
      .run();
    done.push(`${row.insurer}: ${row.productName}, ${endNote(locale, end.endDate, end.cancelled)}`);
  }
  return done;
}

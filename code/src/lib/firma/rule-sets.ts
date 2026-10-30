import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { PRODUCT_CODES } from "@/lib/domain/products";
import { RULE_ACTIONS } from "@/lib/domain/taxonomy";

/**
 * Company rules are never edited in place: saving creates a new, active rule-set version and
 * keeps every old one, so each conversation, analysis and recommendation can point at the exact
 * rules it was judged against (`ruleSetId`).
 */
export const ruleDraftSchema = z
  .object({
    text: z.string().trim().min(3).max(1000),
    action: z.enum(RULE_ACTIONS),
    productCode: z.enum(PRODUCT_CODES).nullable(),
    active: z.boolean(),
  })
  .refine((r) => r.action !== "block_product" || r.productCode !== null, {
    message: "block_product needs a product",
    path: ["productCode"],
  })
  .transform((r) => ({ ...r, productCode: r.action === "block_product" ? r.productCode : null }));

export const ruleSetDraftSchema = z.object({
  leadHints: z.string().trim().max(4000),
  rules: z.array(ruleDraftSchema).max(50),
});
export type RuleSetDraft = z.infer<typeof ruleSetDraftSchema>;
export type RuleDraft = RuleSetDraft["rules"][number];

/** True when saving `draft` would not change anything compared to `current`. */
export function isSameRuleSet(current: RuleSetDraft, draft: RuleSetDraft): boolean {
  return JSON.stringify(current) === JSON.stringify(draft);
}

/** The editable shape of a stored version (rules in position order). */
export function draftFromVersion(db: Db, ruleSetId: string): RuleSetDraft | null {
  const set = db.select().from(schema.ruleSets).where(eq(schema.ruleSets.id, ruleSetId)).get();
  if (!set) return null;
  const rules = db
    .select()
    .from(schema.rules)
    .where(eq(schema.rules.ruleSetId, ruleSetId))
    .orderBy(asc(schema.rules.position))
    .all();
  return {
    leadHints: set.leadHints,
    rules: rules.map((r) => ({
      text: r.text,
      action: r.action,
      productCode: r.productCode,
      active: r.active,
    })),
  };
}

/** Stores `draft` as version n+1, activates it and deactivates all others, atomically. */
export function createRuleSetVersion(
  db: Db,
  draft: RuleSetDraft,
  advisorId: string | null,
): { id: string; version: number } {
  return db.transaction((tx) => {
    const latest = tx
      .select({ version: schema.ruleSets.version })
      .from(schema.ruleSets)
      .orderBy(desc(schema.ruleSets.version))
      .limit(1)
      .get();
    const version = (latest?.version ?? 0) + 1;
    tx.update(schema.ruleSets).set({ isActive: false }).run();
    const created = tx
      .insert(schema.ruleSets)
      .values({
        version,
        leadHints: draft.leadHints,
        isActive: true,
        createdByAdvisorId: advisorId,
      })
      .returning({ id: schema.ruleSets.id })
      .get();
    if (draft.rules.length > 0) {
      tx.insert(schema.rules)
        .values(draft.rules.map((rule, position) => ({ ...rule, ruleSetId: created.id, position })))
        .run();
    }
    return { id: created.id, version };
  });
}

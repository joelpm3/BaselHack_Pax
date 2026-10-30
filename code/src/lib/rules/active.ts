import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export type Rule = typeof schema.rules.$inferSelect;
export interface ActiveRuleSet {
  id: string;
  version: number;
  leadHints: string;
  rules: Rule[];
}

/**
 * The company's current natural-language rules (edited in /firma/regeln). The advisor prompt
 * and the classifier both read this; conversations store `ruleSetId` for auditability.
 */
export function getActiveRuleSet(): ActiveRuleSet {
  const set = db.query.ruleSets.findFirst({ where: eq(schema.ruleSets.isActive, true) }).sync();
  if (!set) throw new Error("No active rule set. Run `pnpm db:seed`.");
  const rules = db
    .select()
    .from(schema.rules)
    .where(eq(schema.rules.ruleSetId, set.id))
    .orderBy(asc(schema.rules.position))
    .all();
  return { id: set.id, version: set.version, leadHints: set.leadHints, rules };
}

/** Rules rendered for a system prompt, with ids so the model can cite them. */
export function formatRulesForPrompt(ruleSet: ActiveRuleSet): string {
  const active = ruleSet.rules.filter((r) => r.active);
  if (active.length === 0) return "(no rules)";
  return active
    .map((r) => `- [${r.id}] (${r.action}${r.productCode ? `:${r.productCode}` : ""}) ${r.text}`)
    .join("\n");
}

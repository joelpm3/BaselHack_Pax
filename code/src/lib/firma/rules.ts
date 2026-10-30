import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { draftFromVersion } from "./rule-sets";

export function listRuleSetVersions() {
  return db
    .select({
      id: schema.ruleSets.id,
      version: schema.ruleSets.version,
      isActive: schema.ruleSets.isActive,
      createdAt: schema.ruleSets.createdAt,
      createdBy: schema.advisors.name,
      ruleCount: sql<number>`(select count(*) from ${schema.rules} r where r.rule_set_id = ${schema.ruleSets.id})`,
      conversationCount: sql<number>`(select count(*) from ${schema.conversations} cv where cv.rule_set_id = ${schema.ruleSets.id})`,
    })
    .from(schema.ruleSets)
    .leftJoin(schema.advisors, eq(schema.advisors.id, schema.ruleSets.createdByAdvisorId))
    .orderBy(desc(schema.ruleSets.version))
    .all();
}

/** The version to show: `?version=n` if it exists, otherwise the active one. */
export function getRuleSetForEditor(version: number | null) {
  const versions = listRuleSetVersions();
  const selected =
    (version !== null && versions.find((v) => v.version === version)) ||
    versions.find((v) => v.isActive) ||
    versions[0];
  if (!selected) return null;
  const draft = draftFromVersion(db, selected.id);
  if (!draft) return null;
  return { versions, selected, draft };
}

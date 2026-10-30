import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import {
  createRuleSetVersion,
  draftFromVersion,
  isSameRuleSet,
  type RuleSetDraft,
  ruleSetDraftSchema,
} from "./rule-sets";

function memoryDb(): Db {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(import.meta.dirname, "../../../drizzle") });
  return db;
}

const v1: RuleSetDraft = ruleSetDraftSchema.parse({
  leadHints: "Familien mit Lücke",
  rules: [
    {
      text: "Vermögen über CHF 300'000: Fachperson.",
      action: "handover",
      productCode: null,
      active: true,
    },
    {
      text: "Keine Kinderversicherung bei Lücke der Eltern.",
      action: "block_product",
      productCode: "kinderversicherung",
      active: true,
    },
  ],
});

describe("rule-set versioning", () => {
  let db: Db;
  beforeEach(() => {
    db = memoryDb();
  });

  it("creates the first version as active", () => {
    const created = createRuleSetVersion(db, v1, null);
    expect(created.version).toBe(1);
    const sets = db.select().from(schema.ruleSets).all();
    expect(sets).toHaveLength(1);
    expect(sets[0].isActive).toBe(true);
    expect(draftFromVersion(db, created.id)).toEqual(v1);
  });

  it("keeps old versions untouched and activates only the newest", () => {
    const first = createRuleSetVersion(db, v1, null);
    const firstRuleIds = db
      .select({ id: schema.rules.id })
      .from(schema.rules)
      .all()
      .map((r) => r.id);

    const edited: RuleSetDraft = {
      leadHints: "Neu",
      rules: [
        { ...v1.rules[1], active: false },
        {
          text: "Explicit wish for a human: call back.",
          action: "handover",
          productCode: null,
          active: true,
        },
      ],
    };
    const second = createRuleSetVersion(db, edited, null);
    expect(second.version).toBe(2);

    const sets = db.select().from(schema.ruleSets).all();
    expect(sets.filter((s) => s.isActive).map((s) => s.id)).toEqual([second.id]);
    // Old rows still exist (handovers cite rule ids from older versions).
    expect(draftFromVersion(db, first.id)).toEqual(v1);
    const allRuleIds = db.select({ id: schema.rules.id }).from(schema.rules).all();
    expect(allRuleIds).toHaveLength(4);
    expect(firstRuleIds.every((id) => allRuleIds.some((r) => r.id === id))).toBe(true);
    // Position follows the draft order.
    expect(draftFromVersion(db, second.id)?.rules.map((r) => r.text)).toEqual(
      edited.rules.map((r) => r.text),
    );
  });

  it("validates drafts: block_product needs a product, other actions drop it", () => {
    expect(
      ruleSetDraftSchema.safeParse({
        leadHints: "",
        rules: [{ text: "Blockieren", action: "block_product", productCode: null, active: true }],
      }).success,
    ).toBe(false);
    const parsed = ruleSetDraftSchema.parse({
      leadHints: " x ",
      rules: [{ text: "  Markieren  ", action: "flag", productCode: "lifestar", active: true }],
    });
    expect(parsed).toEqual({
      leadHints: "x",
      rules: [{ text: "Markieren", action: "flag", productCode: null, active: true }],
    });
  });

  it("detects no-op saves", () => {
    expect(isSameRuleSet(v1, structuredClone(v1))).toBe(true);
    expect(isSameRuleSet(v1, { ...v1, leadHints: "anders" })).toBe(false);
  });
});

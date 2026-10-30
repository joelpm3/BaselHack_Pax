import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import {
  emptyLifeSituation,
  type LifeSituation,
  lifeSituationSchema,
  profileCompleteness,
} from "@/lib/domain/profile";
import type { DataSource } from "@/lib/domain/taxonomy";
import { publish } from "@/lib/events/bus";

export interface ProfileChange {
  /** Dot path into LifeSituation, e.g. `person.grossIncome`, `children`, `pillar2.insuredSalary`. */
  path: string;
  value: unknown;
}

export interface ChangeMeta {
  source: DataSource;
  conversationId?: string;
  messageId?: string;
  documentId?: string;
}

export function getProfile(customerId: string): LifeSituation {
  const row = db.query.profiles
    .findFirst({ where: eq(schema.profiles.customerId, customerId) })
    .sync();
  return row ? lifeSituationSchema.parse(row.data) : emptyLifeSituation();
}

function getAt(obj: Record<string, unknown>, path: string[]): unknown {
  return path.reduce<unknown>(
    (cur, key) =>
      cur && typeof cur === "object" ? (cur as Record<string, unknown>)[key] : undefined,
    obj,
  );
}

function setAt(obj: Record<string, unknown>, path: string[], value: unknown): void {
  let cur = obj;
  for (const key of path.slice(0, -1)) {
    if (typeof cur[key] !== "object" || cur[key] === null) cur[key] = {};
    cur = cur[key] as Record<string, unknown>;
  }
  const last = path[path.length - 1];
  if (value === null || value === undefined) delete cur[last];
  else cur[last] = value;
}

/**
 * Applies changes, validates the whole profile, stores it and logs one profile_event per
 * changed path. Throws a ZodError (nothing written) if the result is invalid.
 */
export function applyProfileChanges(
  customerId: string,
  changes: ProfileChange[],
  meta: ChangeMeta,
): LifeSituation {
  return db.transaction((tx) => {
    const row = tx.query.profiles
      .findFirst({ where: eq(schema.profiles.customerId, customerId) })
      .sync();
    const current = row ? lifeSituationSchema.parse(row.data) : emptyLifeSituation();
    const draft = structuredClone(current) as unknown as Record<string, unknown>;
    const effective: Array<ProfileChange & { oldValue: unknown }> = [];
    for (const change of changes) {
      const path = change.path.split(".");
      const oldValue = getAt(draft, path);
      if (JSON.stringify(oldValue) === JSON.stringify(change.value)) continue;
      setAt(draft, path, change.value);
      effective.push({ ...change, oldValue });
    }
    const next = lifeSituationSchema.parse(draft);
    if (effective.length === 0) return next;

    const completeness = profileCompleteness(next);
    if (row) {
      tx.update(schema.profiles)
        .set({ data: next, completeness })
        .where(eq(schema.profiles.customerId, customerId))
        .run();
    } else {
      tx.insert(schema.profiles).values({ customerId, data: next, completeness }).run();
    }
    tx.insert(schema.profileEvents)
      .values(
        effective.map((c) => ({
          customerId,
          conversationId: meta.conversationId,
          messageId: meta.messageId,
          documentId: meta.documentId,
          path: c.path,
          oldValue: c.oldValue ?? null,
          newValue: c.value ?? null,
          source: meta.source,
        })),
      )
      .run();
    if (meta.conversationId)
      publish({ type: "conversation.updated", conversationId: meta.conversationId });
    return next;
  });
}

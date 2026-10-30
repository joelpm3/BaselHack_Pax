import "server-only";
import { eq, type SQL, sql } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { schema } from "@/lib/db";
import type { Scope } from "./aggregate";

/** WHERE fragment for real/simulated filtering on an `is_simulated` column. */
export function scopeWhere(column: SQLiteColumn, scope: Scope): SQL | undefined {
  if (scope === "real") return eq(column, false);
  if (scope === "simulated") return eq(column, true);
  return undefined;
}

/** Same filter as raw SQL for hand-written queries (always a valid boolean expression). */
export function scopeSql(column: SQLiteColumn, scope: Scope): SQL {
  if (scope === "real") return sql`${column} = 0`;
  if (scope === "simulated") return sql`${column} = 1`;
  return sql`1 = 1`;
}

/** Columns that identify a customer on every dashboard list. */
export const customerColumns = {
  customerId: schema.customers.id,
  firstName: schema.customers.firstName,
  lastName: schema.customers.lastName,
  lifecycle: schema.customers.lifecycle,
  city: sql<string | null>`json_extract(${schema.profiles.data}, '$.residence.city')`,
};

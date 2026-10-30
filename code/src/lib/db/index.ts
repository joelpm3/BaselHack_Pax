import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { env } from "@/env";
import * as schema from "./schema";

function open() {
  mkdirSync(env.DATA_DIR, { recursive: true });
  const sqlite = new Database(path.join(env.DATA_DIR, "pax.db"));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db;
}

export type Db = ReturnType<typeof open>;

// One connection per server process; survives dev hot reloads.
const globalForDb = globalThis as unknown as { paxDb?: Db };
export const db: Db = globalForDb.paxDb ?? open();
globalForDb.paxDb = db;

export { schema };

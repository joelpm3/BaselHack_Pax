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

/**
 * Opened (and migrated) on first use rather than at import: `next build` imports every route
 * module in its page-data workers, and must neither need the runtime env nor open and migrate
 * the database a running server is using. Methods run with `this` = the proxy, whose reads
 * forward to the real instance, so drizzle's entity checks and query builders work unchanged.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, key) {
    globalForDb.paxDb ??= open();
    return Reflect.get(globalForDb.paxDb, key);
  },
  has(_target, key) {
    globalForDb.paxDb ??= open();
    return Reflect.has(globalForDb.paxDb, key);
  },
});

export { schema };

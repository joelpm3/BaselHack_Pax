import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll } from "vitest";

// Runs before each test file: a file that imports `@/lib/db` gets its own migrated SQLite
// database in a temp dir, never the dev database in ./data.
const dataDir = mkdtempSync(path.join(tmpdir(), "pax-test-"));
process.env.DATA_DIR = dataDir;
process.env.COMPANY_PASSWORD = "test-password";
process.env.SESSION_SECRET = "test-session-secret-0123456789abcdef";
process.env.DOCUMENT_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";

afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

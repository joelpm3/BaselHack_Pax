/**
 * Starts the app for the browser tests: a fresh database in E2E data dir, seeded with the demo
 * customers, then `next build` (skip with E2E_SKIP_BUILD=1 when nothing changed) and
 * `next start` on the test port. Playwright passes the test environment (playwright.config.ts).
 */
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { rmSync } from "node:fs";

const dataDir = process.env.DATA_DIR;
const port = process.env.PORT;
if (!dataDir || !dataDir.includes("e2e")) throw new Error("DATA_DIR must be the e2e data dir");
if (!port || port === "3210") throw new Error("PORT must be the e2e port, never the live demo");

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

rmSync(dataDir, { recursive: true, force: true });
run("pnpm", ["exec", "tsx", "scripts/seed.ts"]);
if (process.env.E2E_SKIP_BUILD !== "1") run("pnpm", ["exec", "next", "build"]);

const server: ChildProcess = spawn("pnpm", ["exec", "next", "start", "-p", port], {
  stdio: "inherit",
  env: process.env,
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    server.kill(signal);
  });
server.on("exit", (code) => process.exit(code ?? 0));

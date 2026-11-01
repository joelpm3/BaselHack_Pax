import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests: the five official personas from first message to policy in the portal, with
 * scripted model answers and recorded Logismata/Quicksale responses (see e2e/servers). Needs no
 * API key. Runs its own build (.next-e2e), database (.e2e-data) and port, never the live demo.
 *   pnpm test:e2e                  (E2E_SKIP_BUILD=1 reuses the last e2e build)
 */
const APP_PORT = Number(process.env.E2E_PORT ?? 3240);
const LLM_PORT = Number(process.env.E2E_LLM_PORT ?? 3241);
const FIXTURE_PORT = Number(process.env.E2E_FIXTURE_PORT ?? 3242);
const baseURL = `http://localhost:${APP_PORT}`;

/** Every variable the app reads, so nothing comes from .env.local (process env wins in Next). */
const appEnv = {
  PORT: String(APP_PORT),
  NEXT_DIST_DIR: ".next-e2e",
  DATA_DIR: ".e2e-data",
  LLM_PROVIDER: "openai-compatible",
  LLM_BASE_URL: `http://127.0.0.1:${LLM_PORT}/v1`,
  LLM_API_KEY: "e2e",
  LLM_MODEL: "e2e-background",
  LLM_MODEL_CHAT: "e2e-chat",
  ANTHROPIC_API_KEY: "",
  LOGISMATA_API_BASE: `http://127.0.0.1:${FIXTURE_PORT}/logismata`,
  LOGISMATA_API_TOKEN: "e2e-fixtures",
  QUICKSALE_BASE_URL: `http://127.0.0.1:${FIXTURE_PORT}/quicksale`,
  STT_BASE_URL: "http://127.0.0.1:9",
  COMPANY_PASSWORD: "e2e-password",
  SESSION_SECRET: "e2e-session-secret-0123456789abcdef0123456789",
  DOCUMENT_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
};

export default defineConfig({
  testDir: "./e2e/specs",
  fullyParallel: true,
  workers: 5,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  outputDir: "./.e2e-results",
  use: {
    baseURL,
    locale: "de-CH",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm exec tsx e2e/servers/llm-mock.ts",
      url: `http://127.0.0.1:${LLM_PORT}/health`,
      env: { E2E_LLM_PORT: String(LLM_PORT) },
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: "pnpm exec tsx e2e/servers/fixtures.ts",
      url: `http://127.0.0.1:${FIXTURE_PORT}/health`,
      env: { E2E_FIXTURE_PORT: String(FIXTURE_PORT) },
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: "pnpm exec tsx e2e/start-app.ts",
      url: `${baseURL}/de`,
      env: appEnv,
      timeout: 300_000,
      reuseExistingServer: false,
      stdout: "pipe",
    },
  ],
});

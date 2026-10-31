import "server-only";
import { z } from "zod";

/**
 * Server environment, validated once at import. Every model and external service is
 * configured here so the stack can move to self-hosted models (Nebius) by env change only.
 */
const schema = z.object({
  DATA_DIR: z.string().default("./data"),

  // LLM: "anthropic" today, "openai-compatible" for a self-hosted vLLM endpoint later.
  LLM_PROVIDER: z.enum(["anthropic", "openai-compatible"]).default("anthropic"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-opus-5-5"),
  /** Fast mode (beta, ~2.5x output speed at premium price); only Opus 5.5 / 5 / 4.8 support it. */
  ANTHROPIC_SPEED: z.enum(["fast", "standard"]).default("fast"),
  /** Standard-speed model used when fast mode is rate limited or overloaded. */
  ANTHROPIC_FALLBACK_MODEL: z.string().default("claude-sonnet-5-5"),
  LLM_BASE_URL: z.url().optional(),
  LLM_API_KEY: z.string().optional(),
  /** Per-role model overrides; fall back to ANTHROPIC_MODEL / LLM_MODEL. */
  LLM_MODEL: z.string().optional(),
  LLM_MODEL_CHAT: z.string().optional(),
  LLM_MODEL_ANALYSIS: z.string().optional(),
  LLM_MODEL_EXTRACTION: z.string().optional(),
  LLM_MODEL_SIMULATION: z.string().optional(),

  LOGISMATA_API_BASE: z.url().default("https://baselhackathon2026.azurewebsites.net/viper"),
  LOGISMATA_API_TOKEN: z.string().optional(),

  QUICKSALE_BASE_URL: z.url().default("https://portal.pax.ch/quicksale/edu"),

  /** Swiss-German Nemotron transcription server (OpenAI-style /v1/audio/transcriptions). */
  STT_BASE_URL: z.url().default("http://127.0.0.1:8000"),

  /** Shared password for the company dashboard. */
  COMPANY_PASSWORD: z.string().min(4).default("pax-demo"),
  /** HMAC secret for cookies (customer device id, advisor session). */
  SESSION_SECRET: z.string().min(32),
  /** 32-byte hex/base64 key for AES-256-GCM document encryption at rest. */
  DOCUMENT_ENCRYPTION_KEY: z.string().min(32),
});

export const env = schema.parse(process.env);
export type Env = typeof env;

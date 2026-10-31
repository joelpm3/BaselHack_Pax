import "server-only";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  APICallError,
  type LanguageModel,
  type LanguageModelMiddleware,
  wrapLanguageModel,
} from "ai";
import { env } from "@/env";

/**
 * Model roles. Each can point at a different model so analysis/simulation can run on a
 * cheaper model than the customer-facing chat. Swap provider via LLM_PROVIDER.
 *
 * - chat: the customer-facing advisor (needs tool calling for generative UI)
 * - analysis: classifier, lead scoring, FAQ normalisation, hint explanations
 * - extraction: document classification + field extraction (needs PDF/image input)
 * - simulation: simulated customers talking to the advisor
 *
 * The provider decides where customer data goes, because the prompts carry the full context
 * (names, family, figures). `openai-compatible` keeps it on our own model on the Nebius GPU, the
 * self-hosted path; production rents that GPU in an EU region.
 */
export type ModelRole = "chat" | "analysis" | "extraction" | "simulation";

/** Background analysis is not latency-critical: it stays on Sonnet at standard speed. */
const ANTHROPIC_ROLE_DEFAULTS: Partial<Record<ModelRole, string>> = {
  analysis: "claude-sonnet-5-5",
};

function modelIdFor(role: ModelRole): string {
  const override = {
    chat: env.LLM_MODEL_CHAT,
    analysis: env.LLM_MODEL_ANALYSIS,
    extraction: env.LLM_MODEL_EXTRACTION,
    simulation: env.LLM_MODEL_SIMULATION,
  }[role];
  if (override) return override;
  if (env.LLM_PROVIDER !== "anthropic") return env.LLM_MODEL ?? "default";
  return ANTHROPIC_ROLE_DEFAULTS[role] ?? env.ANTHROPIC_MODEL;
}

/** Models that accept Anthropic fast mode (`speed: "fast"`); other models reject it. */
const FAST_MODE_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-opus-4-8"]);

/** Rate limited (429) or overloaded (529): fast mode has its own, smaller capacity. */
const isBusy = (error: unknown) =>
  APICallError.isInstance(error) && (error.statusCode === 429 || error.statusCode === 529);

/**
 * Opus in fast mode answers an advisor turn in ~3 s and a classification in ~6 s, where Sonnet
 * at standard speed needs ~6 s and ~18 s (measured 2026-10-31). Fast mode is only worth it while
 * it is faster: when it is busy, the call goes to the standard fallback model at once instead of
 * waiting for retries.
 */
function fastModeOrFallback(
  fallback: ReturnType<ReturnType<typeof createAnthropic>>,
): LanguageModelMiddleware {
  return {
    transformParams: async ({ params }) => ({
      ...params,
      providerOptions: {
        ...params.providerOptions,
        anthropic: { ...params.providerOptions?.anthropic, speed: "fast" },
      },
    }),
    wrapGenerate: async ({ doGenerate, params }) => {
      try {
        return await doGenerate();
      } catch (error) {
        if (!isBusy(error)) throw error;
        return fallback.doGenerate(withoutFastMode(params));
      }
    },
    wrapStream: async ({ doStream, params }) => {
      try {
        return await doStream();
      } catch (error) {
        if (!isBusy(error)) throw error;
        return fallback.doStream(withoutFastMode(params));
      }
    },
  };
}

function withoutFastMode<P extends { providerOptions?: Record<string, Record<string, unknown>> }>(
  params: P,
): P {
  const { speed: _speed, ...anthropicOptions } = params.providerOptions?.anthropic ?? {};
  return { ...params, providerOptions: { ...params.providerOptions, anthropic: anthropicOptions } };
}

let anthropic: ReturnType<typeof createAnthropic> | undefined;
let selfHosted: ReturnType<typeof createOpenAICompatible> | undefined;

export function getModel(role: ModelRole): LanguageModel {
  const modelId = modelIdFor(role);
  if (env.LLM_PROVIDER === "anthropic") {
    anthropic ??= createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const model = anthropic(modelId);
    if (env.ANTHROPIC_SPEED !== "fast" || !FAST_MODE_MODELS.has(modelId)) return model;
    return wrapLanguageModel({
      model,
      middleware: fastModeOrFallback(anthropic(env.ANTHROPIC_FALLBACK_MODEL)),
    });
  }
  if (!env.LLM_BASE_URL)
    throw new Error("LLM_BASE_URL is required for LLM_PROVIDER=openai-compatible");
  selfHosted ??= createOpenAICompatible({
    name: "self-hosted",
    baseURL: env.LLM_BASE_URL,
    apiKey: env.LLM_API_KEY,
  });
  return selfHosted.chatModel(modelId);
}

/** Model id string for audit records. */
export function modelName(role: ModelRole): string {
  return `${env.LLM_PROVIDER}:${modelIdFor(role)}`;
}

import "server-only";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { env } from "@/env";

/**
 * Model roles. Each can point at a different model so analysis/simulation can run on a
 * cheaper model than the customer-facing chat. Swap provider via LLM_PROVIDER.
 *
 * - chat: the customer-facing advisor (needs tool calling for generative UI)
 * - analysis: classifier, lead scoring, FAQ normalisation, hint explanations
 * - extraction: document classification + field extraction (needs PDF/image input)
 * - simulation: simulated customers talking to the advisor
 */
export type ModelRole = "chat" | "analysis" | "extraction" | "simulation";

function modelIdFor(role: ModelRole): string {
  const override = {
    chat: env.LLM_MODEL_CHAT,
    analysis: env.LLM_MODEL_ANALYSIS,
    extraction: env.LLM_MODEL_EXTRACTION,
    simulation: env.LLM_MODEL_SIMULATION,
  }[role];
  if (override) return override;
  return env.LLM_PROVIDER === "anthropic" ? env.ANTHROPIC_MODEL : (env.LLM_MODEL ?? "default");
}

let anthropic: ReturnType<typeof createAnthropic> | undefined;
let selfHosted: ReturnType<typeof createOpenAICompatible> | undefined;

export function getModel(role: ModelRole): LanguageModel {
  const modelId = modelIdFor(role);
  if (env.LLM_PROVIDER === "anthropic") {
    anthropic ??= createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
    return anthropic(modelId);
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

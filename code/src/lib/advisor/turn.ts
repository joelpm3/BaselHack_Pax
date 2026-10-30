import "server-only";
import type { UIMessage } from "ai";
import { getConversation } from "./conversations";
import { streamAdvisorTurn, type TurnResult } from "./engine";
import { sanitizeUserMessage, userMessageSchema } from "./user-message";

/**
 * Runs one advisor turn to completion without streaming to a browser: persists the user
 * message, runs the model with all tools, persists the assistant message and triggers analysis.
 * Used by the simulation; /api/chat shares the same internals (engine.ts) but streams.
 */
export interface AdvisorTurnInput {
  conversationId: string;
  userMessage: UIMessage;
}

export async function runAdvisorTurn(input: AdvisorTurnInput): Promise<UIMessage> {
  const conversation = getConversation(input.conversationId);
  if (!conversation) throw new Error(`Conversation ${input.conversationId} not found`);
  const message = sanitizeUserMessage(userMessageSchema.parse(input.userMessage));
  if (!message) throw new Error("The user message has no text");

  let settle: (result: TurnResult) => void = () => {};
  const settled = new Promise<TurnResult>((resolve) => {
    settle = resolve;
  });
  const stream = await streamAdvisorTurn(
    { conversation, message, trigger: "submit-message" },
    settle,
  );
  const reader = stream.getReader();
  while (!(await reader.read()).done) {
    // Drain the stream: persistence happens in its end callback.
  }
  const result = await settled;
  if (!result.message) throw new Error(result.error ?? "The advisor produced no answer");
  return result.message;
}

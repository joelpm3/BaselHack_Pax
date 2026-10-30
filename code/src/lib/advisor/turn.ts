import "server-only";
import type { UIMessage } from "ai";

/**
 * CONTRACT (owned by the advisor area). Runs one advisor turn to completion without streaming
 * to a browser: persists the user message, runs the model with all tools, persists the
 * assistant message and triggers analysis. Used by the simulation; /api/chat shares the same
 * internals but streams.
 */
export interface AdvisorTurnInput {
  conversationId: string;
  userMessage: UIMessage;
}

export async function runAdvisorTurn(input: AdvisorTurnInput): Promise<UIMessage> {
  throw new Error(`runAdvisorTurn not implemented yet (${input.conversationId})`);
}

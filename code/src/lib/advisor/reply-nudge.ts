import type { ModelMessage } from "ai";

/**
 * Opus often calls a widget that waits for the customer (quick replies, upload card, handover)
 * before writing anything, then reads the widget's result as the end of its turn and stops with
 * an empty answer: the customer sees buttons or a card and no message. When a step ends like
 * that, the next step gets a short note at the end of the transcript asking for the message.
 *
 * The note is appended as a user-side message: the instructions must stay identical within a
 * turn, because the turn's thinking blocks are bound to them and the API rejects the step
 * otherwise. The note is never stored or shown.
 */
export const REPLY_NUDGE =
  "[Note from the chat system, not from the customer: your message is still missing. The customer sees nothing until you write it. Write it now as plain text, short, ending with the one question your quick replies or card belong to. Do not call those tools again.]";

interface StepLike {
  text: string;
  toolCalls: ReadonlyArray<{ toolName: string }>;
}

/** True when the last step showed a waiting widget and no step of the turn has text yet. */
export function needsReplyNudge(steps: readonly StepLike[], waitingTools: readonly string[]) {
  const last = steps.at(-1);
  if (!last?.toolCalls.some((call) => waitingTools.includes(call.toolName))) return false;
  return !steps.some((step) => step.text.trim().length > 0);
}

export function withReplyNudge(messages: ModelMessage[]): ModelMessage[] {
  return [...messages, { role: "user", content: [{ type: "text", text: REPLY_NUDGE }] }];
}

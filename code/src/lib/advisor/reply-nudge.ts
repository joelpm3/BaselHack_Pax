import type { ModelMessage } from "ai";

/**
 * Opus often calls tools before writing anything (updateProfile, a calculation, quick replies),
 * then reads the last tool result as the end of its turn and stops with an empty answer: the
 * customer sees a card or buttons and no message. Whatever the tool, as long as nothing has been
 * written in the turn, the step after a tool call gets a short note at the end of the transcript
 * that the message is still due. After a widget that waits for the customer the note is firmer,
 * because the turn must end with text right away.
 *
 * The note is appended as a user-side message: the instructions must stay identical within a
 * turn, because the turn's thinking blocks are bound to them and the API rejects the step
 * otherwise. The note is never stored or shown.
 */
export const REPLY_NUDGE =
  "[Note from the chat system, not from the customer: you have not written anything to the customer in this turn yet, and they see nothing until you do. Call another tool only if you still need it; otherwise write your message now as plain text, short, ending with one question.]";

export const WIDGET_REPLY_NUDGE =
  "[Note from the chat system, not from the customer: your message is still missing. The customer sees nothing until you write it. Write it now as plain text, short, ending with the one question your quick replies or card belong to. Do not call those tools again.]";

interface StepLike {
  text: string;
  toolCalls: ReadonlyArray<{ toolName: string }>;
}

/** Which note the next step needs: none once the turn has text or the last step called no tool. */
export function replyNudgeFor(
  steps: readonly StepLike[],
  waitingTools: readonly string[],
): string | null {
  const last = steps.at(-1);
  if (!last || last.toolCalls.length === 0) return null;
  if (steps.some((step) => step.text.trim().length > 0)) return null;
  return last.toolCalls.some((call) => waitingTools.includes(call.toolName))
    ? WIDGET_REPLY_NUDGE
    : REPLY_NUDGE;
}

export function withReplyNudge(messages: ModelMessage[], nudge: string): ModelMessage[] {
  return [...messages, { role: "user", content: [{ type: "text", text: nudge }] }];
}

import type { ModelMessage } from "ai";
import { endsWithQuestion, isDangling } from "./message-shape";

/**
 * Opus often stops right after a tool call: with no text at all (the customer sees a card or
 * buttons and nothing else), or after half a message ("Für die Berechnung brauche ich noch eine
 * letzte Angabe." and no question; "Es geht um diese Punkte:" and no list). Whenever a step ended
 * with a tool call and the text so far does not end with a question, the next step gets a short
 * note at the end of the transcript that the message is missing or unfinished. After a widget
 * that waits for the customer the note is firmer, because the turn must end right away.
 *
 * The note is appended as a user-side message: the instructions must stay identical within a
 * turn, because the turn's thinking blocks are bound to them and the API rejects the step
 * otherwise. The note is never stored or shown.
 */
export const REPLY_NUDGE =
  "[Note from the chat system, not from the customer: you have not written anything to the customer in this turn yet, and they see nothing until you do. Call another tool only if you still need it; otherwise write your message now as plain text, short, ending with one question or a clear next step.]";

export const WIDGET_REPLY_NUDGE =
  "[Note from the chat system, not from the customer: your message is still missing. The customer sees nothing until you write it. Write it now as plain text, short, ending with the one question your quick replies or card belong to. Do not call those tools again.]";

export function continueNudge(tail: string): string {
  return `[Note from the chat system, not from the customer: the customer has read your message so far, which ends: «${tail}». It is not finished. Continue it now without repeating anything: deliver what you announced and end with one question or a clear next step. Call another tool only if you still need it.]`;
}

interface StepLike {
  text: string;
  toolCalls: ReadonlyArray<{ toolName: string }>;
}

/** All text the turn has shown so far. */
export function turnText(steps: readonly StepLike[]): string {
  return steps
    .map((step) => step.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

/** Which note the next step needs: none once the message ends with a question, or without a tool. */
export function replyNudgeFor(
  steps: readonly StepLike[],
  waitingTools: readonly string[],
): string | null {
  const last = steps.at(-1);
  if (!last || last.toolCalls.length === 0) return null;
  const text = turnText(steps);
  if (!text)
    return last.toolCalls.some((call) => waitingTools.includes(call.toolName))
      ? WIDGET_REPLY_NUDGE
      : REPLY_NUDGE;
  if (endsWithQuestion(text)) return null;
  return continueNudge(text.slice(-90).replace(/\s+/g, " ").trim());
}

/**
 * A widget that waits for the customer ends the turn, but only once the message is complete: a
 * message that stops at "diese Punkte:" gets one more step to finish.
 */
export function readyToWait(steps: readonly StepLike[], waitingTools: readonly string[]): boolean {
  const last = steps.at(-1);
  if (!last?.toolCalls.some((call) => waitingTools.includes(call.toolName))) return false;
  const text = turnText(steps);
  return text.length > 0 && !isDangling(text);
}

export function withReplyNudge(messages: ModelMessage[], nudge: string): ModelMessage[] {
  return [...messages, { role: "user", content: [{ type: "text", text: nudge }] }];
}

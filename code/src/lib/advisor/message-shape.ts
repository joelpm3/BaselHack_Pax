/**
 * Whether an advisor message reads as finished. Every turn must end with the question or the
 * next step it leads to; a message that stops at a colon or after "brauche ich noch eine Angabe."
 * promised something it never delivered. Used by the engine (to ask the model to continue) and
 * by the quick replies (which only accompany a question).
 */

/** The last sentence of a text (after the last ., ! or ?). */
function lastSentence(text: string): string {
  const parts = text.trim().split(/(?<=[.!?])\s+/);
  return parts.at(-1) ?? "";
}

/** True when the text's last sentence asks a question. */
export function endsWithQuestion(text: string): boolean {
  return lastSentence(text).includes("?");
}

const ANNOUNCES =
  /(brauche ich noch|fehlt (mir )?noch|benötige ich noch|folgende[n]? (Punkte|Fragen|Angaben)|il me faut encore|il me manque|j'ai encore besoin|mi serve ancora|mi manca|I still need)/i;

/** The message stops where it announced more: a colon, an ellipsis, or "brauche ich noch …". */
export function isDangling(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/[:…]$|\.\.\.$/.test(t)) return true;
  const last = lastSentence(t);
  return !last.includes("?") && ANNOUNCES.test(last);
}

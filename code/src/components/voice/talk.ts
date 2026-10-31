/** Pure helpers of the voice-first composer (kept DOM-free so they can be unit-tested). */

/** Joins what was already said or typed with the next transcript. */
export function appendTranscript(current: string, transcript: string): string {
  const before = current.trim();
  const next = transcript.trim();
  if (!before) return next;
  if (!next) return before;
  return `${before} ${next}`;
}

const MIN_AUTO_SEND_S = 4;
const MAX_AUTO_SEND_S = 10;
const WORDS_PER_EXTRA_SECOND = 12;

/**
 * Seconds the transcript stays on screen before it is sent by itself: long voice answers need
 * longer to read through than a short "ja, genau".
 */
export function autoSendSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(MAX_AUTO_SEND_S, MIN_AUTO_SEND_S + Math.floor(words / WORDS_PER_EXTRA_SECOND));
}

/** The subset of an element the Space shortcut needs to look at. */
export interface ShortcutTarget {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
}

const INTERACTIVE =
  "input, textarea, select, button, a[href], summary, [contenteditable], [role='button'], [role='menuitem'], [role='tab'], [role='checkbox'], [role='radio'], [role='switch'], [role='slider'], [role='textbox'], dialog";

/**
 * Space starts and stops talking only when it would not do anything else: never while typing,
 * and never on a focused control, where Space already means "press".
 */
export function isSpaceShortcutFree(target: ShortcutTarget | null): boolean {
  if (!target?.tagName) return true;
  if (target.isContentEditable) return false;
  return !target.closest?.(INTERACTIVE);
}

/**
 * The model sometimes writes its message, calls a tool, and then writes the same message again
 * in the next step. The repeat is dropped wherever a message is stored or shown, so the customer
 * reads it once. While it streams, the repeat is a prefix of the earlier text, so it is hidden
 * from its first words (prefixes count from 20 characters, to keep short legitimate replies).
 */
export function withoutRepeatedText<T extends { type: string; text?: string }>(
  parts: readonly T[],
): T[] {
  const earlier: string[] = [];
  return parts.filter((part) => {
    if (part.type !== "text") return true;
    const text = (part.text ?? "").trim();
    if (!text) return true;
    const repeats = earlier.some(
      (before) => before === text || (text.length >= 20 && before.startsWith(text)),
    );
    if (!repeats) earlier.push(text);
    return !repeats;
  });
}

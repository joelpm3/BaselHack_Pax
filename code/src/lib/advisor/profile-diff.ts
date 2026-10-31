import type { LifeSituation } from "@/lib/domain/profile";

export interface ReplacedFact {
  path: string;
  previous: string | number | boolean;
  value: unknown;
}

function valueAt(profile: LifeSituation, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (node, key) =>
        node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined,
      profile,
    );
}

/**
 * Simple facts (numbers, text, yes/no) a change overwrites with a different value. The advisor
 * names these in its reply, so a fact can never move between the customer and the partner, or
 * be replaced by a guess, without the customer seeing it.
 */
export function replacedFacts(
  changes: Array<{ path: string; value: unknown }>,
  current: LifeSituation,
): ReplacedFact[] {
  const replaced: ReplacedFact[] = [];
  for (const { path, value } of changes) {
    const previous = valueAt(current, path);
    if (
      (typeof previous === "string" ||
        typeof previous === "number" ||
        typeof previous === "boolean") &&
      previous !== value
    )
      replaced.push({ path, previous, value });
  }
  return replaced;
}

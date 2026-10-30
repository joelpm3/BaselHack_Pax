import "server-only";
import { createTranslator } from "next-intl";
import type { Locale } from "@/lib/domain/taxonomy";

export type GreetingVariant = "default" | "upload" | "existing" | "hint";

/**
 * The advisor's opening line, written when the conversation is created (instant, no model call).
 * It always opens personally; the upload variant only acknowledges the documents, the hint
 * variant names the cockpit hint the customer came from.
 */
export async function greetingText(
  locale: Locale,
  variant: GreetingVariant,
  firstName: string | null,
  hintTitle?: string,
): Promise<string> {
  const messages = (await import(`../../../messages/${locale}/chat.json`)).default;
  const t = createTranslator({ locale, messages, namespace: "greeting" });
  if (variant === "hint" && hintTitle) {
    return firstName
      ? t("hint", { name: firstName, title: hintTitle })
      : t("hintAnonymous", { title: hintTitle });
  }
  if (variant === "existing") {
    return firstName ? t("existing", { name: firstName }) : t("existingAnonymous");
  }
  return variant === "upload" ? t("upload") : t("default");
}

import "server-only";
import { createTranslator } from "next-intl";
import type { Locale } from "@/lib/domain/taxonomy";
import { formatChf } from "@/lib/utils";

/**
 * Texts the sales tools write into recommendations and offers (headlines, rationale, criteria)
 * in the conversation's language. They are stored, so the dashboard and the audit trail show
 * exactly what the customer saw.
 */
export async function salesTexts(locale: Locale) {
  const messages = (await import(`../../../messages/${locale}/sales.json`)).default;
  const t = createTranslator({ locale, messages });
  const chf = (amount: number) => formatChf(Math.round(amount), locale);
  return { t, chf };
}

export type SalesTexts = Awaited<ReturnType<typeof salesTexts>>;

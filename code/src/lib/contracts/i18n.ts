import { createTranslator } from "next-intl";
import type { Locale } from "@/lib/domain/taxonomy";

export type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * Texts of the contract PDFs. `contracts.json` is server-only (not in NAMESPACES, so it never
 * ships to the browser); offer conditions, rider and scenario labels come from `sales.json`,
 * exactly as the customer saw them in the chat.
 */
export async function contractTexts(locale: Locale): Promise<Translate> {
  const [contracts, sales] = await Promise.all([
    import(`../../../messages/${locale}/contracts.json`),
    import(`../../../messages/${locale}/sales.json`),
  ]);
  const t = createTranslator({
    locale,
    messages: { contracts: contracts.default, sales: sales.default },
  });
  return (key, values) => t(key as never, values as never);
}

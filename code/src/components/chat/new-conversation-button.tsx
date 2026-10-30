import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { startNewConversation } from "@/app/[locale]/chat/actions";
import type { Locale } from "@/lib/domain/taxonomy";

/** Starts a fresh conversation for the same customer (server action, works without JS). */
export function NewConversationButton({ locale }: { locale: Locale }) {
  const t = useTranslations("chat");
  return (
    <form action={startNewConversation}>
      <input type="hidden" name="locale" value={locale} />
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-paragraph-xs font-medium hover:bg-gray-1"
      >
        <Plus aria-hidden className="size-4" />
        <span className="hidden sm:inline">{t("newConversation")}</span>
        <span className="sr-only sm:hidden">{t("newConversation")}</span>
      </button>
    </form>
  );
}

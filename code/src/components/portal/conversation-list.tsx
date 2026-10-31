import { ChevronRight, Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { startNewConversation } from "@/app/[locale]/chat/actions";
import { Link } from "@/i18n/navigation";
import type { schema } from "@/lib/db";
import { formatSwissDate, toIsoDate } from "@/lib/documents/dates";
import { EmptyNote } from "./section";
import { SubmitButton } from "./submit-button";

type ConversationRow = typeof schema.conversations.$inferSelect;

/** The customer's advisor conversations: continue one or start a new one. */
export async function ConversationList({
  conversations,
  locale,
}: {
  conversations: ConversationRow[];
  locale: string;
}) {
  const t = await getTranslations("portal.conversations");
  const tStage = await getTranslations("common.taxonomy.stages");
  return (
    <div className="flex flex-col gap-3">
      {conversations.length === 0 ? (
        <EmptyNote>{t("empty")}</EmptyNote>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {conversations.map((c) => {
            const last = formatSwissDate(toIsoDate(c.lastMessageAt ?? c.createdAt));
            return (
              <li key={c.id}>
                <Link
                  href={`/chat/${c.id}`}
                  className="flex items-center gap-3 p-4 hover:bg-gray-1 focus-visible:bg-gray-1"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {c.title ?? t("untitled", { date: formatSwissDate(toIsoDate(c.createdAt)) })}
                    </p>
                    <p className="text-paragraph-xs text-fg-muted">
                      {t("meta", { stage: tStage(c.stage), date: last })}
                    </p>
                  </div>
                  <span className="text-paragraph-xs font-medium text-contrast-green max-sm:sr-only">
                    {t("continue")}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-fg-muted" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <form action={startNewConversation}>
        <input type="hidden" name="locale" value={locale} />
        <SubmitButton variant="secondary" size="sm">
          <Plus aria-hidden />
          {t("new")}
        </SubmitButton>
      </form>
    </div>
  );
}

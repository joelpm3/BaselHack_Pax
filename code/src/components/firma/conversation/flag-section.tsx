import { getFormatter, getTranslations } from "next-intl/server";
import { Panel } from "@/components/firma/page-parts";
import { Badge } from "@/components/ui/badge";
import { listConversationFlags } from "@/lib/improvements/service";
import { cn } from "@/lib/utils";
import { FlagConversationForm, ResolveFlagButton } from "./flag-controls";

/** "Not good" flags of one conversation; open flags feed the improvement analysis. */
export async function FlagSection({ conversationId }: { conversationId: string }) {
  const [t, format] = await Promise.all([getTranslations("learning.flag"), getFormatter()]);
  const flags = listConversationFlags(conversationId);
  // Collapsed unless a flag is already open, so the form does not compete with the work on top.
  return (
    <Panel
      title={t("title")}
      description={t("description")}
      collapsed={!flags.some((f) => f.status === "open")}
      meta={flags.length || null}
    >
      <div className="grid gap-4">
        {flags.length > 0 ? (
          <ul className="grid gap-3">
            {flags.map((flag) => (
              <li
                key={flag.id}
                className={cn(
                  "grid gap-1 border-l-2 pl-3",
                  flag.status === "open" ? "border-error" : "border-line text-fg-muted",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p>{flag.note}</p>
                  {flag.status === "open" ? (
                    <ResolveFlagButton flagId={flag.id} />
                  ) : (
                    <Badge>{t("resolved")}</Badge>
                  )}
                </div>
                <p className="text-xs text-fg-muted">
                  {t("by", {
                    name: flag.advisorName ?? t("unknownAdvisor"),
                    time: format.dateTime(flag.createdAt, {
                      day: "numeric",
                      month: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    }),
                  })}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
        <FlagConversationForm conversationId={conversationId} />
      </div>
    </Panel>
  );
}

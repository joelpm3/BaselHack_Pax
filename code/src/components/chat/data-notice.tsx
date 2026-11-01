import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * Advance notice under the greeting: Clara is an AI, and where the customer's data lives.
 * A server component: the chat page renders it and hands it to ChatView as `notice`.
 * The link never breaks, so on a phone the statement fills one line and the link the next.
 */
export function DataNotice() {
  const t = useTranslations("chat");
  return (
    <p className="mt-2 ml-[1.375rem] text-pretty text-paragraph-xs text-fg-muted">
      {t.rich("dataNotice", {
        link: (chunks) => (
          <Link
            href="/portal#my-data"
            className="whitespace-nowrap font-medium text-contrast-green underline underline-offset-2"
          >
            {chunks}
          </Link>
        ),
      })}
    </p>
  );
}

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/** Advance notice under the greeting: Clara is an AI, and where the customer's data lives. */
export function DataNotice() {
  const t = useTranslations("chat");
  return (
    <p className="ml-[1.375rem] text-paragraph-xs text-fg-subtle">
      {t.rich("dataNotice", {
        link: (chunks) => (
          <Link
            href="/portal#my-data"
            className="font-medium text-contrast-green underline underline-offset-2"
          >
            {chunks}
          </Link>
        ),
      })}
    </p>
  );
}

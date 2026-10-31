import { MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { SiteHeader } from "@/components/site/site-header";
import { Link } from "@/i18n/navigation";

/** The shared customer header with a shortcut back to the advisor. */
export function PortalHeader() {
  const t = useTranslations("portal.header");
  return (
    <SiteHeader
      actions={
        <Link
          href="/"
          className="inline-flex h-9 items-center gap-2 rounded-full bg-pax-green px-3.5 text-paragraph-xs font-medium text-ink hover:bg-contrast-green hover:text-white"
        >
          <MessageCircle className="size-4" aria-hidden />
          <span className="max-sm:sr-only">{t("toAdvisor")}</span>
        </Link>
      }
    />
  );
}

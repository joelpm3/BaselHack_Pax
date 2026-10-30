import { LayoutGrid } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { PaxLogo } from "@/components/ui/logo";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./locale-switcher";

/**
 * Customer header: Pax logo (home), language, the Vorsorge-Cockpit link and optional page
 * actions (e.g. "Neues Gespräch" in the chat). Shared by the advisor and the portal.
 */
export function SiteHeader({ actions }: { actions?: ReactNode }) {
  const t = useTranslations("home.header");
  return (
    <header className="sticky top-0 z-30 h-16 border-b border-line bg-surface">
      <div className="mx-auto flex h-full max-w-[1160px] items-center gap-2 px-4 lg:px-8">
        <Link href="/" className="mr-auto shrink-0 rounded-sm" aria-label={t("home")}>
          <PaxLogo className="h-6 sm:h-7" />
        </Link>
        {actions}
        <LocaleSwitcher />
        <Link
          href="/portal"
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-paragraph-xs font-medium hover:bg-gray-1"
        >
          <LayoutGrid aria-hidden className="size-4" />
          <span className="hidden sm:inline">{t("portal")}</span>
          <span className="sr-only sm:hidden">{t("portal")}</span>
        </Link>
      </div>
    </header>
  );
}

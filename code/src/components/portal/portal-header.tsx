import { MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { PaxLogo } from "@/components/ui/logo";
import { Link } from "@/i18n/navigation";
import { LOCALES } from "@/lib/domain/taxonomy";
import { cn } from "@/lib/utils";

/**
 * Minimal customer header for the cockpit (the shared site header belongs to the chat area;
 * swap it in here once it exists).
 */
export function PortalHeader({ locale }: { locale: string }) {
  const t = useTranslations("portal.header");
  return (
    <header className="bg-pax-purple text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 lg:px-8">
        <Link href="/" aria-label={t("home")} className="shrink-0">
          <PaxLogo variant="negative" className="h-6 lg:h-7" />
        </Link>
        <nav aria-label={t("navigation")} className="flex items-center gap-1 sm:gap-3">
          <ul className="flex items-center" aria-label={t("language")}>
            {LOCALES.map((code) => (
              <li key={code}>
                <Link
                  href="/portal"
                  locale={code}
                  aria-current={code === locale ? "true" : undefined}
                  className={cn(
                    "inline-flex size-9 items-center justify-center rounded-full text-paragraph-xs font-medium",
                    code === locale ? "bg-white/15 text-white" : "text-white/70 hover:text-white",
                  )}
                >
                  {code.toUpperCase()}
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/"
            className="inline-flex h-9 items-center gap-2 rounded-full bg-pax-green px-3.5 text-paragraph-xs font-medium text-ink hover:bg-contrast-green hover:text-white"
          >
            <MessageCircle className="size-4" aria-hidden />
            <span className="max-sm:sr-only">{t("toAdvisor")}</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}

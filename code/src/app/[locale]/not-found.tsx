import { ArrowRight, LayoutGrid } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { SiteHeader } from "@/components/site/site-header";
import { Button, buttonClasses } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { startConversation } from "./chat/actions";

export default function NotFound() {
  const t = useTranslations("common.notFound");
  const locale = useLocale();
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1160px] px-4 pt-14 pb-20 lg:px-8 lg:pt-24">
        <span aria-hidden className="block size-3 bg-pax-green" />
        <h1 className="mt-6 text-heading-l font-bold text-contrast-green">{t("title")}</h1>
        <p className="mt-4 max-w-[56ch] text-paragraph-l text-fg-muted">{t("body")}</p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <form action={startConversation}>
            <input type="hidden" name="locale" value={locale} />
            <Button type="submit">
              {t("start")}
              <ArrowRight aria-hidden />
            </Button>
          </form>
          <Link href="/portal" className={buttonClasses("secondary")}>
            <LayoutGrid aria-hidden />
            {t("portal")}
          </Link>
        </div>
      </main>
    </>
  );
}

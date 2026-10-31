import { ArrowRight, Paperclip } from "lucide-react";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { Suspense, use } from "react";
import { HomeResume } from "@/components/site/home-resume";
import { SiteHeader } from "@/components/site/site-header";
import { ExampleSquares } from "@/components/vorsorgebild/example-squares";
import { Link } from "@/i18n/navigation";
import { startConversation } from "./chat/actions";

export default function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("home");

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1160px] px-4 lg:px-8">
        <section className="grid gap-12 pt-10 pb-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] lg:items-center lg:gap-16 lg:pt-20 lg:pb-24">
          <div className="max-w-[620px]">
            <h1 className="text-heading-xl font-bold text-contrast-green">{t("title")}</h1>
            <p className="mt-5 max-w-[56ch] text-paragraph-l text-fg-muted">{t("lead")}</p>

            <div className="mt-8 flex flex-col gap-3">
              <form action={startConversation}>
                <input type="hidden" name="locale" value={locale} />
                <button
                  type="submit"
                  className="group flex w-full items-center gap-4 rounded-xl bg-pax-purple px-5 py-5 text-left text-white transition-colors hover:bg-deep-purple lg:rounded-xl lg:px-6"
                >
                  <span className="flex-1">
                    <span className="block text-heading-s font-bold">{t("start.title")}</span>
                    <span className="mt-1 block text-paragraph-s text-white/80">
                      {t("start.body")}
                    </span>
                  </span>
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-pax-green text-ink transition-transform group-hover:translate-x-0.5">
                    <ArrowRight aria-hidden className="size-5" />
                  </span>
                </button>
              </form>

              <Link
                href="/kunde"
                className="group flex items-center gap-4 rounded-xl border-[1.6px] border-ink px-5 py-5 transition-colors hover:bg-gray-1 lg:rounded-xl lg:px-6"
              >
                <span className="flex-1">
                  <span className="block text-heading-s font-bold">{t("existing.title")}</span>
                  <span className="mt-1 block text-paragraph-s text-fg-muted">
                    {t("existing.body")}
                  </span>
                </span>
                <span className="grid size-11 shrink-0 place-items-center rounded-full border-[1.6px] border-ink transition-transform group-hover:translate-x-0.5">
                  <ArrowRight aria-hidden className="size-5" />
                </span>
              </Link>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
              <form action={startConversation}>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="variant" value="upload" />
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 text-paragraph-s font-medium text-pax-purple underline-offset-4 hover:underline"
                >
                  <Paperclip aria-hidden className="size-4" />
                  {t("upload")}
                </button>
              </form>
              <Suspense fallback={null}>
                <HomeResume />
              </Suspense>
            </div>
          </div>

          <ExampleSquares />
        </section>

        <section
          aria-label={t("points.label")}
          className="grid gap-6 border-t border-line py-10 sm:grid-cols-3 lg:py-14"
        >
          {(["life", "numbers", "people"] as const).map((key) => (
            <div key={key} className="flex gap-3">
              <span aria-hidden className="mt-2 block size-2.5 shrink-0 bg-pax-green" />
              <div>
                <h2 className="text-paragraph-m font-bold">{t(`points.${key}.title`)}</h2>
                <p className="mt-1 text-paragraph-s text-fg-muted">{t(`points.${key}.body`)}</p>
              </div>
            </div>
          ))}
        </section>
      </main>
    </>
  );
}

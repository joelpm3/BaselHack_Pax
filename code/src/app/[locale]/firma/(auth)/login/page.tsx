import type { Metadata } from "next";
import { connection } from "next/server";
import { useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense, use } from "react";
import { LoginForm } from "@/components/firma/login-form";
import { PaxLogo } from "@/components/ui/logo";
import { Spinner } from "@/components/ui/spinner";
import { FUNNEL_STAGES } from "@/lib/domain/taxonomy";
import { listAdvisors } from "@/lib/firma/conversations";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/firma/login">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "firma.login" });
  return { title: t("title"), robots: { index: false } };
}

export default function LoginPage({ params }: PageProps<"/[locale]/firma/login">) {
  setRequestLocale(use(params).locale);
  const t = useTranslations("firma.login");

  return (
    <div className="grid min-h-dvh text-sm lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <section className="flex flex-col justify-between gap-10 bg-deep-purple px-6 py-8 text-white lg:px-12 lg:py-12">
        <PaxLogo variant="negative" className="h-7 self-start" />
        <div className="grid max-w-md gap-4">
          <h1 className="text-[2rem] leading-tight font-bold text-pax-green lg:text-[2.75rem]">
            {t("headline")}
          </h1>
          <p className="text-base text-white/80">{t("intro")}</p>
        </div>
        <ul aria-hidden className="flex gap-1.5">
          {FUNNEL_STAGES.map((stage, i) => (
            <li
              key={stage}
              className={cn(
                "size-2.5",
                i < 6 ? "bg-white/30" : i === 6 ? "bg-pax-green" : "bg-white/10",
              )}
            />
          ))}
        </ul>
      </section>
      <section className="flex items-center justify-center px-6 py-10">
        <div className="grid w-full max-w-md gap-8">
          <h2 className="text-2xl font-bold">{t("title")}</h2>
          <Suspense fallback={<Spinner label={t("title")} />}>
            <AdvisorPicker />
          </Suspense>
        </div>
      </section>
    </div>
  );
}

async function AdvisorPicker() {
  await connection();
  return <LoginForm advisors={listAdvisors()} />;
}

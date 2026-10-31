import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense, use } from "react";
import { FirmaShell } from "@/components/firma/firma-shell";
import { LiveEventsProvider } from "@/components/firma/live-events";
import { requireAdvisor } from "@/lib/firma/auth";

export async function generateMetadata({
  params,
}: LayoutProps<"/[locale]/firma">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "firma.nav" });
  return {
    title: { default: t("cockpit"), template: `%s · ${t("cockpit")}` },
    robots: { index: false },
  };
}

export default function FirmaLayout({ children, params }: LayoutProps<"/[locale]/firma">) {
  setRequestLocale(use(params).locale);
  return (
    <LiveEventsProvider>
      <FirmaShell
        advisorSlot={
          <Suspense fallback={<div className="h-9" />}>
            <SignedInAdvisor />
          </Suspense>
        }
      >
        {children}
      </FirmaShell>
    </LiveEventsProvider>
  );
}

async function SignedInAdvisor() {
  const [advisor, t] = await Promise.all([requireAdvisor(), getTranslations("firma.nav")]);
  return (
    <div className="grid leading-tight">
      <span className="text-paragraph-xs text-white/60">{t("signedInAs")}</span>
      <span className="font-medium">{advisor.name}</span>
      <span className="text-paragraph-xs text-white/60">{advisor.team}</span>
    </div>
  );
}

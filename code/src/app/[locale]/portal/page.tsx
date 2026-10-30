import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense, use } from "react";
import { keyFigures, upcomingDates } from "@/components/portal/cockpit";
import { ConversationList } from "@/components/portal/conversation-list";
import { DocumentList } from "@/components/portal/document-list";
import { HintList, HintListSkeleton } from "@/components/portal/hint-list";
import { KeyFigures } from "@/components/portal/key-figures";
import { PillarOverview } from "@/components/portal/pillar-overview";
import { PolicyList } from "@/components/portal/policy-list";
import { PortalHeader } from "@/components/portal/portal-header";
import { ProfileSummary } from "@/components/portal/profile-summary";
import { Section } from "@/components/portal/section";
import { UpcomingDates } from "@/components/portal/upcoming-dates";
import { buttonClasses } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getCurrentCustomer } from "@/lib/auth/customer";
import { toIsoDate } from "@/lib/documents/dates";
import type { Locale } from "@/lib/domain/taxonomy";
import { loadCockpit } from "./data";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/portal">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "portal" });
  return { title: t("metaTitle") };
}

export default function PortalPage({ params }: PageProps<"/[locale]/portal">) {
  const { locale } = use(params);
  setRequestLocale(locale);
  return (
    <div className="min-h-dvh pb-16">
      <PortalHeader />
      <Suspense fallback={<CockpitSkeleton />}>
        <Cockpit locale={locale as Locale} />
      </Suspense>
    </div>
  );
}

async function Cockpit({ locale }: { locale: Locale }) {
  await connection();
  const customer = await getCurrentCustomer();
  if (!customer) return <EmptyCockpit />;
  const t = await getTranslations("portal");
  const today = toIsoDate(new Date());
  const { profile, policies, documents, conversations, documentPaths } = loadCockpit(customer.id);
  const firstName = profile.person.firstName ?? customer.firstName;

  return (
    <>
      <PillarOverview locale={locale} firstName={firstName} policies={policies} />
      <div className="mx-auto max-w-6xl px-4 lg:px-8">
        <div className="-mt-px pt-6 lg:pt-8">
          <KeyFigures figures={keyFigures(policies, profile)} locale={locale} />
        </div>

        {/* Mobile: one column in reading order. Desktop: main column and a side column. */}
        <div className="mt-10 flex flex-col gap-10 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-12">
          <div className="contents lg:flex lg:flex-col lg:gap-12">
            <Section id="hints" title={t("hints.title")} className="order-1">
              <Suspense fallback={<HintListSkeleton label={t("hints.loading")} />}>
                <HintList customerId={customer.id} locale={locale} policies={policies} />
              </Suspense>
            </Section>
            <Section id="policies" title={t("policies.title")} className="order-3">
              <PolicyList policies={policies} locale={locale} />
            </Section>
            <Section id="documents" title={t("documents.title")} className="order-4">
              <DocumentList documents={documents} />
            </Section>
          </div>
          <div className="contents lg:flex lg:flex-col lg:gap-12">
            <Section id="dates" title={t("dates.title")} className="order-2">
              <UpcomingDates dates={upcomingDates(policies, today)} today={today} />
            </Section>
            <Section id="conversations" title={t("conversations.title")} className="order-5">
              <ConversationList conversations={conversations} locale={locale} />
            </Section>
            <Section id="profile" title={t("profile.title")} className="order-6">
              <ProfileSummary profile={profile} documentPaths={documentPaths} locale={locale} />
            </Section>
          </div>
        </div>
      </div>
    </>
  );
}

async function EmptyCockpit() {
  const t = await getTranslations("portal.empty");
  return (
    <section className="bg-pax-purple text-white">
      <div className="mx-auto max-w-6xl px-4 pt-8 pb-14 lg:px-8 lg:pt-12">
        <div className="mb-6 flex gap-1.5" aria-hidden>
          <span className="size-5 bg-white/25" />
          <span className="size-5 border-2 border-white" />
          <span className="size-5 bg-pax-green" />
        </div>
        <h1 className="text-heading-xl font-bold">{t("title")}</h1>
        <p className="mt-3 max-w-xl text-paragraph-l text-white/80">{t("body")}</p>
        <Link href="/" className={buttonClasses("inverse", "lg", "mt-8")}>
          {t("start")}
        </Link>
      </div>
    </section>
  );
}

function CockpitSkeleton() {
  return (
    <div aria-busy="true">
      <div className="bg-pax-purple">
        <div className="mx-auto max-w-6xl px-4 pt-6 pb-8 lg:px-8 lg:pt-10 lg:pb-12">
          <div className="h-4 w-32 bg-white/15" />
          <div className="mt-3 h-9 w-64 bg-white/15" />
          <div className="mt-8 grid h-40 grid-cols-4 gap-3 sm:gap-6">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col-reverse gap-1">
                <span className="size-5 bg-white/15 sm:size-7" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 pt-6 lg:px-8">
        <div className="h-24 animate-pulse rounded-[16px] bg-surface-muted" />
      </div>
    </div>
  );
}

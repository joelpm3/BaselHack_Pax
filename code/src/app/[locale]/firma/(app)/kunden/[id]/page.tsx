// One job: everything an advisor needs to act on one person: how to reach them, what is open
// (handover, lead, follow-up) and the latest next step. History, records and the timeline sit
// collapsed below.
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { SimulatedBadge } from "@/components/firma/badges";
import { HandoversSection, LeadsSection } from "@/components/firma/conversation/leads-section";
import { ProfileSection } from "@/components/firma/conversation/profile-section";
import {
  DocumentsSection,
  RecommendationsSection,
} from "@/components/firma/conversation/records-section";
import { CustomerFollowUpsSlot } from "@/components/firma/customer/follow-ups-slot";
import {
  ApplicationsSection,
  CommunicationsSection,
  ContactButtons,
  ConversationsSection,
  TimelineSection,
} from "@/components/firma/customer/sections";
import { LiveRefresh, LiveStatus } from "@/components/firma/live-events";
import { LoadingBlock, PageBody } from "@/components/firma/page-parts";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { requireAdvisor } from "@/lib/firma/auth";
import { getCustomerDetail } from "@/lib/firma/customers";
import { displayName } from "@/lib/firma/names";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/firma/kunden/[id]">): Promise<Metadata> {
  const t = await getTranslations({
    locale: (await params).locale,
    namespace: "firmaCustomers.detail",
  });
  return { title: t("title") };
}

/** The customer id is runtime data, so the whole screen streams behind one boundary. */
export default function CustomerPage({ params }: PageProps<"/[locale]/firma/kunden/[id]">) {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <CustomerContent params={params} />
    </Suspense>
  );
}

/** Anchored section: the customer view is linked into from leads, handovers and follow-ups. */
function Section({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div id={id} className="min-w-0 scroll-mt-20 lg:scroll-mt-6">
      {children}
    </div>
  );
}

async function CustomerContent({
  params,
}: {
  params: PageProps<"/[locale]/firma/kunden/[id]">["params"];
}) {
  const { locale: routeLocale, id } = await params;
  setRequestLocale(routeLocale);
  await requireAdvisor();
  await connection();
  const detail = getCustomerDetail(id);
  if (!detail) notFound();
  const [t, tFocus, tx, tCommon, format, locale] = await Promise.all([
    getTranslations("firmaCustomers.detail"),
    getTranslations("firmaFocus.customer"),
    getTranslations("firma.taxonomy"),
    getTranslations("firma.common"),
    getFormatter(),
    getLocale(),
  ]);
  const now = new Date();
  const { customer, profile } = detail;
  const name = displayName(customer) ?? profile.person.firstName ?? tCommon("anonymous");
  const place = [profile.residence.zip, profile.residence.city].filter(Boolean).join(" ");
  const age = profile.person.birthYear ? now.getFullYear() - profile.person.birthYear : null;
  const titles = Object.fromEntries(detail.conversations.map((c) => [c.id, c.title]));
  // The newest conversation's suggested next step is what the advisor acts on first.
  const latest = detail.conversations.find((c) => detail.analyses[c.id]?.nextBestAction);
  const nextStep = latest ? detail.analyses[latest.id]?.nextBestAction : null;

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6 lg:px-8">
        <Link
          href="/firma/kunden"
          className="inline-flex items-center gap-1.5 text-fg-muted hover:text-fg"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t("back")}
        </Link>
        <LiveStatus />
      </div>
      <LiveRefresh
        types={["conversation", "analysis", "lead", "handover", "document", "policy"]}
        intervalMs={3000}
      />
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line px-4 py-5 sm:px-6 lg:px-8">
        <div className="grid min-w-0 gap-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="text-2xl leading-tight font-bold">{name}</h1>
            <Badge tone={customer.lifecycle === "client" ? "success" : "neutral"}>
              {tx(`lifecycle.${customer.lifecycle}`)}
            </Badge>
            {customer.isSimulated ? <SimulatedBadge /> : null}
          </div>
          <p className="text-fg-muted">
            {[
              place || null,
              age !== null ? t("age", { age }) : null,
              t("since", { date: format.dateTime(customer.createdAt, { dateStyle: "medium" }) }),
            ]
              .filter(Boolean)
              .join(", ")}
          </p>
        </div>
        <ContactButtons customer={customer} />
      </header>

      <PageBody className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] xl:grid-cols-[minmax(0,1fr)_28rem]">
        <div className="grid min-w-0 content-start gap-6">
          {nextStep && latest ? (
            <Link
              href={`/firma/gespraeche/${latest.id}`}
              className="grid gap-1 rounded-xl border-l-4 border-pax-purple bg-light-purple px-5 py-4 text-deep-purple hover:underline"
            >
              <span className="text-xs font-medium">{tFocus("nextStep")}</span>
              <span className="font-medium">{nextStep}</span>
            </Link>
          ) : null}
          {detail.handovers.length > 0 ? (
            <Section id="handovers">
              <HandoversSection detail={detail} conversationTitles={titles} />
            </Section>
          ) : null}
          {detail.leads.length > 0 ? (
            <Section id="leads">
              <LeadsSection detail={detail} locale={locale} conversationTitles={titles} />
            </Section>
          ) : null}
          {detail.handovers.length === 0 && detail.leads.length === 0 ? (
            <p className="rounded-xl bg-gray-1 px-5 py-4 text-fg-muted">{tFocus("nothingOpen")}</p>
          ) : null}
          <Section id="conversations">
            <ConversationsSection detail={detail} />
          </Section>
          <div className="grid gap-3">
            <TimelineSection detail={detail} collapsed />
            <CommunicationsSection detail={detail} collapsed />
            {detail.recommendations.length > 0 ? (
              <RecommendationsSection detail={detail} locale={locale} collapsed />
            ) : null}
            <ApplicationsSection detail={detail} locale={locale} collapsed />
            <DocumentsSection detail={detail} collapsed />
          </div>
        </div>
        <div className="grid min-w-0 content-start gap-6">
          <Section id="followups">
            <CustomerFollowUpsSlot customerId={customer.id} locale={locale} />
          </Section>
          <ProfileSection detail={detail} locale={locale} asOf={now} />
        </div>
      </PageBody>
    </>
  );
}

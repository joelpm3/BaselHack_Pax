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
  ConversationsSection,
  TimelineSection,
} from "@/components/firma/customer/sections";
import { KindMark } from "@/components/firma/kind-mark";
import { LiveRefresh, LiveStatus } from "@/components/firma/live-events";
import { LoadingBlock, PageBody } from "@/components/firma/page-parts";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { requireAdvisor } from "@/lib/firma/auth";
import { getCustomerDetail } from "@/lib/firma/customers";
import { displayName } from "@/lib/firma/names";
import { cn } from "@/lib/utils";

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

/** Anchored section: the customer view is linked into from leads, handovers and the overview. */
function Section({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div id={id} className="min-w-0 scroll-mt-20 lg:scroll-mt-6">
      {children}
    </div>
  );
}

function Fact({
  href,
  kind,
  label,
  value,
  alert = false,
}: {
  href: string;
  kind?: "handover" | "lead";
  label: string;
  value: string;
  alert?: boolean;
}) {
  return (
    <a
      href={href}
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-xl border px-4 py-3 hover:bg-gray-1",
        alert ? "border-2 border-warning" : "border-line",
      )}
    >
      {kind ? <KindMark kind={kind} /> : null}
      <span className="grid min-w-0">
        <span className="text-xl leading-tight font-bold tabular-nums">{value}</span>
        <span className="truncate text-fg-muted">{label}</span>
      </span>
    </a>
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
  const [t, tx, tCommon, format, locale] = await Promise.all([
    getTranslations("firmaCustomers.detail"),
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
  const openHandovers = detail.handovers.filter((h) => h.status === "open").length;
  const openLeads = detail.leads.filter((l) => l.status !== "won" && l.status !== "lost").length;
  const lastContact = detail.conversations[0]
    ? (detail.conversations[0].lastMessageAt ?? detail.conversations[0].createdAt)
    : null;
  const titles = Object.fromEntries(detail.conversations.map((c) => [c.id, c.title]));

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
      <header className="grid gap-4 border-b border-line px-4 py-5 sm:px-6 lg:px-8">
        <div className="grid gap-1.5">
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
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Fact
            href="#handovers"
            kind="handover"
            value={String(openHandovers)}
            label={t("facts.handovers", { count: openHandovers })}
            alert={openHandovers > 0}
          />
          <Fact
            href="#leads"
            kind="lead"
            value={String(openLeads)}
            label={t("facts.leads", { count: openLeads })}
          />
          <Fact
            href="#conversations"
            value={String(detail.conversations.length)}
            label={t("facts.conversations", { count: detail.conversations.length })}
          />
          <Fact
            href="#timeline"
            value={lastContact ? format.relativeTime(lastContact, now) : "–"}
            label={t("facts.lastContact")}
          />
        </div>
      </header>

      <PageBody className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] xl:grid-cols-[minmax(0,1fr)_28rem]">
        <div className="grid min-w-0 content-start gap-6">
          <Section id="handovers">
            <HandoversSection
              detail={detail}
              conversationTitles={titles}
              emptyLabel={t("noHandovers")}
            />
          </Section>
          <Section id="leads">
            <LeadsSection
              detail={detail}
              locale={locale}
              conversationTitles={titles}
              emptyLabel={t("noLeads")}
            />
          </Section>
          <Section id="conversations">
            <ConversationsSection detail={detail} locale={locale} />
          </Section>
          {detail.recommendations.length > 0 ? (
            <RecommendationsSection detail={detail} locale={locale} />
          ) : null}
          <ApplicationsSection detail={detail} locale={locale} />
          <Section id="timeline">
            <TimelineSection detail={detail} />
          </Section>
        </div>
        <div className="grid min-w-0 content-start gap-6">
          <ProfileSection detail={detail} locale={locale} asOf={now} />
          <CustomerFollowUpsSlot customerId={customer.id} locale={locale} />
          <Section id="communications">
            <CommunicationsSection detail={detail} />
          </Section>
          <DocumentsSection detail={detail} />
        </div>
      </PageBody>
    </>
  );
}

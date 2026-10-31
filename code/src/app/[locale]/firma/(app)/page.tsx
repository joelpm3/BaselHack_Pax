import { Bot, Phone } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { useTranslations } from "next-intl";
import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { type ReactNode, Suspense, use } from "react";
import { LeadTypeBadge, PriorityBadge } from "@/components/firma/badges";
import { BarList, ColumnChart, type Segment, SegmentBar } from "@/components/firma/charts";
import { CustomerLink, customerHref } from "@/components/firma/customer-link";
import { Funnel } from "@/components/firma/funnel";
import { KindDefinition, KindMark } from "@/components/firma/kind-mark";
import { LiveRefresh, LiveStatus } from "@/components/firma/live-events";
import { LoadingBlock, PageBody, PageHeader, Panel } from "@/components/firma/page-parts";
import { ScopeSwitch } from "@/components/firma/scope-switch";
import { hrefWith } from "@/components/firma/url";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import {
  LEAD_TYPES,
  type LeadType,
  type Locale,
  SENTIMENTS,
  type Sentiment,
  TOPICS,
  type Topic,
} from "@/lib/domain/taxonomy";
import { type ActionQueue, getActionQueue } from "@/lib/firma/action-queue";
import { parseScope, type Scope } from "@/lib/firma/aggregate";
import { requireAdvisor } from "@/lib/firma/auth";
import { getOverview, type Overview } from "@/lib/firma/overview";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/firma">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale, namespace: "firma.nav" });
  return { title: t("overview") };
}

export default function OverviewPage({ params, searchParams }: PageProps<"/[locale]/firma">) {
  setRequestLocale(use(params).locale);
  const t = useTranslations("firma.overview");
  const tQueue = useTranslations("firmaCustomers.overview");
  return (
    <>
      <PageHeader title={t("title")} description={tQueue("description")} actions={<LiveStatus />} />
      <Suspense fallback={<LoadingBlock label={t("title")} />}>
        <OverviewContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const SENTIMENT_COLORS: Record<Sentiment, string> = {
  positive: "var(--color-chart-1)",
  neutral: "var(--color-gray-4)",
  mixed: "var(--color-chart-4)",
  negative: "var(--color-chart-6)",
};

async function OverviewContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdvisor();
  await connection();
  const scope = parseScope((await searchParams).scope);
  const now = new Date();
  const queue = getActionQueue(scope);
  const data = getOverview(scope, now);
  const [locale, t] = await Promise.all([
    getLocale() as Promise<Locale>,
    getTranslations("firmaCustomers.overview"),
  ]);
  return (
    <PageBody className="grid gap-8">
      <LiveRefresh types={["conversation", "analysis", "lead", "handover"]} intervalMs={3000} />
      <div>
        <ScopeSwitch path="/firma" scope={scope} />
      </div>
      <ActNow queue={queue} scope={scope} now={now} />
      <section aria-labelledby="overview-figures" className="grid gap-6">
        <h2 id="overview-figures" className="text-lg font-bold">
          {t("figures")}
        </h2>
        <Kpis data={data} />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <FunnelPanel data={data} />
          <div className="grid content-start gap-6">
            <TrendPanel data={data} locale={locale} />
            <SentimentPanel data={data} />
          </div>
        </div>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <FaqPanel data={data} locale={locale} />
          <div className="grid content-start gap-6">
            <TopicsPanel data={data} />
            <PainPointsPanel data={data} />
          </div>
        </div>
      </section>
    </PageBody>
  );
}

const waitFormat = {
  day: "numeric",
  month: "numeric",
  hour: "2-digit",
  minute: "2-digit",
} as const;

/** The first thing on the dashboard: who needs a person now, then whom to call for sales. */
async function ActNow({ queue, scope, now }: { queue: ActionQueue; scope: Scope; now: Date }) {
  const [t, tChannel, tType, tCommon, format] = await Promise.all([
    getTranslations("firmaCustomers.overview"),
    getTranslations("firma.taxonomy.channel"),
    getTranslations("common.taxonomy.leadType"),
    getTranslations("firma.common"),
    getFormatter(),
  ]);
  const scopeParam = { scope: scope === "all" ? null : scope };
  const counts = queue.handoverCounts;
  const typeLabel = (type: string) =>
    LEAD_TYPES.includes(type as LeadType) ? tType(type as LeadType) : type;
  return (
    <section aria-labelledby="act-now" className="grid gap-4">
      <h2 id="act-now" className="text-lg font-bold">
        {t("actNow")}
      </h2>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section
          aria-labelledby="queue-handovers"
          className="grid min-w-0 content-start gap-4 rounded-xl border-2 border-warning p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 gap-3">
              <KindMark kind="handover" />
              <div className="grid min-w-0 gap-0.5">
                <h3 id="queue-handovers" className="text-base font-bold">
                  {t("handovers.title", { count: counts.open })}
                </h3>
                <KindDefinition kind="handover" />
              </div>
            </div>
            {counts.open > 0 ? (
              <p className="text-fg-muted">
                {t("handovers.counts", { urgent: counts.urgent, unassigned: counts.unassigned })}
              </p>
            ) : null}
          </div>
          {queue.handovers.length === 0 ? (
            <p className="rounded-m bg-gray-1 px-4 py-3">{t("handovers.empty")}</p>
          ) : (
            <ol className="-my-1 divide-y divide-gray-2">
              {queue.handovers.map((h) => (
                <li key={h.id} className="grid gap-1.5 py-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {h.urgency === "high" ? (
                      <Badge tone="error">{t("handovers.urgent")}</Badge>
                    ) : null}
                    <CustomerLink
                      customerId={h.customerId}
                      firstName={h.firstName}
                      lastName={h.lastName}
                      city={h.city}
                      section="handovers"
                    />
                    {h.isSimulated ? (
                      <Bot aria-label={tCommon("simulated")} className="size-3.5 text-fg-muted" />
                    ) : null}
                    <span
                      className="ml-auto text-xs whitespace-nowrap text-fg-muted"
                      title={format.dateTime(h.createdAt, waitFormat)}
                    >
                      {t("handovers.waiting", { time: format.relativeTime(h.createdAt, now) })}
                    </span>
                  </div>
                  <p className="line-clamp-2">{h.reason}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-fg-muted">
                    {h.preferredChannel || h.preferredTime ? (
                      <span className="inline-flex items-center gap-1">
                        <Phone aria-hidden className="size-3.5" />
                        {[h.preferredChannel ? tChannel(h.preferredChannel) : null, h.preferredTime]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    ) : null}
                    <span>{h.assignee ?? tCommon("unassigned")}</span>
                    {h.leads.map((lead) => (
                      <Link
                        key={lead.id}
                        href={customerHref(h.customerId, "leads")}
                        className="rounded-full bg-light-purple px-2.5 py-0.5 text-xs font-medium text-deep-purple hover:underline"
                      >
                        {t("handovers.alsoLead", { type: typeLabel(lead.type), score: lead.score })}
                      </Link>
                    ))}
                    <Link
                      href={`/firma/gespraeche/${h.conversationId}`}
                      className="text-contrast-green hover:underline sm:ml-auto"
                    >
                      {t("openConversation")}
                    </Link>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {counts.open > queue.handovers.length ? (
            <Link
              href={hrefWith("/firma/uebergaben", scopeParam)}
              className="justify-self-start font-medium text-contrast-green hover:underline"
            >
              {t("handovers.all", { count: counts.open })}
            </Link>
          ) : null}
        </section>

        <section
          aria-labelledby="queue-leads"
          className="grid min-w-0 content-start gap-4 rounded-xl border border-line p-4 sm:p-5"
        >
          <div className="flex min-w-0 gap-3">
            <KindMark kind="lead" />
            <div className="grid min-w-0 gap-0.5">
              <h3 id="queue-leads" className="text-base font-bold">
                {t("leads.title", { count: queue.hotLeadCount })}
              </h3>
              <KindDefinition kind="lead" />
            </div>
          </div>
          {queue.hotLeads.length === 0 ? (
            <p className="rounded-m bg-gray-1 px-4 py-3">{t("leads.empty")}</p>
          ) : (
            <ol className="-my-1 divide-y divide-gray-2">
              {queue.hotLeads.map((lead) => (
                <li key={lead.id} className="grid gap-1.5 py-3">
                  <div className="flex items-center gap-3">
                    <CustomerLink
                      customerId={lead.customerId}
                      firstName={lead.firstName}
                      lastName={lead.lastName}
                      city={lead.city}
                      section="leads"
                    />
                    {lead.isSimulated ? (
                      <Bot aria-label={tCommon("simulated")} className="size-3.5 text-fg-muted" />
                    ) : null}
                    <span className="ml-auto text-lg leading-none font-bold tabular-nums">
                      <span className="sr-only">{t("leads.score")} </span>
                      {lead.score}
                    </span>
                  </div>
                  <p className="line-clamp-2">{lead.reasonToCall}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <PriorityBadge priority={lead.priority} />
                    <LeadTypeBadge type={lead.type} />
                    <span className="text-fg-muted">{lead.assignee ?? tCommon("unassigned")}</span>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              href={hrefWith("/firma/leads", scopeParam)}
              className="font-medium text-contrast-green hover:underline"
            >
              {t("leads.all")}
            </Link>
            {queue.hotLeadsWithHandover > 0 ? (
              <span className="text-xs text-fg-muted">
                {t("leads.withHandover", { count: queue.hotLeadsWithHandover })}
              </span>
            ) : null}
          </div>
        </section>
      </div>
    </section>
  );
}

function Kpi({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  return (
    <div className="grid content-start gap-1 bg-surface px-5 py-4">
      <span className="text-fg-muted">{label}</span>
      <span className="text-3xl font-bold leading-tight">{value}</span>
      {children ? <div className="text-xs text-fg-muted">{children}</div> : null}
    </div>
  );
}

function Kpis({ data }: { data: Overview }) {
  const t = useTranslations("firma.overview.kpi");
  const tQueue = useTranslations("firmaCustomers.overview");
  return (
    <section
      aria-label={t("label")}
      className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-4"
    >
      <Kpi label={t("conversations")} value={String(data.totals.total)}>
        {t("today", { count: data.totals.today })}
      </Kpi>
      <Kpi label={t("live")} value={String(data.totals.live)}>
        <Link href="/firma/live" className="text-contrast-green hover:underline">
          {t("openLive")}
        </Link>
      </Kpi>
      <Kpi label={tQueue("openLeads")} value={String(data.openLeads)}>
        <Link href="/firma/leads" className="text-contrast-green hover:underline">
          {tQueue("toPipeline")}
        </Link>
      </Kpi>
      <Kpi label={t("nps")} value={data.nps.nps === null ? "–" : String(data.nps.nps)}>
        {data.nps.responses > 0
          ? t("npsDetail", { average: data.nps.average ?? 0, count: data.nps.responses })
          : t("npsNone")}
      </Kpi>
    </section>
  );
}

function FunnelPanel({ data }: { data: Overview }) {
  const t = useTranslations("firma.overview.funnel");
  return (
    <Panel title={t("title")} description={t("description", { abandoned: data.totals.abandoned })}>
      <Funnel rows={data.funnel} />
    </Panel>
  );
}

async function TrendPanel({ data, locale }: { data: Overview; locale: Locale }) {
  const t = await getTranslations("firma.overview.trend");
  const format = await getFormatter({ locale });
  const columns = data.perDay.map((d) => {
    const date = new Date(`${d.day}T12:00:00Z`);
    return {
      key: d.day,
      value: d.count,
      label: format.dateTime(date, { weekday: "short", day: "numeric", month: "short" }),
      shortLabel: format.dateTime(date, { day: "numeric", month: "numeric" }),
    };
  });
  return (
    <Panel title={t("title")} description={t("description")}>
      <ColumnChart columns={columns} ariaLabel={t("title")} />
    </Panel>
  );
}

function SentimentPanel({ data }: { data: Overview }) {
  const t = useTranslations("firma.overview.sentiment");
  const tS = useTranslations("common.taxonomy.sentiment");
  const counts = Object.fromEntries(data.sentiment.map((s) => [s.key, s.count]));
  const segments: Segment[] = SENTIMENTS.map((s) => ({
    key: s,
    label: tS(s),
    value: counts[s] ?? 0,
    color: SENTIMENT_COLORS[s],
  }));
  return (
    <Panel title={t("title")}>
      <SegmentBar segments={segments} emptyLabel={t("empty")} />
    </Panel>
  );
}

function TopicsPanel({ data }: { data: Overview }) {
  const t = useTranslations("firma.overview.topics");
  const tTopic = useTranslations("common.taxonomy.topics");
  return (
    <Panel title={t("title")} description={t("description")}>
      <BarList
        emptyLabel={t("empty")}
        items={data.topTopics.map((x) => ({ key: x.key, label: tTopic(x.key), value: x.count }))}
      />
    </Panel>
  );
}

function FaqPanel({ data, locale }: { data: Overview; locale: Locale }) {
  const t = useTranslations("firma.overview.faq");
  const tTopic = useTranslations("common.taxonomy.topics");
  const max = Math.max(...data.topFaq.map((f) => f.count), 1);
  return (
    <Panel title={t("title")} description={t("description")}>
      {data.topFaq.length === 0 ? (
        <p className="py-4 text-fg-muted">{t("empty")}</p>
      ) : (
        <ol className="grid gap-x-8 gap-y-3 md:grid-cols-2">
          {data.topFaq.map((faq) => {
            const text = faq.translations?.[locale] ?? faq.canonicalText;
            const topic = TOPICS.includes(faq.topic as Topic)
              ? tTopic(faq.topic as Topic)
              : faq.topic;
            return (
              <li key={faq.id} className="grid gap-1">
                <div className="flex items-start justify-between gap-3">
                  <span>{text}</span>
                  <span className="shrink-0 font-medium tabular-nums">{faq.count}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 bg-gray-1">
                    <div
                      className="h-full rounded-r-[4px] bg-chart-3"
                      style={{ width: `${(faq.count / max) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-fg-muted">{topic}</span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}

function PainPointsPanel({ data }: { data: Overview }) {
  const t = useTranslations("firma.overview.painPoints");
  return (
    <Panel title={t("title")} description={t("description")}>
      {data.painPoints.length === 0 ? (
        <p className="py-4 text-fg-muted">{t("empty")}</p>
      ) : (
        <ul className="grid gap-2">
          {data.painPoints.map((p, i) => (
            <li key={`${p.conversationId}-${i}`} className="flex items-start gap-2.5">
              <span aria-hidden className="mt-1.5 size-1.5 shrink-0 bg-chart-6" />
              <Link href={`/firma/gespraeche/${p.conversationId}`} className="hover:underline">
                {p.text}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

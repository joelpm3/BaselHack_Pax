import { Bot } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { useTranslations } from "next-intl";
import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { type ReactNode, Suspense, use } from "react";
import { ConversationStatusBadge } from "@/components/firma/badges";
import { BarList, ColumnChart, type Segment, SegmentBar } from "@/components/firma/charts";
import { CustomerLabel } from "@/components/firma/customer-label";
import { Funnel } from "@/components/firma/funnel";
import { LiveRefresh, LiveStatus } from "@/components/firma/live-events";
import { LoadingBlock, PageBody, PageHeader, Panel } from "@/components/firma/page-parts";
import { ScopeSwitch } from "@/components/firma/scope-switch";
import { StageSquares } from "@/components/firma/stage-squares";
import { Link } from "@/i18n/navigation";
import {
  LEAD_TYPES,
  type Locale,
  SENTIMENTS,
  type Sentiment,
  TOPICS,
  type Topic,
} from "@/lib/domain/taxonomy";
import { parseScope } from "@/lib/firma/aggregate";
import { requireAdvisor } from "@/lib/firma/auth";
import { getOverview, type Overview } from "@/lib/firma/overview";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/firma">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale, namespace: "firma.nav" });
  return { title: t("overview") };
}

export default function OverviewPage({ params, searchParams }: PageProps<"/[locale]/firma">) {
  setRequestLocale(use(params).locale);
  const t = useTranslations("firma.overview");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} actions={<LiveStatus />} />
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
  const data = getOverview(scope, new Date());
  const locale = (await getLocale()) as Locale;
  return (
    <PageBody className="grid gap-6">
      <LiveRefresh types={["conversation", "analysis", "lead", "handover"]} intervalMs={3000} />
      <div>
        <ScopeSwitch path="/firma" scope={scope} />
      </div>
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
        <TopicsPanel data={data} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <PainPointsPanel data={data} />
        <LifeEventsPanel data={data} />
        <IntentPanel data={data} />
      </div>
      <RecentPanel data={data} />
    </PageBody>
  );
}

function Kpi({
  label,
  value,
  children,
  className,
}: {
  label: string;
  value: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid content-start gap-1 bg-surface px-5 py-4", className)}>
      <span className="text-fg-muted">{label}</span>
      <span className="text-3xl font-bold leading-tight">{value}</span>
      {children ? <div className="text-xs text-fg-muted">{children}</div> : null}
    </div>
  );
}

function Kpis({ data }: { data: Overview }) {
  const t = useTranslations("firma.overview.kpi");
  const tType = useTranslations("common.taxonomy.leadType");
  const leads = Object.fromEntries(data.leadsByType.map((l) => [l.key, l.count]));
  const leadTotal = data.leadsByType.reduce((s, l) => s + l.count, 0);
  return (
    <section
      aria-label={t("label")}
      className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-5"
    >
      <Kpi label={t("conversations")} value={String(data.totals.total)}>
        {t("today", { count: data.totals.today })}
      </Kpi>
      <Kpi label={t("live")} value={String(data.totals.live)}>
        <Link href="/firma/live" className="text-contrast-green hover:underline">
          {t("openLive")}
        </Link>
      </Kpi>
      <Kpi label={t("leads")} value={String(leadTotal)}>
        <ul className="grid gap-0.5">
          {LEAD_TYPES.map((type) => (
            <li key={type} className="flex justify-between gap-2">
              <span>{tType(type)}</span>
              <span className="tabular-nums text-fg">{leads[type] ?? 0}</span>
            </li>
          ))}
        </ul>
      </Kpi>
      <Kpi label={t("handoversOpen")} value={String(data.handoversOpen)}>
        <Link href="/firma/uebergaben" className="text-contrast-green hover:underline">
          {t("openHandovers")}
        </Link>
      </Kpi>
      <Kpi
        label={t("nps")}
        value={data.nps.nps === null ? "–" : String(data.nps.nps)}
        className="max-md:col-span-2"
      >
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

function LifeEventsPanel({ data }: { data: Overview }) {
  const t = useTranslations("firma.overview.lifeEvents");
  const tEvent = useTranslations("common.taxonomy.lifeEvent");
  return (
    <Panel title={t("title")}>
      <BarList
        emptyLabel={t("empty")}
        items={data.topLifeEvents.map((x) => ({
          key: x.key,
          label: tEvent(x.key),
          value: x.count,
        }))}
      />
    </Panel>
  );
}

function IntentPanel({ data }: { data: Overview }) {
  const t = useTranslations("firma.overview.intent");
  const tIntent = useTranslations("common.taxonomy.intent");
  const counts = Object.fromEntries(data.intent.map((s) => [s.key, s.count]));
  const order = ["informing", "exploring", "comparing", "ready"] as const;
  const hasData = data.intent.length > 0;
  return (
    <Panel title={t("title")} description={t("description")}>
      <BarList
        emptyLabel={t("empty")}
        items={
          hasData ? order.map((k) => ({ key: k, label: tIntent(k), value: counts[k] ?? 0 })) : []
        }
      />
    </Panel>
  );
}

async function RecentPanel({ data }: { data: Overview }) {
  const [t, tStage, tCommon, format] = await Promise.all([
    getTranslations("firma.overview.recent"),
    getTranslations("common.taxonomy.stages"),
    getTranslations("firma.common"),
    getFormatter(),
  ]);
  return (
    <Panel
      title={t("title")}
      actions={
        <Link href="/firma/gespraeche" className="text-contrast-green hover:underline">
          {t("all")}
        </Link>
      }
    >
      {data.recent.length === 0 ? (
        <p className="py-4 text-fg-muted">{t("empty")}</p>
      ) : (
        <ul className="-my-2 divide-y divide-gray-2">
          {data.recent.map((c) => (
            <li key={c.id}>
              <Link
                href={`/firma/gespraeche/${c.id}`}
                className="grid items-center gap-x-4 gap-y-1 py-2.5 hover:bg-gray-1 md:grid-cols-[minmax(0,14rem)_auto_minmax(0,1fr)_auto_auto]"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <CustomerLabel
                    firstName={c.firstName}
                    lastName={c.lastName}
                    city={c.city}
                    className="font-medium"
                  />
                  {c.isSimulated ? (
                    <Bot
                      aria-label={tCommon("simulated")}
                      className="size-3.5 shrink-0 text-fg-muted"
                    />
                  ) : null}
                </span>
                <StageSquares stage={c.stage} label={tStage(c.stage)} />
                <span className="min-w-0 truncate text-fg-muted">{c.title ?? tStage(c.stage)}</span>
                <span>
                  <ConversationStatusBadge status={c.status} />
                </span>
                <span className="text-xs whitespace-nowrap text-fg-muted tabular-nums">
                  {format.dateTime(c.lastMessageAt ?? c.createdAt, {
                    hour: "2-digit",
                    minute: "2-digit",
                    day: "numeric",
                    month: "numeric",
                  })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// One job: show the team, in aggregate numbers only, what waits today, how Clara is doing and
// what customers bring up. No individual people here; every number links to its own page.
import { CalendarClock } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { useFormatter, useTranslations } from "next-intl";
import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { type ReactNode, Suspense, use } from "react";
import { Funnel } from "@/components/firma/funnel";
import { KindMark } from "@/components/firma/kind-mark";
import { LiveRefresh } from "@/components/firma/live-events";
import { LoadingBlock, PageBody, PageHeader, SegmentedLinks } from "@/components/firma/page-parts";
import { ScopeSwitch } from "@/components/firma/scope-switch";
import { hrefWith } from "@/components/firma/url";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/lib/domain/taxonomy";
import { PERIODS, type Period, parsePeriod, parseScope, type Scope } from "@/lib/firma/aggregate";
import { requireAdvisor } from "@/lib/firma/auth";
import { getOverview, getTodayCounts, type Overview } from "@/lib/firma/overview";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/firma">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale, namespace: "firma.nav" });
  return { title: t("overview") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function OverviewPage({ params, searchParams }: PageProps<"/[locale]/firma">) {
  setRequestLocale(use(params).locale);
  const t = useTranslations("firma.overview");
  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          <Suspense fallback={null}>
            <Controls searchParams={searchParams} />
          </Suspense>
        }
      />
      <Suspense fallback={<LoadingBlock label={t("title")} />}>
        <OverviewContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function readFilters(searchParams: SearchParams) {
  const params = await searchParams;
  return { scope: parseScope(params.scope), period: parsePeriod(params.period) };
}

/** Period and real/simulated switches; both stay in the URL so the view can be shared. */
async function Controls({ searchParams }: { searchParams: SearchParams }) {
  const { scope, period } = await readFilters(searchParams);
  const t = await getTranslations("firmaFocus.overview");
  const keep = { scope: scope === "all" ? null : scope, period: period === "30" ? null : period };
  return (
    <>
      <SegmentedLinks
        label={t("periodLabel")}
        items={PERIODS.map((p) => ({
          key: p,
          label: t(`period.${p}`),
          href: hrefWith("/firma", { ...keep, period: p === "30" ? null : p }),
          active: p === period,
        }))}
      />
      <ScopeSwitch path="/firma" scope={scope} extra={{ period: keep.period }} />
    </>
  );
}

async function OverviewContent({ searchParams }: { searchParams: SearchParams }) {
  await requireAdvisor();
  await connection();
  const { scope, period } = await readFilters(searchParams);
  const now = new Date();
  const today = getTodayCounts(scope);
  const data = getOverview(scope, period, now);
  const locale = (await getLocale()) as Locale;
  return (
    <PageBody className="grid gap-10">
      <LiveRefresh types={["conversation", "analysis", "lead", "handover"]} intervalMs={3000} />
      <TodaySection today={today} scope={scope} now={now} />
      <ClaraSection data={data} scope={scope} period={period} />
      <TopicsSection data={data} scope={scope} period={period} locale={locale} />
    </PageBody>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-4">
      <h2 id={id} className="text-paragraph-l font-bold">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A queue as one big number; the whole tile opens the queue. */
function QueueTile({
  href,
  mark,
  value,
  label,
  note,
  alert = false,
}: {
  href: string;
  mark: ReactNode;
  value: number;
  label: string;
  note?: string | null;
  alert?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group grid grid-cols-[3.5rem_minmax(0,1fr)] content-start items-start gap-x-3 gap-y-3 rounded-xl border p-4 hover:bg-gray-1 md:grid-cols-1 md:p-5",
        alert ? "border-2 border-warning" : "border-line",
      )}
    >
      <span className="hidden md:block">{mark}</span>
      <span className="text-heading-xl leading-none font-bold tabular-nums md:hidden">{value}</span>
      <span className="grid gap-0.5">
        <span className="hidden text-heading-xl leading-none font-bold tabular-nums md:block">
          {value}
        </span>
        <span className="font-medium group-hover:underline">{label}</span>
        {note ? <span className="text-fg-muted md:mt-2">{note}</span> : null}
      </span>
    </Link>
  );
}

async function TodaySection({
  today,
  scope,
  now,
}: {
  today: ReturnType<typeof getTodayCounts>;
  scope: Scope;
  now: Date;
}) {
  const [t, format] = await Promise.all([getTranslations("firmaFocus.overview"), getFormatter()]);
  const scopeParam = { scope: scope === "all" ? null : scope };
  const { handovers } = today;
  const handoverNote =
    handovers.open > 0 && handovers.oldest
      ? [
          t("today.oldest", { time: format.relativeTime(handovers.oldest, now) }),
          handovers.urgent > 0 ? t("today.urgent", { count: handovers.urgent }) : null,
        ]
          .filter(Boolean)
          .join(", ")
      : t("today.nobodyWaiting");
  return (
    <Section id="today" title={t("today.title")}>
      <div className="grid gap-4 md:grid-cols-3">
        <QueueTile
          href={hrefWith("/firma/uebergaben", scopeParam)}
          mark={<KindMark kind="handover" />}
          value={handovers.open}
          label={t("today.handovers", { count: handovers.open })}
          note={handoverNote}
          alert={handovers.open > 0}
        />
        <QueueTile
          href="/firma/wiedervorlagen"
          mark={
            <span aria-hidden className="grid size-7 place-items-center bg-gray-1">
              <CalendarClock className="size-4" />
            </span>
          }
          value={today.dueFollowUps}
          label={t("today.followUps", { count: today.dueFollowUps })}
          note={t("today.followUpsNote")}
        />
        <QueueTile
          href={hrefWith("/firma/leads", { ...scopeParam, hot: 1 })}
          mark={<KindMark kind="lead" />}
          value={today.hotLeads}
          label={t("today.hotLeads", { count: today.hotLeads })}
          note={t("today.hotLeadsNote")}
        />
      </div>
    </Section>
  );
}

function Stat({ value, label, note }: { value: string; label: string; note?: string | null }) {
  return (
    <div className="grid content-start gap-0.5">
      <dt className="order-2 text-fg-muted">{label}</dt>
      <dd className="order-1 text-heading-m leading-tight font-bold tabular-nums">{value}</dd>
      {note ? <dd className="order-3 text-paragraph-xs text-fg-muted">{note}</dd> : null}
    </div>
  );
}

function ClaraSection({ data, scope, period }: { data: Overview; scope: Scope; period: Period }) {
  const t = useTranslations("firmaFocus.overview");
  const tStage = useTranslations("common.taxonomy.stages");
  const format = useFormatter();
  const pct = (v: number) => format.number(v, { style: "percent", maximumFractionDigits: 0 });
  const { totals, nps, dropOff } = data;
  return (
    <Section id="clara" title={t("clara.title", { period: t(`periodLong.${period}`) })}>
      <div className="grid gap-6 rounded-xl border border-line p-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-10">
        <div className="grid content-start gap-6">
          <dl className="grid grid-cols-3 gap-4">
            <Stat value={String(totals.total)} label={t("clara.conversations")} />
            <Stat
              value={totals.total > 0 ? pct(totals.finished / totals.total) : "–"}
              label={t("clara.finished")}
              note={t("clara.finishedNote")}
            />
            <Stat
              value={nps.nps === null ? "–" : String(nps.nps)}
              label={t("clara.nps")}
              note={nps.responses > 0 ? t("clara.npsCount", { count: nps.responses }) : null}
            />
          </dl>
          {dropOff ? (
            <p className="grid gap-1 border-l-2 border-warning pl-3">
              <span className="text-fg-muted">{t("clara.dropOff")}</span>
              <span className="font-medium">
                {t("clara.dropOffValue", {
                  stage: tStage(dropOff.stage),
                  count: dropOff.count,
                  share: pct(dropOff.share),
                })}
              </span>
            </p>
          ) : null}
          <Link
            href={hrefWith("/firma/gespraeche", {
              scope: scope === "all" ? null : scope,
              period: period === "all" ? null : period,
            })}
            className="justify-self-start font-medium text-contrast-green hover:underline"
          >
            {t("clara.allConversations")}
          </Link>
        </div>
        <Funnel rows={data.funnel} dropStage={dropOff?.stage ?? null} />
      </div>
    </Section>
  );
}

/** A short ranked list: label, count and a thin bar; each item opens the matching list. */
function Ranked({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: Array<{ key: string; label: string; count?: number; href: string }>;
}) {
  const max = Math.max(...items.map((i) => i.count ?? 0), 1);
  return (
    <section className="grid content-start gap-3">
      <h3 className="font-bold">{title}</h3>
      {items.length === 0 ? (
        <p className="text-fg-muted">{empty}</p>
      ) : (
        <ol className="grid gap-3">
          {items.map((item) => (
            <li key={item.key} className="grid gap-1">
              <span className="flex items-baseline justify-between gap-3">
                <Link href={item.href} className="min-w-0 hover:underline">
                  {item.label}
                </Link>
                {item.count !== undefined ? (
                  <span className="shrink-0 font-medium tabular-nums">{item.count}</span>
                ) : null}
              </span>
              {item.count !== undefined ? (
                <span className="h-1.5 bg-gray-1">
                  <span
                    className="block h-full bg-pax-green"
                    style={{ width: `${(item.count / max) * 100}%` }}
                  />
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function TopicsSection({
  data,
  scope,
  period,
  locale,
}: {
  data: Overview;
  scope: Scope;
  period: Period;
  locale: Locale;
}) {
  const t = useTranslations("firmaFocus.overview");
  const tTopic = useTranslations("common.taxonomy.topics");
  const base = { scope: scope === "all" ? null : scope, period: period === "all" ? null : period };
  return (
    <Section id="moves" title={t("moves.title")}>
      <div className="grid gap-8 rounded-xl border border-line p-5 lg:grid-cols-3">
        <Ranked
          title={t("moves.topics")}
          empty={t("moves.empty")}
          items={data.topTopics.map((x) => ({
            key: x.key,
            label: tTopic(x.key),
            count: x.count,
            href: hrefWith("/firma/gespraeche", { ...base, topic: x.key }),
          }))}
        />
        <Ranked
          title={t("moves.questions")}
          empty={t("moves.emptyQuestions")}
          items={data.topFaq.map((f) => ({
            key: f.id,
            label: f.translations?.[locale] ?? f.canonicalText,
            count: f.count,
            href: hrefWith("/firma/gespraeche", { ...base, faq: f.id }),
          }))}
        />
        <Ranked
          title={t("moves.painPoints")}
          empty={t("moves.empty")}
          items={data.painPoints.map((p, i) => ({
            key: `${p.conversationId}-${i}`,
            label: p.text,
            href: `/firma/gespraeche/${p.conversationId}`,
          }))}
        />
      </div>
    </Section>
  );
}

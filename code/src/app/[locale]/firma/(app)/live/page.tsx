// One job: watch the conversations running right now (and those of the last 30 minutes) as
// they move through the stages; open one to read it.
import { Bot, Handshake, MessageSquare, UserRound } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { useTranslations } from "next-intl";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense, use } from "react";
import { ConversationStatusBadge } from "@/components/firma/badges";
import { LiveRefresh, LiveStatus } from "@/components/firma/live-events";
import { Flash, LiveFeed } from "@/components/firma/live-feed";
import { EmptyState, LoadingBlock, PageBody, PageHeader } from "@/components/firma/page-parts";
import { ScopeSwitch } from "@/components/firma/scope-switch";
import { StageSquares } from "@/components/firma/stage-squares";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { parseScope } from "@/lib/firma/aggregate";
import { requireAdvisor } from "@/lib/firma/auth";
import { getLiveConversations, type LiveConversation } from "@/lib/firma/conversations";
import { displayName } from "@/lib/firma/names";
import { LIVE_WINDOW_MS } from "@/lib/firma/overview";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/firma/live">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale, namespace: "firma.nav" });
  return { title: t("live") };
}

export default function LivePage({ params, searchParams }: PageProps<"/[locale]/firma/live">) {
  setRequestLocale(use(params).locale);
  const t = useTranslations("firma.live");
  return (
    <>
      <PageHeader title={t("title")} actions={<LiveStatus />} />
      <Suspense fallback={<LoadingBlock label={t("title")} />}>
        <LiveContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function LiveContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdvisor();
  await connection();
  const scope = parseScope((await searchParams).scope);
  const now = new Date();
  const rows = getLiveConversations(scope, now);
  const t = await getTranslations("firma.live");
  const tCommon = await getTranslations("firma.common");

  const isLive = (c: LiveConversation) =>
    c.status === "active" &&
    (c.lastMessageAt ?? c.createdAt).getTime() >= now.getTime() - LIVE_WINDOW_MS;
  const live = rows.filter(isLive);
  const recent = rows.filter((c) => !isLive(c));
  const labels = Object.fromEntries(
    rows.map((c) => [
      c.id,
      [displayName(c) ?? tCommon("anonymous"), c.city].filter(Boolean).join(" · "),
    ]),
  );

  return (
    <PageBody className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <LiveRefresh types={["conversation", "analysis", "lead", "handover"]} intervalMs={1200} />
      <div className="grid content-start gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-base">
            <span className="text-2xl font-bold tabular-nums">{live.length}</span>{" "}
            {t("runningNow", { count: live.length })}
          </p>
          <ScopeSwitch path="/firma/live" scope={scope} />
        </div>
        {live.length === 0 ? (
          <EmptyState title={t("emptyTitle")}>
            {t.rich("emptyBody", {
              link: (chunks) => (
                <Link href="/firma/simulation" className="text-contrast-green hover:underline">
                  {chunks}
                </Link>
              ),
            })}
          </EmptyState>
        ) : (
          <ul className="grid gap-3">
            {live.map((c) => (
              <LiveRow key={c.id} conversation={c} now={now} />
            ))}
          </ul>
        )}
        {recent.length > 0 ? (
          <section className="grid gap-3">
            <h2 className="text-base font-bold">{t("recentTitle")}</h2>
            <ul className="grid gap-3">
              {recent.map((c) => (
                <LiveRow key={c.id} conversation={c} now={now} muted />
              ))}
            </ul>
          </section>
        ) : null}
      </div>
      <aside className="xl:sticky xl:top-6 xl:self-start">
        <LiveFeed labels={labels} />
      </aside>
    </PageBody>
  );
}

async function LiveRow({
  conversation: c,
  now,
  muted = false,
}: {
  conversation: LiveConversation;
  now: Date;
  muted?: boolean;
}) {
  const [t, tStage, tCommon, format] = await Promise.all([
    getTranslations("firma.live"),
    getTranslations("common.taxonomy.stages"),
    getTranslations("firma.common"),
    getFormatter(),
  ]);
  const name = displayName(c);
  const last = c.lastMessage;
  return (
    <li>
      <Flash token={`${c.stage}:${c.status}:${c.handoverRequired}`} className="rounded-xl">
        <Link
          href={`/firma/gespraeche/${c.id}`}
          className={cn(
            "grid gap-3 rounded-xl border border-line p-4 transition-colors hover:border-pax-purple md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]",
            muted && "opacity-75",
          )}
        >
          <div className="grid content-start gap-1.5">
            <span className="flex items-center gap-2">
              {!muted ? (
                <span aria-hidden className="size-2 shrink-0 animate-pulse bg-pax-green" />
              ) : null}
              <span className="truncate font-medium">{name ?? tCommon("anonymous")}</span>
              {c.isSimulated ? (
                <Bot aria-label={tCommon("simulated")} className="size-4 shrink-0 text-fg-muted" />
              ) : null}
            </span>
            <span className="text-xs text-fg-muted tabular-nums">
              {t("messages", { count: c.messageCount })} ·{" "}
              {format.relativeTime(c.lastMessageAt ?? c.createdAt, now)}
            </span>
          </div>
          <div className="grid min-w-0 content-start gap-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <StageSquares stage={c.stage} label={tStage(c.stage)} />
              <span className="font-medium">{tStage(c.stage)}</span>
              {muted ? <ConversationStatusBadge status={c.status} /> : null}
              {c.handoverRequired ? (
                <Badge tone="warning">
                  <Handshake aria-hidden className="size-3" />
                  {t("handover")}
                </Badge>
              ) : null}
            </div>
            {last?.text ? (
              <p className="flex min-w-0 items-start gap-2">
                {last.role === "user" ? (
                  <UserRound
                    aria-label={t("customer")}
                    className="mt-0.5 size-4 shrink-0 text-fg-muted"
                  />
                ) : (
                  <MessageSquare
                    aria-label={t("advisor")}
                    className="mt-0.5 size-4 shrink-0 text-pax-purple"
                  />
                )}
                <span className="line-clamp-2 min-w-0">{last.text}</span>
              </p>
            ) : null}
          </div>
        </Link>
      </Flash>
    </li>
  );
}

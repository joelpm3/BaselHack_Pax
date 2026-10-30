import { Handshake } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { useTranslations } from "next-intl";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense, use } from "react";
import { ConversationStatusBadge, SentimentBadge, SimulatedBadge } from "@/components/firma/badges";
import { CustomerLabel } from "@/components/firma/customer-label";
import { LiveRefresh } from "@/components/firma/live-events";
import {
  EmptyState,
  LoadingBlock,
  PageBody,
  PageHeader,
  SegmentedLinks,
} from "@/components/firma/page-parts";
import { ScopeSwitch } from "@/components/firma/scope-switch";
import { StageSquares } from "@/components/firma/stage-squares";
import { hrefWith } from "@/components/firma/url";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { CONVERSATION_STATUSES } from "@/lib/domain/taxonomy";
import { parseScope } from "@/lib/firma/aggregate";
import { requireAdvisor } from "@/lib/firma/auth";
import { listConversations, parseStatus } from "@/lib/firma/conversations";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/firma/gespraeche">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale, namespace: "firma.nav" });
  return { title: t("conversations") };
}

export default function ConversationsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/firma/gespraeche">) {
  setRequestLocale(use(params).locale);
  const t = useTranslations("firma.conversations");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Suspense fallback={<LoadingBlock label={t("title")} />}>
        <ConversationsContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ConversationsContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdvisor();
  await connection();
  const params = await searchParams;
  const scope = parseScope(params.scope);
  const status = parseStatus(params.status);
  const rows = listConversations({ scope, status });
  const [t, tStatus, tStage, tTopic, tIntent, tMode, format] = await Promise.all([
    getTranslations("firma.conversations"),
    getTranslations("firma.taxonomy.conversationStatus"),
    getTranslations("common.taxonomy.stages"),
    getTranslations("common.taxonomy.topics"),
    getTranslations("common.taxonomy.intent"),
    getTranslations("firma.taxonomy.mode"),
    getFormatter(),
  ]);

  return (
    <PageBody className="grid gap-5">
      <LiveRefresh
        types={["conversation.started", "conversation.updated", "analysis"]}
        intervalMs={4000}
      />
      <div className="flex flex-wrap items-center gap-3">
        <ScopeSwitch path="/firma/gespraeche" scope={scope} extra={{ status }} />
        <SegmentedLinks
          label={t("statusFilter")}
          items={[null, ...CONVERSATION_STATUSES].map((s) => ({
            key: s ?? "all",
            label: s ? tStatus(s) : t("allStatuses"),
            href: hrefWith("/firma/gespraeche", {
              scope: scope === "all" ? null : scope,
              status: s,
            }),
            active: s === status,
          }))}
        />
        <span className="ml-auto text-fg-muted">{t("count", { count: rows.length })}</span>
      </div>

      {rows.length === 0 ? (
        <EmptyState title={t("emptyTitle")}>{t("emptyBody")}</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[60rem] border-collapse">
            <thead className="bg-gray-1 text-left text-xs text-fg-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  {t("col.customer")}
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  {t("col.topic")}
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  {t("col.stage")}
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  {t("col.signals")}
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  {t("col.status")}
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  {t("col.last")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t border-gray-2 align-top hover:bg-gray-1">
                  <td className="px-4 py-3">
                    <Link
                      href={`/firma/gespraeche/${c.id}`}
                      className="grid gap-0.5 hover:underline"
                    >
                      <CustomerLabel
                        firstName={c.firstName}
                        lastName={c.lastName}
                        city={c.city}
                        className="font-medium"
                      />
                      <span className="text-xs text-fg-muted">
                        {tMode(c.mode)} · {c.locale.toUpperCase()} ·{" "}
                        {t("messages", { count: c.messageCount })}
                      </span>
                    </Link>
                  </td>
                  <td className="max-w-80 px-4 py-3">
                    <p className="line-clamp-2">
                      {c.title ?? c.summary ?? (
                        <span className="text-fg-muted">{t("notAnalysed")}</span>
                      )}
                    </p>
                    {c.topics?.length ? (
                      <p className="mt-1 truncate text-xs text-fg-muted">
                        {c.topics.map((x) => tTopic(x)).join(", ")}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="grid gap-1">
                      <StageSquares stage={c.stage} label={tStage(c.stage)} />
                      <span className="text-xs text-fg-muted">{tStage(c.stage)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {c.intentStage ? <Badge tone="info">{tIntent(c.intentStage)}</Badge> : null}
                      {c.sentiment ? <SentimentBadge sentiment={c.sentiment} /> : null}
                      {c.handoverRequired ? (
                        <Badge tone="warning">
                          <Handshake aria-hidden className="size-3" />
                          {t("handover")}
                        </Badge>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <ConversationStatusBadge status={c.status} />
                      {c.isSimulated ? <SimulatedBadge /> : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-xs whitespace-nowrap text-fg-muted tabular-nums">
                    {format.dateTime(c.lastMessageAt ?? c.createdAt, {
                      day: "numeric",
                      month: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageBody>
  );
}

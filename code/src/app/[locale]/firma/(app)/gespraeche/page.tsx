// One job: find a conversation and open it. Newest first, searchable and filterable; the
// analysis lives on the conversation page.
import { Bot } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { useTranslations } from "next-intl";
import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense, use } from "react";
import { ConversationStatusBadge } from "@/components/firma/badges";
import { CustomerLabel } from "@/components/firma/customer-label";
import { FilterSelect } from "@/components/firma/filter-select";
import { LiveRefresh } from "@/components/firma/live-events";
import {
  EmptyState,
  FilterChip,
  ListSearch,
  LoadingBlock,
  PageBody,
  PageHeader,
  ShowMore,
} from "@/components/firma/page-parts";
import { ScopeSwitch } from "@/components/firma/scope-switch";
import { StageSquares } from "@/components/firma/stage-squares";
import { hrefWith } from "@/components/firma/url";
import { Link } from "@/i18n/navigation";
import { CONVERSATION_STATUSES, type Locale } from "@/lib/domain/taxonomy";
import { PAGE_SIZE, parseLimit } from "@/lib/firma/aggregate";
import { requireAdvisor } from "@/lib/firma/auth";
import {
  faqQuestion,
  listConversations,
  parseConversationFilters,
} from "@/lib/firma/conversations";

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
      <PageHeader title={t("title")} />
      <Suspense fallback={<LoadingBlock label={t("title")} />}>
        <ConversationsContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const PATH = "/firma/gespraeche";

async function ConversationsContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdvisor();
  await connection();
  const params = await searchParams;
  const now = new Date();
  const filters = parseConversationFilters(params, now);
  const limit = parseLimit(params.limit);
  const { rows, total } = listConversations(filters, limit);
  const [t, tFocus, tStatus, tStage, tTopic, format, locale] = await Promise.all([
    getTranslations("firma.conversations"),
    getTranslations("firmaFocus"),
    getTranslations("firma.taxonomy.conversationStatus"),
    getTranslations("common.taxonomy.stages"),
    getTranslations("common.taxonomy.topics"),
    getFormatter(),
    getLocale() as Promise<Locale>,
  ]);
  const current = {
    scope: filters.scope === "all" ? null : filters.scope,
    status: filters.status,
    topic: filters.topic,
    faq: filters.faq,
    period: filters.period,
    q: filters.query || null,
  };
  const without = (key: keyof typeof current) => hrefWith(PATH, { ...current, [key]: null });
  const faq = filters.faq ? faqQuestion(filters.faq) : null;

  return (
    <PageBody className="grid gap-5">
      <LiveRefresh
        types={["conversation.started", "conversation.updated", "analysis"]}
        intervalMs={4000}
      />
      <div className="flex flex-wrap items-end gap-3">
        <ListSearch
          label={tFocus("list.search")}
          placeholder={tFocus("conversations.searchPlaceholder")}
          value={filters.query}
          keep={{ ...current, q: null }}
        />
        <FilterSelect
          label={t("statusFilter")}
          path={PATH}
          param="status"
          value={filters.status ?? ""}
          params={{ ...current, status: null }}
          options={[
            { value: "", label: t("allStatuses") },
            ...CONVERSATION_STATUSES.map((s) => ({ value: s, label: tStatus(s) })),
          ]}
        />
        <ScopeSwitch path={PATH} scope={filters.scope} extra={{ ...current, scope: null }} />
      </div>

      {filters.topic || faq || filters.period ? (
        <div className="flex flex-wrap items-center gap-2">
          {filters.period ? (
            <FilterChip
              label={tFocus(`overview.periodLong.${filters.period}`)}
              clearHref={without("period")}
            />
          ) : null}
          {filters.topic ? (
            <FilterChip
              label={tFocus("conversations.topic", { topic: tTopic(filters.topic) })}
              clearHref={without("topic")}
            />
          ) : null}
          {faq ? (
            <FilterChip
              label={tFocus("conversations.question", {
                question: faq.translations?.[locale] ?? faq.canonicalText,
              })}
              clearHref={without("faq")}
            />
          ) : null}
        </div>
      ) : null}

      <p className="text-fg-muted">{t("count", { count: total })}</p>

      {rows.length === 0 ? (
        <EmptyState title={t("emptyTitle")}>{t("emptyBody")}</EmptyState>
      ) : (
        <ul className="divide-y divide-gray-2 rounded-xl border border-line">
          {rows.map((c) => (
            <li key={c.id}>
              <Link
                href={`/firma/gespraeche/${c.id}`}
                className="grid gap-x-6 gap-y-2 px-4 py-3 hover:bg-gray-1 md:grid-cols-[minmax(0,1fr)_14rem_8rem_7rem] md:items-center"
              >
                <span className="grid min-w-0 gap-0.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <CustomerLabel
                      firstName={c.firstName}
                      lastName={c.lastName}
                      city={c.city}
                      className="font-medium"
                    />
                    {c.isSimulated ? (
                      <Bot
                        aria-label={tFocus("list.simulated")}
                        className="size-3.5 shrink-0 text-fg-muted"
                      />
                    ) : null}
                  </span>
                  <span className="truncate text-fg-muted">{c.title ?? t("notAnalysed")}</span>
                </span>
                {/* One line on phones; three grid columns from md up. */}
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 md:contents">
                  <span className="flex items-center gap-2">
                    <StageSquares stage={c.stage} label={tStage(c.stage)} />
                    <span className="hidden truncate text-xs text-fg-muted md:inline">
                      {tStage(c.stage)}
                    </span>
                  </span>
                  <span>
                    <ConversationStatusBadge status={c.status} />
                  </span>
                  <span className="text-xs text-fg-muted tabular-nums md:text-right">
                    {format.dateTime(c.lastMessageAt ?? c.createdAt, {
                      day: "numeric",
                      month: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <ShowMore
        shown={rows.length}
        total={total}
        href={hrefWith(PATH, { ...current, limit: limit + PAGE_SIZE })}
      />
    </PageBody>
  );
}

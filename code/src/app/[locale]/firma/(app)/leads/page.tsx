// One job: decide which sales lead to call next, hottest first, and keep its status and owner
// current. Talking points and the score breakdown live on the conversation page.
import { Bot } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense, use } from "react";
import { PRIORITY_MARK } from "@/components/firma/badges";
import { AssignSelect, LeadStatusSelect } from "@/components/firma/controls";
import { CustomerLink, customerHref } from "@/components/firma/customer-link";
import { FilterSelect } from "@/components/firma/filter-select";
import { KindDefinition, KindMark } from "@/components/firma/kind-mark";
import { type KanbanLead, LeadsKanban } from "@/components/firma/leads-kanban";
import { LiveRefresh } from "@/components/firma/live-events";
import {
  EmptyState,
  FilterChip,
  LoadingBlock,
  PageBody,
  PageHeader,
  SegmentedLinks,
  ShowMore,
} from "@/components/firma/page-parts";
import { hrefWith } from "@/components/firma/url";
import { Link } from "@/i18n/navigation";
import { LEAD_STATUSES, LEAD_TYPES, TOPICS } from "@/lib/domain/taxonomy";
import { PAGE_SIZE, parseLimit, parseScope, SCOPES } from "@/lib/firma/aggregate";
import { requireAdvisor } from "@/lib/firma/auth";
import { listAdvisors } from "@/lib/firma/conversations";
import { listLeads, MIN_SCORE_OPTIONS, parseLeadFilters } from "@/lib/firma/leads";
import { displayName } from "@/lib/firma/names";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/firma/leads">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale, namespace: "firma.nav" });
  return { title: t("leads") };
}

export default function LeadsPage({ params, searchParams }: PageProps<"/[locale]/firma/leads">) {
  setRequestLocale(use(params).locale);
  const t = useTranslations("firma.leads");
  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <KindMark kind="lead" />
            {t("title")}
          </span>
        }
        description={<KindDefinition kind="lead" />}
      />
      <Suspense fallback={<LoadingBlock label={t("title")} />}>
        <LeadsContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const PATH = "/firma/leads";

async function LeadsContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdvisor();
  await connection();
  const params = await searchParams;
  const scope = parseScope(params.scope);
  const filters = parseLeadFilters(params, scope);
  const view = params.view === "kanban" ? "kanban" : "table";
  const limit = parseLimit(params.limit);
  const { rows: leads, total } = listLeads(filters, limit);
  const advisors = listAdvisors();
  const advisorName = new Map(advisors.map((a) => [a.id, a.name]));

  const [t, tFocus, tKinds, tType, tStatus, tTopic, tScope, tPriority, tCommon] = await Promise.all(
    [
      getTranslations("firma.leads"),
      getTranslations("firmaFocus.leads"),
      getTranslations("firmaCustomers.kinds"),
      getTranslations("common.taxonomy.leadType"),
      getTranslations("common.taxonomy.leadStatus"),
      getTranslations("common.taxonomy.topics"),
      getTranslations("firma.scope"),
      getTranslations("common.taxonomy.priority"),
      getTranslations("firma.common"),
    ],
  );

  const current = {
    scope: scope === "all" ? null : scope,
    type: filters.type,
    status: filters.status,
    topic: filters.topic,
    minScore: filters.minScore || null,
    hot: filters.hot ? 1 : null,
    view: view === "table" ? null : view,
  };
  const keep = (omit: keyof typeof current) => ({ ...current, [omit]: null });

  return (
    <PageBody className="grid gap-5">
      <LiveRefresh types={["lead"]} intervalMs={2500} />
      <div className="flex flex-wrap items-end gap-3">
        <FilterSelect
          label={t("filter.type")}
          path={PATH}
          param="type"
          value={filters.type ?? ""}
          params={keep("type")}
          options={[
            { value: "", label: t("filter.all") },
            ...LEAD_TYPES.map((v) => ({ value: v, label: tType(v) })),
          ]}
        />
        <FilterSelect
          label={t("filter.minScore")}
          path={PATH}
          param="minScore"
          value={String(filters.minScore || "")}
          params={keep("minScore")}
          options={MIN_SCORE_OPTIONS.map((v) => ({
            value: v === 0 ? "" : String(v),
            label: v === 0 ? t("filter.anyScore") : t("filter.scoreFrom", { score: v }),
          }))}
        />
        <FilterSelect
          label={t("filter.topic")}
          path={PATH}
          param="topic"
          value={filters.topic ?? ""}
          params={keep("topic")}
          options={[
            { value: "", label: t("filter.all") },
            ...TOPICS.map((v) => ({ value: v, label: tTopic(v) })),
          ]}
        />
        {view === "table" ? (
          <FilterSelect
            label={t("filter.status")}
            path={PATH}
            param="status"
            value={filters.status ?? ""}
            params={keep("status")}
            options={[
              { value: "", label: t("filter.all") },
              ...LEAD_STATUSES.map((v) => ({ value: v, label: tStatus(v) })),
            ]}
          />
        ) : null}
        <FilterSelect
          label={t("filter.origin")}
          path={PATH}
          param="scope"
          value={current.scope ?? ""}
          params={keep("scope")}
          options={SCOPES.map((s) => ({ value: s === "all" ? "" : s, label: tScope(s) }))}
        />
        <div className="sm:ml-auto">
          <SegmentedLinks
            label={t("view.label")}
            items={(["table", "kanban"] as const).map((v) => ({
              key: v,
              label: t(`view.${v}`),
              href: hrefWith(PATH, {
                ...current,
                status: v === "kanban" ? null : current.status,
                view: v === "table" ? null : v,
              }),
              active: v === view,
            }))}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {filters.hot ? (
          <FilterChip label={tFocus("hot")} clearHref={hrefWith(PATH, keep("hot"))} />
        ) : null}
        <p className="text-fg-muted">{t("count", { count: total })}</p>
      </div>

      {leads.length === 0 ? (
        <EmptyState title={t("emptyTitle")}>{t("emptyBody")}</EmptyState>
      ) : view === "kanban" ? (
        <LeadsKanban
          leads={leads.map(
            (l): KanbanLead => ({
              id: l.id,
              status: l.status,
              type: l.type,
              priority: l.priority,
              score: l.score,
              name: displayName(l) ?? tCommon("anonymous"),
              city: l.city,
              reasonToCall: l.reasonToCall,
              customerId: l.customerId,
              hasOpenHandover: l.openHandovers > 0,
              isSimulated: l.isSimulated,
              assignee: l.assignedAdvisorId ? (advisorName.get(l.assignedAdvisorId) ?? null) : null,
            }),
          )}
        />
      ) : (
        <ul className="divide-y divide-gray-2 rounded-xl border border-line">
          {leads.map((l) => (
            <li
              key={l.id}
              className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-4 gap-y-3 px-4 py-4 lg:grid-cols-[3rem_minmax(0,14rem)_minmax(0,1fr)_auto] lg:items-start"
            >
              <span className="grid content-start gap-1">
                <span className="text-xl leading-none font-bold tabular-nums">{l.score}</span>
                <span className="h-1 bg-gray-2">
                  <span className="block h-full bg-pax-purple" style={{ width: `${l.score}%` }} />
                </span>
              </span>
              <span className="grid min-w-0 content-start gap-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    role="img"
                    aria-label={tPriority(l.priority)}
                    title={tPriority(l.priority)}
                    className={cn("size-2.5 shrink-0", PRIORITY_MARK[l.priority])}
                  />
                  <CustomerLink
                    customerId={l.customerId}
                    firstName={l.firstName}
                    lastName={l.lastName}
                    city={null}
                    section="leads"
                  />
                  {l.isSimulated ? (
                    <Bot
                      aria-label={tCommon("simulated")}
                      className="size-3.5 shrink-0 text-fg-muted"
                    />
                  ) : null}
                </span>
                <span className="text-xs text-fg-muted">{tType(l.type)}</span>
              </span>
              <span className="col-span-2 grid min-w-0 content-start gap-1.5 lg:col-span-1">
                {l.conversationId ? (
                  <Link
                    href={`/firma/gespraeche/${l.conversationId}#lead-${l.id}`}
                    className="line-clamp-2 hover:underline"
                  >
                    {l.reasonToCall}
                  </Link>
                ) : (
                  <p className="line-clamp-2">{l.reasonToCall}</p>
                )}
                {l.openHandovers > 0 ? (
                  <Link
                    href={customerHref(l.customerId, "handovers")}
                    className="justify-self-start rounded-full bg-warning-light px-2 py-0.5 text-xs font-medium text-warning-dark hover:underline"
                  >
                    {tKinds("handover.alsoOpen")}
                  </Link>
                ) : null}
              </span>
              <span className="col-span-2 flex flex-wrap items-start gap-2 lg:col-span-1 lg:justify-end">
                <LeadStatusSelect leadId={l.id} status={l.status} />
                <AssignSelect
                  kind="lead"
                  id={l.id}
                  value={l.assignedAdvisorId}
                  advisors={advisors}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
      <ShowMore
        shown={leads.length}
        total={total}
        href={hrefWith(PATH, { ...current, limit: limit + PAGE_SIZE })}
      />
    </PageBody>
  );
}

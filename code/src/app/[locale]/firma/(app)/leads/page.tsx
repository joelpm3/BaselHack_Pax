import { Bot, Mail, Phone } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { useTranslations } from "next-intl";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense, use } from "react";
import { LeadTypeBadge, PriorityBadge } from "@/components/firma/badges";
import { AssignSelect, LeadStatusSelect } from "@/components/firma/controls";
import { CustomerLabel } from "@/components/firma/customer-label";
import { FilterSelect } from "@/components/firma/filter-select";
import { type KanbanLead, LeadsKanban } from "@/components/firma/leads-kanban";
import { LiveRefresh } from "@/components/firma/live-events";
import {
  EmptyState,
  LoadingBlock,
  PageBody,
  PageHeader,
  SegmentedLinks,
} from "@/components/firma/page-parts";
import { hrefWith } from "@/components/firma/url";
import { Link } from "@/i18n/navigation";
import { LEAD_STATUSES, LEAD_TYPES, TOPICS } from "@/lib/domain/taxonomy";
import { parseScope, SCOPES } from "@/lib/firma/aggregate";
import { requireAdvisor } from "@/lib/firma/auth";
import { listAdvisors } from "@/lib/firma/conversations";
import { listLeads, MIN_SCORE_OPTIONS, parseLeadFilters } from "@/lib/firma/leads";
import { displayName } from "@/lib/firma/names";

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
      <PageHeader title={t("title")} description={t("description")} />
      <Suspense fallback={<LoadingBlock label={t("title")} />}>
        <LeadsContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

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
  const leads = listLeads(filters);
  const advisors = listAdvisors();
  const advisorName = new Map(advisors.map((a) => [a.id, a.name]));

  const [t, tType, tStatus, tTopic, tScope, tCommon, format] = await Promise.all([
    getTranslations("firma.leads"),
    getTranslations("common.taxonomy.leadType"),
    getTranslations("common.taxonomy.leadStatus"),
    getTranslations("common.taxonomy.topics"),
    getTranslations("firma.scope"),
    getTranslations("firma.common"),
    getFormatter(),
  ]);

  const current = {
    scope: scope === "all" ? null : scope,
    type: filters.type,
    status: filters.status,
    topic: filters.topic,
    minScore: filters.minScore || null,
    view: view === "table" ? null : view,
  };
  const keep = (omit: keyof typeof current) => ({ ...current, [omit]: null });

  return (
    <PageBody className="grid gap-5">
      <LiveRefresh types={["lead"]} intervalMs={2500} />
      <div className="flex flex-wrap items-end gap-3">
        <FilterSelect
          label={t("filter.type")}
          path="/firma/leads"
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
          path="/firma/leads"
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
          path="/firma/leads"
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
            path="/firma/leads"
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
          path="/firma/leads"
          param="scope"
          value={current.scope ?? ""}
          params={keep("scope")}
          options={SCOPES.map((s) => ({ value: s === "all" ? "" : s, label: tScope(s) }))}
        />
        <div className="ml-auto">
          <SegmentedLinks
            label={t("view.label")}
            items={(["table", "kanban"] as const).map((v) => ({
              key: v,
              label: t(`view.${v}`),
              href: hrefWith("/firma/leads", {
                ...current,
                status: v === "kanban" ? null : current.status,
                view: v === "table" ? null : v,
              }),
              active: v === view,
            }))}
          />
        </div>
      </div>

      <p className="text-fg-muted">{t("count", { count: leads.length })}</p>

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
              conversationId: l.conversationId,
              isSimulated: l.isSimulated,
              assignee: l.assignedAdvisorId ? (advisorName.get(l.assignedAdvisorId) ?? null) : null,
            }),
          )}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[60rem] border-collapse">
            <thead className="bg-gray-1 text-left text-xs text-fg-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  {t("col.priority")}
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  {t("col.customer")}
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  {t("col.score")}
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  {t("col.reason")}
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  {t("col.status")}
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  {t("col.assignee")}
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  {t("col.updated")}
                </th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id} className="border-t border-gray-2 align-top hover:bg-gray-1">
                  <td className="px-4 py-3">
                    <div className="grid justify-items-start gap-1.5">
                      <PriorityBadge priority={l.priority} />
                      <LeadTypeBadge type={l.type} />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="grid gap-1">
                      <span className="flex items-center gap-1.5">
                        <CustomerLabel
                          firstName={l.firstName}
                          lastName={l.lastName}
                          city={l.city}
                          className="font-medium"
                        />
                        {l.isSimulated ? (
                          <Bot
                            aria-label={tCommon("simulated")}
                            className="size-3.5 shrink-0 text-fg-muted"
                          />
                        ) : null}
                      </span>
                      <span className="flex items-center gap-2 text-fg-muted">
                        {l.phone ? (
                          <a
                            href={`tel:${l.phone}`}
                            className="inline-flex items-center gap-1 hover:text-fg"
                            title={l.phone}
                          >
                            <Phone aria-hidden className="size-3.5" />
                            <span className="text-xs">{l.phone}</span>
                          </a>
                        ) : null}
                        {l.email ? (
                          <a
                            href={`mailto:${l.email}`}
                            className="inline-flex items-center gap-1 hover:text-fg"
                            title={l.email}
                          >
                            <Mail aria-hidden className="size-3.5" />
                            <span className="sr-only">{l.email}</span>
                          </a>
                        ) : null}
                        {!l.phone && !l.email ? (
                          <span className="text-xs">{t("noContact")}</span>
                        ) : null}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="grid w-20 gap-1">
                      <span className="text-lg font-bold leading-none tabular-nums">{l.score}</span>
                      <span className="h-1.5 bg-gray-2">
                        <span
                          className="block h-full bg-pax-purple"
                          style={{ width: `${l.score}%` }}
                        />
                      </span>
                    </div>
                  </td>
                  <td className="max-w-sm px-4 py-3">
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
                    {l.topics?.length ? (
                      <p className="mt-1 truncate text-xs text-fg-muted">
                        {l.topics.map((x) => tTopic(x)).join(", ")}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <LeadStatusSelect leadId={l.id} status={l.status} />
                  </td>
                  <td className="px-4 py-3">
                    <AssignSelect
                      kind="lead"
                      id={l.id}
                      value={l.assignedAdvisorId}
                      advisors={advisors}
                    />
                  </td>
                  <td className="px-4 py-3 text-right text-xs whitespace-nowrap text-fg-muted tabular-nums">
                    {format.dateTime(l.updatedAt, {
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

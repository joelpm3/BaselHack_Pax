// One job: work the queue of people waiting for a human: urgent first, then whoever has waited
// longest. Rules, summary and contact details live on the conversation and customer pages.
import { Bot } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { useTranslations } from "next-intl";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense, use } from "react";
import { AssignSelect, HandoverStatusSelect } from "@/components/firma/controls";
import { CustomerLink, customerHref } from "@/components/firma/customer-link";
import { KindDefinition, KindMark } from "@/components/firma/kind-mark";
import { LiveRefresh } from "@/components/firma/live-events";
import {
  EmptyState,
  LoadingBlock,
  PageBody,
  PageHeader,
  SegmentedLinks,
  ShowMore,
} from "@/components/firma/page-parts";
import { ScopeSwitch } from "@/components/firma/scope-switch";
import { hrefWith } from "@/components/firma/url";
import { Link } from "@/i18n/navigation";
import { HANDOVER_STATUSES } from "@/lib/domain/taxonomy";
import { PAGE_SIZE, parseLimit, parseScope } from "@/lib/firma/aggregate";
import { requireAdvisor } from "@/lib/firma/auth";
import { listAdvisors } from "@/lib/firma/conversations";
import { handoverCounts, listHandovers, parseHandoverStatus } from "@/lib/firma/handovers";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/firma/uebergaben">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale, namespace: "firma.nav" });
  return { title: t("handovers") };
}

export default function HandoversPage({
  params,
  searchParams,
}: PageProps<"/[locale]/firma/uebergaben">) {
  setRequestLocale(use(params).locale);
  const t = useTranslations("firma.handovers");
  const tKinds = useTranslations("firmaCustomers.kinds");
  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <KindMark kind="handover" />
            {t("title")}
          </span>
        }
        description={
          <>
            <KindDefinition kind="handover" className="inline" /> {tKinds("handover.contrast")}
          </>
        }
      />
      <Suspense fallback={<LoadingBlock label={t("title")} />}>
        <HandoversContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const PATH = "/firma/uebergaben";

async function HandoversContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdvisor();
  await connection();
  const params = await searchParams;
  const scope = parseScope(params.scope);
  const status = parseHandoverStatus(params.status);
  const limit = parseLimit(params.limit);
  const rows = listHandovers(status, scope, limit);
  const counts = handoverCounts(scope);
  const advisors = listAdvisors();
  const [t, tKinds, tStatus, tChannel, tFocus, tCommon, format] = await Promise.all([
    getTranslations("firma.handovers"),
    getTranslations("firmaCustomers.kinds"),
    getTranslations("firma.taxonomy.handoverStatus"),
    getTranslations("firma.taxonomy.channel"),
    getTranslations("firmaFocus.handovers"),
    getTranslations("firma.common"),
    getFormatter(),
  ]);
  const now = new Date();
  const current = {
    scope: scope === "all" ? null : scope,
    status: status === "open" ? null : status,
  };

  return (
    <PageBody className="grid gap-5">
      <LiveRefresh types={["handover", "conversation.updated"]} intervalMs={2000} />
      <div className="flex flex-wrap items-center gap-3">
        <div className="max-w-full overflow-x-auto">
          <SegmentedLinks
            label={t("statusFilter")}
            items={HANDOVER_STATUSES.map((s) => ({
              key: s,
              label: (
                <span className="whitespace-nowrap">
                  {tStatus(s)} <span className="tabular-nums text-fg-muted">{counts[s]}</span>
                </span>
              ),
              href: hrefWith(PATH, { ...current, status: s === "open" ? null : s }),
              active: s === status,
            }))}
          />
        </div>
        <ScopeSwitch path={PATH} scope={scope} extra={{ status: current.status }} />
      </div>

      {rows.length === 0 ? (
        <EmptyState title={t("emptyTitle", { status: tStatus(status) })}>
          {t("emptyBody")}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-gray-2 rounded-xl border border-line">
          {rows.map((h) => (
            <li
              key={h.id}
              className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] lg:gap-6"
            >
              <div className="grid content-start gap-1">
                <span className="flex min-w-0 items-center gap-2">
                  {h.urgency === "high" ? (
                    <span
                      role="img"
                      aria-label={t("urgency.high")}
                      title={t("urgency.high")}
                      className="size-2.5 shrink-0 bg-error"
                    />
                  ) : null}
                  <CustomerLink
                    customerId={h.customerId}
                    firstName={h.firstName}
                    lastName={h.lastName}
                    city={null}
                    section="handovers"
                  />
                  {h.isSimulated ? (
                    <Bot
                      aria-label={tCommon("simulated")}
                      className="size-3.5 shrink-0 text-fg-muted"
                    />
                  ) : null}
                </span>
                <span
                  className="text-paragraph-xs text-fg-muted"
                  title={format.dateTime(h.createdAt, { dateStyle: "medium", timeStyle: "short" })}
                >
                  {status === "open"
                    ? tFocus("waiting", { time: format.relativeTime(h.createdAt, now) })
                    : format.relativeTime(h.createdAt, now)}
                </span>
              </div>
              <div className="grid min-w-0 content-start gap-1.5">
                <p className="line-clamp-2">{h.reason}</p>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-fg-muted">
                  {h.preferredChannel || h.preferredTime ? (
                    <span>
                      {[h.preferredChannel ? tChannel(h.preferredChannel) : null, h.preferredTime]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  ) : null}
                  <Link
                    href={`/firma/gespraeche/${h.conversationId}`}
                    className="text-contrast-green hover:underline"
                  >
                    {tKinds("openConversation")}
                  </Link>
                  {h.openLeads > 0 ? (
                    <Link
                      href={customerHref(h.customerId, "leads")}
                      className="rounded-full bg-light-purple px-2 py-0.5 text-paragraph-xs font-medium text-deep-purple hover:underline"
                    >
                      {tKinds("lead.alsoOpen", { count: h.openLeads })}
                    </Link>
                  ) : null}
                </p>
              </div>
              <div className="flex flex-wrap content-start items-start gap-2 lg:justify-end">
                <HandoverStatusSelect handoverId={h.id} status={h.status} />
                <AssignSelect
                  kind="handover"
                  id={h.id}
                  value={h.assignedAdvisorId}
                  advisors={advisors}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      <ShowMore
        shown={rows.length}
        total={counts[status]}
        href={hrefWith(PATH, { ...current, limit: limit + PAGE_SIZE })}
      />
    </PageBody>
  );
}

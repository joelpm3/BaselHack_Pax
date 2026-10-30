import { Bot, Mail, Phone } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { useTranslations } from "next-intl";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense, use } from "react";
import { AssignSelect, HandoverStatusSelect } from "@/components/firma/controls";
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
import { HANDOVER_STATUSES } from "@/lib/domain/taxonomy";
import { parseScope } from "@/lib/firma/aggregate";
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
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Suspense fallback={<LoadingBlock label={t("title")} />}>
        <HandoversContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

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
  const { rows, rules } = listHandovers(status, scope);
  const counts = handoverCounts(scope);
  const advisors = listAdvisors();
  const [t, tStatus, tStage, tChannel, tAction, tCommon, format] = await Promise.all([
    getTranslations("firma.handovers"),
    getTranslations("firma.taxonomy.handoverStatus"),
    getTranslations("common.taxonomy.stages"),
    getTranslations("firma.taxonomy.channel"),
    getTranslations("firma.taxonomy.ruleAction"),
    getTranslations("firma.common"),
    getFormatter(),
  ]);

  return (
    <PageBody className="grid gap-5">
      <LiveRefresh types={["handover", "conversation.updated"]} intervalMs={2000} />
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedLinks
          label={t("statusFilter")}
          items={HANDOVER_STATUSES.map((s) => ({
            key: s,
            label: (
              <>
                {tStatus(s)} <span className="tabular-nums text-fg-muted">{counts[s]}</span>
              </>
            ),
            href: hrefWith("/firma/uebergaben", {
              scope: scope === "all" ? null : scope,
              status: s === "open" ? null : s,
            }),
            active: s === status,
          }))}
        />
        <ScopeSwitch
          path="/firma/uebergaben"
          scope={scope}
          extra={{ status: status === "open" ? null : status }}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState title={t("emptyTitle", { status: tStatus(status) })}>
          {t("emptyBody")}
        </EmptyState>
      ) : (
        <ul className="grid gap-3">
          {rows.map((h) => (
            <li
              key={h.id}
              className="grid gap-4 rounded-xl border border-line p-4 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_auto]"
            >
              <div className="grid content-start gap-1.5">
                <span className="flex items-center gap-2">
                  {h.urgency === "high" ? (
                    <span aria-hidden className="size-2 shrink-0 bg-error" />
                  ) : null}
                  <Link
                    href={`/firma/gespraeche/${h.conversationId}`}
                    className="min-w-0 hover:underline"
                  >
                    <CustomerLabel
                      firstName={h.firstName}
                      lastName={h.lastName}
                      city={h.city}
                      className="font-medium"
                    />
                  </Link>
                  {h.isSimulated ? (
                    <Bot
                      aria-label={tCommon("simulated")}
                      className="size-3.5 shrink-0 text-fg-muted"
                    />
                  ) : null}
                </span>
                <span className="flex flex-wrap gap-x-3 gap-y-1 text-fg-muted">
                  {h.phone ? (
                    <a
                      href={`tel:${h.phone}`}
                      className="inline-flex items-center gap-1 hover:text-fg"
                    >
                      <Phone aria-hidden className="size-3.5" />
                      {h.phone}
                    </a>
                  ) : null}
                  {h.email ? (
                    <a
                      href={`mailto:${h.email}`}
                      className="inline-flex min-w-0 items-center gap-1 hover:text-fg"
                    >
                      <Mail aria-hidden className="size-3.5 shrink-0" />
                      <span className="truncate">{h.email}</span>
                    </a>
                  ) : null}
                  {!h.phone && !h.email ? <span>{t("noContact")}</span> : null}
                </span>
                <span className="flex items-center gap-2 text-xs text-fg-muted">
                  <StageSquares stage={h.stage} label={tStage(h.stage)} />
                  {tStage(h.stage)}
                </span>
                <span className="text-xs text-fg-muted tabular-nums">
                  {format.dateTime(h.createdAt, {
                    day: "numeric",
                    month: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <div className="grid min-w-0 content-start gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={h.urgency === "high" ? "error" : "neutral"}>
                    {t(`urgency.${h.urgency}`)}
                  </Badge>
                  {h.preferredChannel ? (
                    <Badge tone="info">{tChannel(h.preferredChannel)}</Badge>
                  ) : null}
                  {h.preferredTime ? (
                    <span className="text-fg-muted">{h.preferredTime}</span>
                  ) : null}
                </div>
                <p className="font-medium">{h.reason}</p>
                {h.summary ? <p className="line-clamp-3 text-fg-muted">{h.summary}</p> : null}
                {h.ruleIds.length > 0 ? (
                  <ul className="grid gap-1.5">
                    {h.ruleIds.map((id) => {
                      const rule = rules[id];
                      return (
                        <li key={id} className="rounded-m bg-gray-1 px-3 py-2">
                          {rule ? (
                            <>
                              <span className="text-xs text-fg-muted">
                                {tAction(rule.action)} ·{" "}
                                {t("ruleVersion", { version: rule.version })}
                              </span>
                              <p>{rule.text}</p>
                            </>
                          ) : (
                            <span className="text-fg-muted">{t("unknownRule")}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-xs text-fg-muted">{t("noRule")}</p>
                )}
              </div>
              <div className="flex flex-wrap content-start items-start gap-2 lg:grid lg:justify-items-end">
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
    </PageBody>
  );
}

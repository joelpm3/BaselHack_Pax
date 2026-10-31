import { Mail, Phone } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense, use } from "react";
import { LeadStatusBadge, PriorityBadge } from "@/components/firma/badges";
import { LeadStatusSelect } from "@/components/firma/controls";
import { CustomerLabel } from "@/components/firma/customer-label";
import { LiveRefresh } from "@/components/firma/live-events";
import {
  EmptyState,
  LoadingBlock,
  PageBody,
  PageHeader,
  Panel,
  SegmentedLinks,
} from "@/components/firma/page-parts";
import { hrefWith } from "@/components/firma/url";
import {
  CheckinToggle,
  DismissEventButton,
  RecordReplyButton,
} from "@/components/followups/controls";
import { BusinessDate, EventWhen } from "@/components/followups/event-when";
import { OutboxList, outboxKindKey } from "@/components/followups/outbox";
import { TimeTravel } from "@/components/followups/time-travel";
import { FollowUpTimeline } from "@/components/followups/timeline";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { toIsoDate } from "@/lib/documents/dates";
import { requireAdvisor } from "@/lib/firma/auth";
import { getBusinessToday } from "@/lib/followups/clock";
import {
  followUpCounts,
  listCheckins,
  listFollowUps,
  listOutbox,
  listUpcomingEvents,
} from "@/lib/followups/queries";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/firma/wiedervorlagen">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale, namespace: "followups.page" });
  return { title: t("title") };
}

const TABS = ["due", "upcoming", "responded", "lost"] as const;
type Tab = (typeof TABS)[number];

export default function FollowUpsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/firma/wiedervorlagen">) {
  setRequestLocale(use(params).locale);
  const t = useTranslations("followups.page");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Suspense fallback={<LoadingBlock label={t("title")} />}>
        <FollowUpsContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function FollowUpsContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdvisor();
  await connection();
  const params = await searchParams;
  const tab: Tab = TABS.includes(params.tab as Tab) ? (params.tab as Tab) : "due";
  const [{ today, simulated }, t] = await Promise.all([
    getBusinessToday(),
    getTranslations("followups"),
  ]);
  const counts = followUpCounts();
  const upcoming = listUpcomingEvents();

  return (
    <PageBody className="grid gap-6">
      <LiveRefresh types={["analysis", "lead"]} intervalMs={3000} />
      <TimeTravel today={today} simulated={simulated} />
      <FollowUpTimeline today={today} items={upcoming} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="grid content-start gap-4">
          <div className="overflow-x-auto">
            <SegmentedLinks
              label={t("page.tabs")}
              items={TABS.map((key) => ({
                key,
                label: (
                  <>
                    {t(`tab.${key}`)}{" "}
                    <span className="tabular-nums text-fg-muted">{counts[key]}</span>
                  </>
                ),
                href: hrefWith("/firma/wiedervorlagen", { tab: key === "due" ? null : key }),
                active: key === tab,
              }))}
            />
          </div>
          {tab === "upcoming" ? (
            <UpcomingList rows={upcoming} today={today} />
          ) : (
            <FollowUpList status={tab} />
          )}
        </div>
        <div className="grid content-start gap-6">
          <Panel title={t("outbox.title")} description={t("outbox.description")}>
            <OutboxList emails={listOutbox(30)} />
          </Panel>
          <CheckinPanel today={today} />
        </div>
      </div>
    </PageBody>
  );
}

function SourceQuote({
  quote,
  conversationId,
  conversationDate,
}: {
  quote: string;
  conversationId: string | null;
  conversationDate: number | null;
}) {
  const t = useTranslations("followups.card");
  return (
    <blockquote className="grid gap-1 border-l-2 border-pax-green pl-3">
      <p>«{quote}»</p>
      {conversationId && conversationDate ? (
        <Link
          href={`/firma/gespraeche/${conversationId}`}
          className="text-xs text-contrast-green hover:underline"
        >
          {t("fromConversation")} <BusinessDate date={toIsoDate(new Date(conversationDate))} />
        </Link>
      ) : null}
    </blockquote>
  );
}

function FollowUpList({ status }: { status: Exclude<Tab, "upcoming"> }) {
  const t = useTranslations("followups");
  const rows = listFollowUps(status);
  if (rows.length === 0) {
    return <EmptyState title={t(`empty.${status}.title`)}>{t(`empty.${status}.body`)}</EmptyState>;
  }
  return (
    <ul className="grid gap-3">
      {rows.map((row) => {
        const openEmail = row.emails.findLast((e) => !e.repliedAt);
        return (
          <li key={row.id} className="grid gap-4 rounded-xl border border-line p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="grid min-w-0 gap-1">
                <CustomerLabel
                  firstName={row.firstName}
                  lastName={row.lastName}
                  city={row.city}
                  className="font-medium"
                />
                <span className="flex flex-wrap gap-x-3 gap-y-1 text-fg-muted">
                  {row.phone ? (
                    <a
                      href={`tel:${row.phone}`}
                      className="inline-flex items-center gap-1 hover:text-fg"
                    >
                      <Phone aria-hidden className="size-3.5" />
                      {row.phone}
                    </a>
                  ) : null}
                  {row.email ? (
                    <a
                      href={`mailto:${row.email}`}
                      className="inline-flex min-w-0 items-center gap-1 hover:text-fg"
                    >
                      <Mail aria-hidden className="size-3.5 shrink-0" />
                      <span className="truncate">{row.email}</span>
                    </a>
                  ) : null}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {row.priority ? <PriorityBadge priority={row.priority} /> : null}
                {row.leadStatus ? <LeadStatusBadge status={row.leadStatus} /> : null}
              </div>
            </div>

            <div className="grid gap-1">
              <p className="flex flex-wrap items-center gap-2">
                <Badge tone="purple">{t(`kind.${row.kind}`)}</Badge>
                {row.subject ? <span className="text-fg-muted">{row.subject}</span> : null}
                <span>
                  {t("card.expected")}{" "}
                  <EventWhen date={row.expectedDate} precision={row.precision} />
                </span>
              </p>
              {row.reasonToCall ? <p className="font-medium">{row.reasonToCall}</p> : null}
            </div>

            <SourceQuote
              quote={row.sourceQuote}
              conversationId={row.conversationId}
              conversationDate={row.conversationDate}
            />

            {row.talkingPoints && row.talkingPoints.length > 1 ? (
              <ul className="grid list-disc gap-1 pl-5 text-fg-muted marker:text-pax-purple">
                {row.talkingPoints.slice(1).map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : null}

            <div className="grid gap-2 rounded-m bg-gray-1 p-3">
              {row.emails.length === 0 ? (
                <p className="text-fg-muted">{t("card.noEmail")}</p>
              ) : (
                <ol className="grid gap-1">
                  {row.emails.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center gap-2">
                      <span
                        aria-hidden
                        className={e.repliedAt ? "size-2.5 bg-pax-green" : "size-2.5 bg-pax-purple"}
                      />
                      <span>{t(`outbox.kind.${outboxKindKey(e)}`)}</span>
                      <BusinessDate date={e.sentOn} />
                      <span className="min-w-0 truncate text-fg-muted">{e.subject}</span>
                      {e.repliedAt ? <Badge tone="success">{t("outbox.replied")}</Badge> : null}
                    </li>
                  ))}
                </ol>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {row.leadId && row.leadStatus ? (
                  <LeadStatusSelect leadId={row.leadId} status={row.leadStatus} />
                ) : null}
                {openEmail && status !== "responded" ? (
                  <RecordReplyButton emailId={openEmail.id} />
                ) : null}
                {status === "due" ? <DismissEventButton eventId={row.id} /> : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function UpcomingList({
  rows,
  today,
}: {
  rows: ReturnType<typeof listUpcomingEvents>;
  today: string;
}) {
  const t = useTranslations("followups");
  if (rows.length === 0) {
    return <EmptyState title={t("empty.upcoming.title")}>{t("empty.upcoming.body")}</EmptyState>;
  }
  return (
    <ol className="grid divide-y divide-line rounded-xl border border-line">
      {rows.map((row) => (
        <li key={row.id} className="grid gap-3 p-4 sm:grid-cols-[8rem_minmax(0,1fr)_auto]">
          <div className="grid content-start gap-0.5">
            <span className="text-xs text-fg-muted">{t("card.followUpOn")}</span>
            <span className="font-medium">
              <BusinessDate date={row.followUpOn} />
            </span>
            {row.followUpOn <= today ? (
              <Badge tone="warning" className="w-fit">
                {t("card.dueNow")}
              </Badge>
            ) : null}
          </div>
          <div className="grid min-w-0 gap-2">
            <p className="flex flex-wrap items-center gap-2">
              <CustomerLabel
                firstName={row.firstName}
                lastName={row.lastName}
                city={row.city}
                className="font-medium"
              />
              <Badge tone="info">{t(`kind.${row.kind}`)}</Badge>
              <span className="text-fg-muted">
                <EventWhen date={row.expectedDate} precision={row.precision} />
              </span>
            </p>
            <SourceQuote
              quote={row.sourceQuote}
              conversationId={row.conversationId}
              conversationDate={row.conversationDate}
            />
            <span className="text-xs text-fg-muted">
              {t("card.confidence", { value: Math.round(row.confidence * 100) })}
            </span>
          </div>
          <div>
            <DismissEventButton eventId={row.id} />
          </div>
        </li>
      ))}
    </ol>
  );
}

function CheckinPanel({ today }: { today: string }) {
  const t = useTranslations("followups.checkin");
  const rows = listCheckins();
  return (
    <Panel title={t("title")} description={t("description")}>
      {rows.length === 0 ? (
        <p className="text-fg-muted">{t("empty")}</p>
      ) : (
        <ul className="grid divide-y divide-line">
          {rows.map((row) => (
            <li
              key={row.customerId}
              className="flex flex-wrap items-center justify-between gap-2 py-2"
            >
              <div className="grid min-w-0">
                <CustomerLabel firstName={row.firstName} lastName={row.lastName} city={row.city} />
                <span className="text-xs text-fg-muted">
                  {row.enabled ? (
                    <>
                      {t("next")} <BusinessDate date={row.nextOn} />
                      {row.nextOn <= today ? ` · ${t("dueNow")}` : ""}
                    </>
                  ) : (
                    t("off")
                  )}
                </span>
              </div>
              <CheckinToggle customerId={row.customerId} enabled={row.enabled} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

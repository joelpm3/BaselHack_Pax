// One job: list the announced life events that call for a follow-up, soonest first, and open
// the customer. Emails, the source quote and the yearly check-in live on the customer page.
import type { Metadata } from "next";
import { connection } from "next/server";
import { useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense, use } from "react";
import { CustomerLabel } from "@/components/firma/customer-label";
import { customerHref } from "@/components/firma/customer-link";
import { LiveRefresh } from "@/components/firma/live-events";
import {
  EmptyState,
  LoadingBlock,
  PageBody,
  PageHeader,
  SegmentedLinks,
  ShowMore,
} from "@/components/firma/page-parts";
import { hrefWith } from "@/components/firma/url";
import { DismissEventButton } from "@/components/followups/controls";
import { BusinessDate, EventWhen } from "@/components/followups/event-when";
import { outboxKindKey } from "@/components/followups/outbox";
import { TimeTravel } from "@/components/followups/time-travel";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { PAGE_SIZE, parseLimit } from "@/lib/firma/aggregate";
import { requireAdvisor } from "@/lib/firma/auth";
import { getBusinessToday } from "@/lib/followups/clock";
import { followUpCounts, listFollowUps } from "@/lib/followups/queries";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/firma/wiedervorlagen">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale, namespace: "followups.page" });
  return { title: t("title") };
}

const TABS = ["due", "upcoming", "responded", "lost"] as const;
type Tab = (typeof TABS)[number];
const PATH = "/firma/wiedervorlagen";

export default function FollowUpsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/firma/wiedervorlagen">) {
  setRequestLocale(use(params).locale);
  const t = useTranslations("followups.page");
  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          <Suspense fallback={null}>
            <Clock />
          </Suspense>
        }
      />
      <Suspense fallback={<LoadingBlock label={t("title")} />}>
        <FollowUpsContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

/** The demo time travel, small in the header: the pitch needs it, the list does not. */
async function Clock() {
  await requireAdvisor();
  await connection();
  const { today, simulated } = await getBusinessToday();
  return <TimeTravel today={today} simulated={simulated} />;
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
  const limit = parseLimit(params.limit);
  const [{ today }, t] = await Promise.all([getBusinessToday(), getTranslations("followups")]);
  const counts = followUpCounts();
  const rows = listFollowUps(tab, limit);
  const tabParam = tab === "due" ? null : tab;

  return (
    <PageBody className="grid gap-5">
      <LiveRefresh types={["analysis", "lead"]} intervalMs={3000} />
      <div className="max-w-full overflow-x-auto">
        <SegmentedLinks
          label={t("page.tabs")}
          items={TABS.map((key) => ({
            key,
            label: (
              <span className="whitespace-nowrap">
                {t(`tab.${key}`)} <span className="tabular-nums text-fg-muted">{counts[key]}</span>
              </span>
            ),
            href: hrefWith(PATH, { tab: key === "due" ? null : key }),
            active: key === tab,
          }))}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState title={t(`empty.${tab}.title`)}>{t(`empty.${tab}.body`)}</EmptyState>
      ) : (
        <ul className="divide-y divide-gray-2 rounded-xl border border-line">
          {rows.map((row) => {
            const lastEmail = row.emails.at(-1);
            return (
              <li
                key={row.id}
                className="grid gap-x-6 gap-y-2 px-4 py-4 md:grid-cols-[8rem_minmax(0,1fr)_auto] md:items-start"
              >
                <span className="grid content-start gap-1">
                  <span className="text-paragraph-xs text-fg-muted">{t("card.followUpOn")}</span>
                  <span className="font-medium">
                    <BusinessDate date={row.followUpOn} />
                  </span>
                  {tab === "upcoming" && row.followUpOn <= today ? (
                    <Badge tone="warning" className="w-fit">
                      {t("card.dueNow")}
                    </Badge>
                  ) : null}
                </span>
                <span className="grid min-w-0 content-start gap-1">
                  <Link
                    href={customerHref(row.customerId, "followups")}
                    className="min-w-0 truncate hover:underline"
                  >
                    <CustomerLabel
                      firstName={row.firstName}
                      lastName={row.lastName}
                      city={row.city}
                      className="font-medium"
                    />
                  </Link>
                  <span>
                    {t(`kind.${row.kind}`)}
                    {row.subject ? `, ${row.subject}` : ""}
                    {": "}
                    <span className="text-fg-muted">
                      <EventWhen date={row.expectedDate} precision={row.precision} />
                    </span>
                  </span>
                  {row.reasonToCall ? (
                    <span className="line-clamp-1 text-fg-muted">{row.reasonToCall}</span>
                  ) : null}
                </span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 md:justify-end">
                  {lastEmail ? (
                    <span className="text-paragraph-xs text-fg-muted">
                      {lastEmail.repliedAt
                        ? t("outbox.replied")
                        : t(`outbox.kind.${outboxKindKey(lastEmail)}`)}{" "}
                      <BusinessDate date={lastEmail.sentOn} />
                    </span>
                  ) : tab === "due" ? (
                    <span className="text-paragraph-xs text-fg-muted">{t("card.noEmail")}</span>
                  ) : null}
                  {tab === "due" || tab === "upcoming" ? (
                    <DismissEventButton eventId={row.id} />
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <ShowMore
        shown={rows.length}
        total={counts[tab]}
        href={hrefWith(PATH, { tab: tabParam, limit: limit + PAGE_SIZE })}
      />
    </PageBody>
  );
}

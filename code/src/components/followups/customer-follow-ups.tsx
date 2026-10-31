import { getTranslations } from "next-intl/server";
import { Panel } from "@/components/firma/page-parts";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { customerFollowUps } from "@/lib/followups/queries";
import type { FutureEventStatus } from "@/lib/followups/taxonomy";
import { CheckinToggle, DismissEventButton, RecordReplyButton } from "./controls";
import { BusinessDate, EventWhen } from "./event-when";
import { OutboxList } from "./outbox";

const STATUS_TONE: Record<FutureEventStatus, NonNullable<BadgeProps["tone"]>> = {
  upcoming: "neutral",
  due: "warning",
  responded: "success",
  lost: "neutral",
  dismissed: "neutral",
};

/**
 * One customer's announced life events, the emails Pax wrote them and their yearly check-in
 * setting. A server component for the company's customer page (reads the DB synchronously, so
 * render it inside a Suspense boundary after `connection()` / `requireAdvisor()`).
 */
export async function CustomerFollowUps({ customerId }: { customerId: string }) {
  const t = await getTranslations("followups");
  const { events, emails, checkin } = customerFollowUps(customerId);
  return (
    <Panel
      title={t("customer.title")}
      description={t("customer.description")}
      actions={checkin ? <CheckinToggle customerId={customerId} enabled={checkin.enabled} /> : null}
    >
      <div className="grid gap-5">
        {checkin ? (
          <p className="text-fg-muted">
            {!checkin.hasEmail ? (
              t("checkin.noEmail")
            ) : checkin.enabled ? (
              <>
                {t("checkin.title")}: {t("checkin.next")} <BusinessDate date={checkin.nextOn} />
              </>
            ) : (
              `${t("checkin.title")}: ${t("checkin.off")}`
            )}
          </p>
        ) : null}

        <section className="grid gap-2">
          <h3 className="font-medium">{t("customer.events")}</h3>
          {events.length === 0 ? (
            <p className="text-fg-muted">{t("customer.noEvents")}</p>
          ) : (
            <ul className="grid divide-y divide-line rounded-m border border-line">
              {events.map((e) => {
                // Demo: there is no real inbox, so an advisor records the customer's answer here.
                const openEmail =
                  e.status === "due" || e.status === "lost"
                    ? emails.find((m) => m.futureEventId === e.id && !m.repliedAt)
                    : undefined;
                return (
                  <li key={e.id} className="grid gap-1.5 px-3 py-2.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{t(`kind.${e.kind}`)}</span>
                      {e.subject ? <span className="text-fg-muted">{e.subject}</span> : null}
                      <EventWhen date={e.expectedDate} precision={e.precision} />
                      <Badge tone={STATUS_TONE[e.status]}>{t(`status.${e.status}`)}</Badge>
                    </span>
                    <span className="text-fg-muted">«{e.sourceQuote}»</span>
                    <span className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-muted">
                      <span>
                        {t("card.followUpOn")} <BusinessDate date={e.followUpOn} />
                      </span>
                      <span className="flex flex-wrap gap-2">
                        {openEmail ? <RecordReplyButton emailId={openEmail.id} /> : null}
                        {e.status === "upcoming" || e.status === "due" ? (
                          <DismissEventButton eventId={e.id} />
                        ) : null}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="grid gap-2">
          <h3 className="font-medium">{t("outbox.title")}</h3>
          <OutboxList emails={emails} />
        </section>
      </div>
    </Panel>
  );
}

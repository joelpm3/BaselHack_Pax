import { ArrowDownLeft, ArrowUpRight, Mail, Phone } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { ConversationStatusBadge } from "@/components/firma/badges";
import { productName } from "@/components/firma/conversation/analysis-section";
import { Panel } from "@/components/firma/page-parts";
import { StageSquares } from "@/components/firma/stage-squares";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import {
  HANDOVER_STATUSES,
  type HandoverStatus,
  LEAD_STATUSES,
  LEAD_TYPES,
  type LeadStatus,
  type LeadType,
} from "@/lib/domain/taxonomy";
import type { TimelineEntry, TimelineKind } from "@/lib/firma/customer-timeline";
import type { CustomerDetail } from "@/lib/firma/customers";
import { cn, formatChf } from "@/lib/utils";

const dateTime = { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" } as const;

/** Every conversation of the person, one row each; the analysis lives on the conversation page. */
export async function ConversationsSection({ detail }: { detail: CustomerDetail }) {
  const [t, tStage, format] = await Promise.all([
    getTranslations("firmaCustomers.conversations"),
    getTranslations("common.taxonomy.stages"),
    getFormatter(),
  ]);
  return (
    <Panel title={t("title", { count: detail.conversations.length })}>
      {detail.conversations.length === 0 ? (
        <p className="text-fg-muted">{t("none")}</p>
      ) : (
        <ol className="-my-2 divide-y divide-gray-2">
          {detail.conversations.map((c) => (
            <li key={c.id}>
              <Link
                href={`/firma/gespraeche/${c.id}`}
                className="group grid gap-x-4 gap-y-1 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <span className="grid min-w-0">
                  <span className="truncate font-medium group-hover:underline">
                    {c.title ?? t("untitled")}
                  </span>
                  <span className="text-paragraph-xs text-fg-muted tabular-nums">
                    {format.dateTime(c.lastMessageAt ?? c.createdAt, dateTime)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <StageSquares stage={c.stage} label={tStage(c.stage)} />
                  <ConversationStatusBadge status={c.status} />
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

/** Offers the customer saw or signed (applications), next to the recommendations panel. */
export async function ApplicationsSection({
  detail,
  locale,
  collapsed,
}: {
  detail: CustomerDetail;
  locale: string;
  collapsed?: boolean;
}) {
  if (detail.applications.length === 0) return null;
  const [t, format] = await Promise.all([
    getTranslations("firmaCustomers.applications"),
    getFormatter(),
  ]);
  return (
    <Panel
      title={t("title")}
      description={t("description")}
      collapsed={collapsed}
      meta={detail.applications.length}
    >
      <ul className="grid gap-2">
        {detail.applications.map((a) => (
          <li
            key={a.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-m bg-gray-1 px-3 py-2"
          >
            <span className="font-medium">{productName(a.productCode)}</span>
            <Badge
              tone={a.status === "signed" ? "success" : a.status === "draft" ? "info" : "neutral"}
            >
              {t(`status.${a.status}`)}
            </Badge>
            {a.premiumAnnual ? (
              <span className="text-fg-muted">
                {t("premium", { amount: formatChf(a.premiumAnnual, locale) })}
              </span>
            ) : null}
            <span className="ml-auto text-paragraph-xs text-fg-muted tabular-nums">
              {format.dateTime(a.signedAt ?? a.createdAt, dateTime)}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Phone and email as buttons: the first thing an advisor needs to act on anything here. */
export async function ContactButtons({ customer }: { customer: CustomerDetail["customer"] }) {
  const t = await getTranslations("firmaCustomers.communications");
  if (!customer.phone && !customer.email) return <p className="text-fg-muted">{t("noContact")}</p>;
  return (
    <div className="flex min-w-0 flex-wrap gap-2">
      {customer.phone ? (
        <a
          href={`tel:${customer.phone}`}
          className="inline-flex items-center gap-1.5 rounded-m border border-line px-3 py-1.5 hover:bg-gray-1"
        >
          <Phone aria-hidden className="size-4 text-pax-purple" />
          {customer.phone}
        </a>
      ) : null}
      {customer.email ? (
        <a
          href={`mailto:${customer.email}`}
          className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-m border border-line px-3 py-1.5 hover:bg-gray-1"
        >
          <Mail aria-hidden className="size-4 shrink-0 text-pax-purple" />
          <span className="truncate">{customer.email}</span>
        </a>
      ) : null}
    </div>
  );
}

/** Emails and calls with the person; also where automated follow-up emails show up. */
export async function CommunicationsSection({
  detail,
  collapsed,
}: {
  detail: CustomerDetail;
  collapsed?: boolean;
}) {
  const [t, format] = await Promise.all([
    getTranslations("firmaCustomers.communications"),
    getFormatter(),
  ]);
  return (
    <Panel
      title={t("title")}
      description={t("description")}
      collapsed={collapsed}
      meta={detail.communications.length}
    >
      <div className="grid gap-4">
        {detail.communications.length === 0 ? (
          <p className="rounded-m bg-gray-1 px-3 py-2.5 text-fg-muted">{t("none")}</p>
        ) : (
          <ol className="grid gap-3">
            {detail.communications.map((m) => {
              const Icon = m.channel === "email" ? Mail : Phone;
              const DirectionIcon = m.direction === "inbound" ? ArrowDownLeft : ArrowUpRight;
              return (
                <li key={m.id} className="grid gap-1 border-l-2 border-contrast-green pl-3">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-paragraph-xs text-fg-muted">
                    <Icon aria-hidden className="size-3.5 text-fg" />
                    <span className="font-medium text-fg">{t(`channel.${m.channel}`)}</span>
                    {m.direction ? (
                      <span className="inline-flex items-center gap-0.5">
                        <DirectionIcon aria-hidden className="size-3" />
                        {t(`direction.${m.direction}`)}
                      </span>
                    ) : null}
                    {m.to ? <span className="truncate">{m.to}</span> : null}
                    <span className="ml-auto tabular-nums">{format.dateTime(m.at, dateTime)}</span>
                  </span>
                  {m.subject ? <span className="font-medium">{m.subject}</span> : null}
                  {m.body ? (
                    <p className="line-clamp-4 whitespace-pre-wrap text-fg-muted">{m.body}</p>
                  ) : null}
                  <span className="text-paragraph-xs text-fg-subtle">{m.actor ?? t("system")}</span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </Panel>
  );
}

const KIND_SQUARE: Record<TimelineKind, string> = {
  conversation: "bg-chart-5",
  handover: "bg-warning",
  lead: "bg-pax-purple",
  communication: "bg-contrast-green",
  offer: "bg-chart-3",
  document: "bg-gray-4",
  feedback: "bg-chart-4",
  other: "bg-gray-3",
};

/** The whole relationship as one chronological rail of squares, grouped by day. */
export async function TimelineSection({
  detail,
  collapsed,
}: {
  detail: CustomerDetail;
  collapsed?: boolean;
}) {
  const [t, tKind, tType, tLeadStatus, tHandoverStatus, format] = await Promise.all([
    getTranslations("firmaCustomers.timeline"),
    getTranslations("firmaCustomers.timeline.kind"),
    getTranslations("common.taxonomy.leadType"),
    getTranslations("common.taxonomy.leadStatus"),
    getTranslations("firma.taxonomy.handoverStatus"),
    getFormatter(),
  ]);
  const titles = new Map(detail.conversations.map((c) => [c.id, c.title]));
  const leadType = (v: string | number | undefined) =>
    LEAD_TYPES.includes(v as LeadType) ? tType(v as LeadType) : String(v ?? "");
  const leadStatus = (v: string | number | undefined) =>
    LEAD_STATUSES.includes(v as LeadStatus) ? tLeadStatus(v as LeadStatus) : String(v ?? "");

  const line = (e: TimelineEntry): string => {
    const p = e.params;
    switch (e.event) {
      case "leadCreated":
        return t("event.leadCreated", { type: leadType(p.type), score: Number(p.score) });
      case "leadStatus":
        return t("event.leadStatus", { from: leadStatus(p.from), to: leadStatus(p.to) });
      case "handoverStatus":
        return t("event.handoverStatus", {
          status: HANDOVER_STATUSES.includes(p.status as HandoverStatus)
            ? tHandoverStatus(p.status as HandoverStatus)
            : String(p.status),
        });
      case "recommendation":
      case "applicationSigned":
        return t(`event.${e.event}`, { product: productName(String(p.product)) });
      case "policyCreated":
        return t("event.policyCreated", { product: String(p.product) });
      case "documentUploaded":
        return t("event.documentUploaded", { filename: String(p.filename) });
      case "feedback":
        return t("event.feedback", { nps: Number(p.nps) });
      case "other":
        return String(p.action);
      default:
        return t(`event.${e.event}`);
    }
  };

  const days = new Map<string, TimelineEntry[]>();
  for (const entry of detail.timeline) {
    const key = format.dateTime(entry.at, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const list = days.get(key) ?? [];
    list.push(entry);
    days.set(key, list);
  }

  return (
    <Panel
      title={t("title")}
      description={t("description")}
      collapsed={collapsed}
      meta={detail.timeline.length}
    >
      {detail.timeline.length === 0 ? (
        <p className="text-fg-muted">{t("none")}</p>
      ) : (
        <div className="grid gap-5">
          {[...days.entries()].map(([day, entries]) => (
            <section key={day} className="grid gap-2">
              <h3 className="text-paragraph-xs font-medium text-fg-muted">{day}</h3>
              <ol className="grid">
                {entries.map((e, i) => (
                  <li
                    key={e.id}
                    className="grid grid-cols-[3rem_0.75rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[3.5rem_0.75rem_minmax(0,1fr)]"
                  >
                    <span className="pt-0.5 text-paragraph-xs text-fg-muted tabular-nums">
                      {format.dateTime(e.at, { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="relative flex justify-center">
                      <span
                        aria-hidden
                        className={cn(
                          "absolute top-2 bottom-0 w-px bg-gray-2",
                          i === entries.length - 1 && "hidden",
                        )}
                      />
                      <span
                        role="img"
                        aria-label={tKind(e.kind)}
                        title={tKind(e.kind)}
                        className={cn("relative mt-1.5 size-2.5", KIND_SQUARE[e.kind])}
                      />
                    </span>
                    <div className="grid min-w-0 gap-0.5 pb-3">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-medium">{line(e)}</span>
                        {e.actor ? (
                          <span className="text-paragraph-xs text-fg-muted">{e.actor}</span>
                        ) : null}
                      </span>
                      {e.text ? <p className="line-clamp-3 text-fg-muted">{e.text}</p> : null}
                      {e.conversationId ? (
                        <Link
                          href={`/firma/gespraeche/${e.conversationId}`}
                          className="justify-self-start text-paragraph-xs text-contrast-green hover:underline"
                        >
                          {e.kind === "conversation"
                            ? t("openConversation")
                            : t("inConversation", {
                                title: titles.get(e.conversationId) || t("untitled"),
                              })}
                        </Link>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </Panel>
  );
}

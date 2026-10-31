import { Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { displayName } from "@/lib/firma/names";
import type { OutboxKind } from "@/lib/followups/taxonomy";
import { BusinessDate } from "./event-when";

export interface OutboxEmailView {
  id: string;
  kind: OutboxKind;
  sequence: number;
  toAddress: string;
  subject: string;
  body: string;
  sentOn: string;
  repliedAt: Date | null;
  firstName?: string | null;
  lastName?: string | null;
}

export function outboxKindKey(email: Pick<OutboxEmailView, "kind" | "sequence">) {
  if (email.kind === "yearly_checkin") return "yearly_checkin";
  return email.sequence > 1 ? "reminder" : "event_follow_up";
}

/** Mocked outbox: each email opens to its full text. */
export function OutboxList({
  emails,
  showCustomer = true,
}: {
  emails: OutboxEmailView[];
  showCustomer?: boolean;
}) {
  const t = useTranslations("followups.outbox");
  if (emails.length === 0) return <p className="text-fg-muted">{t("empty")}</p>;
  return (
    <ul className="grid divide-y divide-line rounded-m border border-line">
      {emails.map((email) => {
        const name =
          showCustomer && email.firstName !== undefined
            ? displayName({
                firstName: email.firstName ?? null,
                lastName: email.lastName ?? null,
              })
            : null;
        return (
          <li key={email.id}>
            <details className="group">
              <summary className="grid cursor-pointer list-none gap-1 px-3 py-2.5 hover:bg-gray-1 [&::-webkit-details-marker]:hidden">
                <span className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                  <Mail aria-hidden className="size-3.5" />
                  <BusinessDate date={email.sentOn} />
                  <Badge tone={email.kind === "yearly_checkin" ? "neutral" : "info"}>
                    {t(`kind.${outboxKindKey(email)}`)}
                  </Badge>
                  {email.repliedAt ? <Badge tone="success">{t("replied")}</Badge> : null}
                </span>
                <span className="font-medium group-open:text-pax-purple">{email.subject}</span>
                <span className="truncate text-xs text-fg-muted">
                  {name ? `${name} · ` : ""}
                  {t("to", { address: email.toAddress })}
                </span>
              </summary>
              <p className="border-t border-line bg-gray-1 px-3 py-3 whitespace-pre-wrap">
                {email.body}
              </p>
            </details>
          </li>
        );
      })}
    </ul>
  );
}

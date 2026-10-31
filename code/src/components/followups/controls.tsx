"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import {
  dismissEvent,
  recordReply,
  setCustomerCheckin,
} from "@/app/[locale]/firma/followup-actions";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

function ActionButton({
  label,
  action,
  variant = "secondary",
}: {
  label: string;
  action: () => Promise<void>;
  variant?: "secondary" | "ghost";
}) {
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant={variant} disabled={pending} onClick={() => start(() => action())}>
      {pending ? <Spinner /> : null}
      {label}
    </Button>
  );
}

/** Demo: the customer answered this email (there is no real inbox). */
export function RecordReplyButton({ emailId }: { emailId: string }) {
  const t = useTranslations("followups.card");
  return <ActionButton label={t("recordReply")} action={() => recordReply(emailId)} />;
}

export function DismissEventButton({ eventId }: { eventId: string }) {
  const t = useTranslations("followups.card");
  return <ActionButton label={t("dismiss")} variant="ghost" action={() => dismissEvent(eventId)} />;
}

export function CheckinToggle({ customerId, enabled }: { customerId: string; enabled: boolean }) {
  const t = useTranslations("followups.checkin");
  return (
    <ActionButton
      label={enabled ? t("turnOff") : t("turnOn")}
      variant="ghost"
      action={() => setCustomerCheckin(customerId, !enabled)}
    />
  );
}

"use client";

import { CalendarCheck, Headset } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { bookCallback } from "@/app/[locale]/chat/actions";
import { useChatActions } from "@/components/chat/chat-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import type { HandoverOutput } from "@/lib/advisor/types";
import { cn } from "@/lib/utils";
import type { WidgetProps } from "./types";
import { WidgetCard, WidgetFailed, WidgetPending } from "./widget-card";

const CHANNELS = ["phone", "video", "branch"] as const;
const TIMES = ["today", "tomorrowMorning", "tomorrowAfternoon", "eveningThisWeek"] as const;
type Channel = (typeof CHANNELS)[number];

/** Callback booking after a handover to a human advisor. */
export function HandoverWidget({ toolCallId, state, output }: WidgetProps) {
  const t = useTranslations("widgets.handover");
  if (state === "output-error") return <WidgetFailed icon={Headset} title={t("title")} />;
  if (state !== "output-available") return <WidgetPending icon={Headset} label={t("pending")} />;
  const data = output as HandoverOutput | undefined;
  if (!data?.handoverId) return null;
  return <HandoverBody toolCallId={toolCallId} data={data} />;
}

function HandoverBody({ toolCallId, data }: { toolCallId: string; data: HandoverOutput }) {
  const t = useTranslations("widgets.handover");
  const { conversationId, busy, sendMessage } = useChatActions();
  const [booked, setBooked] = useState(data.booked);
  const [channel, setChannel] = useState<Channel>("phone");
  const [time, setTime] = useState<(typeof TIMES)[number]>("tomorrowMorning");
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const needsPhone = (channel === "phone" || channel === "video") && !data.phone;

  if (booked) {
    return (
      <WidgetCard icon={CalendarCheck} title={t("bookedTitle")}>
        <p className="text-paragraph-s">
          {t("booked", {
            channel: t(`channels.${booked.channel as Channel}`),
            time: booked.preferredTime,
          })}
        </p>
      </WidgetCard>
    );
  }

  function submit(form: FormData) {
    const phone = String(form.get("phone") ?? "").trim() || undefined;
    const preferredTime = t(`times.${time}`);
    startTransition(async () => {
      const result = await bookCallback({
        conversationId,
        toolCallId,
        handoverId: data.handoverId,
        channel,
        preferredTime,
        phone,
      }).catch(() => ({ ok: false }));
      if (!result.ok) {
        setError(true);
        return;
      }
      setBooked({ channel, preferredTime });
      sendMessage(t("bookedMessage", { channel: t(`channels.${channel}`), time: preferredTime }));
    });
  }

  return (
    <WidgetCard icon={Headset} title={t("title")}>
      <p className="text-paragraph-s">{t("body")}</p>
      <form action={submit} className="mt-4 flex flex-col gap-4">
        <ChoiceGroup
          legend={t("channel")}
          options={CHANNELS.map((c) => [c, t(`channels.${c}`)])}
          value={channel}
          onChange={(v) => setChannel(v as Channel)}
        />
        <ChoiceGroup
          legend={t("time")}
          options={TIMES.map((v) => [v, t(`times.${v}`)])}
          value={time}
          onChange={(v) => setTime(v as (typeof TIMES)[number])}
        />
        {needsPhone ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`phone-${toolCallId}`} className="text-paragraph-xs font-medium">
              {t("phone")}
            </label>
            <Input
              id={`phone-${toolCallId}`}
              name="phone"
              type="tel"
              autoComplete="tel"
              required
              pattern="^\+?[0-9 \(\)\-]{6,20}$"
              placeholder="+41 79 123 45 67"
            />
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-paragraph-xs text-error-dark">
            {t("error")}
          </p>
        ) : null}
        <div>
          <Button type="submit" disabled={busy || pending}>
            {t("submit")}
          </Button>
        </div>
      </form>
    </WidgetCard>
  );
}

function ChoiceGroup({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: Array<[string, string]>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-paragraph-xs font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={key === value}
            onClick={() => onChange(key)}
            className={cn(
              "rounded-full border-[1.5px] px-3 py-1 text-paragraph-xs font-medium transition-colors",
              key === value
                ? "border-pax-purple bg-pax-purple text-white"
                : "border-line-strong hover:border-pax-purple",
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

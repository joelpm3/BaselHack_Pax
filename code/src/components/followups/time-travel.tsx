"use client";

import { CalendarClock, RotateCcw } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  resetFollowUpDemo,
  runFollowUpsNow,
  type TravelResult,
  travelTo,
} from "@/app/[locale]/firma/followup-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { addDays, addMonths } from "@/lib/documents/dates";
import type { RunSummary } from "@/lib/followups/engine";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "plusWeek", move: (d: string) => addDays(d, 7) },
  { key: "plusMonth", move: (d: string) => addMonths(d, 1) },
  { key: "plusHalfYear", move: (d: string) => addMonths(d, 6) },
  { key: "plusYear", move: (d: string) => addMonths(d, 12) },
] as const;

const SUMMARY_KEYS: Array<keyof RunSummary> = [
  "opened",
  "reminded",
  "lost",
  "reopened",
  "responded",
  "checkins",
  "failed",
];

/**
 * Demo control, folded into the page header: the button shows the business date, and opens the
 * moves that pretend today is another day so announced life events become due. Each move waits
 * for the follow-up engine (LLM emails take a moment).
 */
export function TimeTravel({ today, simulated }: { today: string; simulated: boolean }) {
  const t = useTranslations("followups.clock");
  const format = useFormatter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<TravelResult | null>(null);
  const [target, setTarget] = useState(today);

  const run = (action: () => Promise<TravelResult>) =>
    start(async () => {
      setResult(null);
      const next = await action();
      setResult(next);
      if (next.ok) setTarget(next.today);
    });

  const summaryText = (summary: RunSummary) => {
    const parts = SUMMARY_KEYS.filter((k) => summary[k] > 0).map((k) =>
      t(`summary.${k}`, { count: summary[k] }),
    );
    return parts.length > 0 ? parts.join(", ") : t("nothing");
  };

  return (
    <details className="group relative">
      <summary
        aria-label={t("label")}
        className={cn(
          "flex cursor-pointer list-none items-center gap-2 rounded-m border px-3 py-1.5 hover:bg-gray-1 [&::-webkit-details-marker]:hidden",
          simulated ? "border-pax-purple text-deep-purple" : "border-line",
        )}
      >
        {pending ? <Spinner /> : <CalendarClock aria-hidden className="size-4" />}
        <span className="tabular-nums">
          {format.dateTime(new Date(`${today}T12:00:00Z`), {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </span>
        {simulated ? (
          <span aria-hidden className="size-2 bg-pax-green" title={t("simulated")} />
        ) : null}
        <span className="sr-only">{simulated ? t("simulated") : t("real")}</span>
      </summary>

      <div className="absolute right-0 z-20 mt-2 grid w-[min(22rem,calc(100vw-2rem))] gap-3 rounded-xl border border-line bg-surface p-4">
        <p className="font-medium">{t("label")}</p>
        <div className="flex flex-wrap gap-2">
          {STEPS.map((step) => (
            <Button
              key={step.key}
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => run(() => travelTo(step.move(today)))}
            >
              {t(step.key)}
            </Button>
          ))}
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => travelTo(target));
          }}
        >
          <label htmlFor="time-travel-date" className="sr-only">
            {t("jumpTo")}
          </label>
          <Input
            id="time-travel-date"
            type="date"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="h-9 min-w-0 flex-1 py-0 text-paragraph-s"
          />
          <Button type="submit" size="sm" disabled={pending || !target}>
            {t("jump")}
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-fg-muted">
          <button
            type="button"
            disabled={pending}
            onClick={() => run(runFollowUpsNow)}
            className="underline-offset-4 hover:text-fg hover:underline disabled:opacity-60"
          >
            {t("run")}
          </button>
          {simulated ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => travelTo(null))}
              className="underline-offset-4 hover:text-fg hover:underline disabled:opacity-60"
            >
              {t("back")}
            </button>
          ) : null}
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(t("resetConfirm"))) return;
              start(async () => {
                setResult(null);
                await resetFollowUpDemo();
              });
            }}
            className="inline-flex items-center gap-1.5 underline-offset-4 hover:text-fg hover:underline disabled:opacity-60"
          >
            <RotateCcw aria-hidden className="size-3.5" />
            {t("reset")}
          </button>
        </div>
        <p aria-live="polite">
          {pending ? (
            <span className="inline-flex items-center gap-2">
              <Spinner />
              {t("working")}
            </span>
          ) : result ? (
            result.ok ? (
              summaryText(result.summary)
            ) : (
              t("invalid")
            )
          ) : null}
        </p>
      </div>
    </details>
  );
}

"use client";

import { RotateCcw } from "lucide-react";
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
 * Demo control: pretend today is another day so announced life events become due, then let the
 * follow-up engine write its emails. Each move waits for the engine (LLM emails take a moment).
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
    <section
      aria-label={t("label")}
      className="grid gap-4 rounded-xl bg-deep-purple p-5 text-white lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center lg:gap-8"
    >
      <div className="grid gap-1">
        <span className="flex items-center gap-2 text-white/70">
          <span
            aria-hidden
            className={cn("size-2.5", simulated ? "bg-pax-green" : "border border-white/60")}
          />
          {simulated ? t("simulated") : t("real")}
        </span>
        <span className="text-2xl font-bold tabular-nums">
          {format.dateTime(new Date(`${today}T12:00:00Z`), {
            weekday: "short",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </span>
      </div>

      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {STEPS.map((step) => (
            <Button
              key={step.key}
              size="sm"
              variant="inverse"
              disabled={pending}
              onClick={() => run(() => travelTo(step.move(today)))}
            >
              {t(step.key)}
            </Button>
          ))}
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
              className="h-9 w-auto border-white/40 bg-white/10 py-0 text-sm text-white [color-scheme:dark]"
            />
            <Button
              type="submit"
              size="sm"
              disabled={pending || !target}
              className="bg-white/12 hover:bg-white/20"
            >
              {t("jump")}
            </Button>
          </form>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-white/80">
          <button
            type="button"
            disabled={pending}
            onClick={() => run(runFollowUpsNow)}
            className="underline-offset-4 hover:text-white hover:underline disabled:opacity-60"
          >
            {t("run")}
          </button>
          {simulated ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => travelTo(null))}
              className="underline-offset-4 hover:text-white hover:underline disabled:opacity-60"
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
            className="inline-flex items-center gap-1.5 underline-offset-4 hover:text-white hover:underline disabled:opacity-60"
          >
            <RotateCcw aria-hidden className="size-3.5" />
            {t("reset")}
          </button>
        </div>
        <p aria-live="polite" className="min-h-5 text-white/90">
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
    </section>
  );
}

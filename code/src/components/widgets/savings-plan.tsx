"use client";

import { Target } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState, useTransition } from "react";
import { useChatActions } from "@/components/chat/chat-actions";
import { Spinner } from "@/components/ui/spinner";
import { recalculateSavingsPlan } from "@/lib/advisor/savings-actions";
import {
  SAVINGS_LIMITS,
  type SavingsPlanOutput,
  type SavingsPlanParams,
  type SavingsYear,
} from "@/lib/advisor/savings-plan";
import { cn } from "@/lib/utils";
import type { WidgetProps } from "./types";
import {
  FinePrint,
  isRecord,
  useChf,
  WidgetCard,
  WidgetFailed,
  WidgetPending,
} from "./widget-card";

/** Wait this long after the last slider move before asking Logismata again. */
const RECALCULATE_DELAY_MS = 350;

/** Savings goal: monthly amount needed, with sliders for goal, years and start capital. */
export function SavingsPlanWidget({ toolCallId, state, output }: WidgetProps) {
  const t = useTranslations("savingsPlan");
  if (state === "output-error") return <WidgetFailed icon={Target} title={t("title")} />;
  if (state !== "output-available") return <WidgetPending icon={Target} label={t("pending")} />;
  const data = output as SavingsPlanOutput | undefined;
  if (!data || data.status !== "ok" || !isRecord(data.params) || !Array.isArray(data.series))
    return null;
  return <SavingsPlanBody toolCallId={toolCallId} initial={data} />;
}

function SavingsPlanBody({
  toolCallId,
  initial,
}: {
  toolCallId: string;
  initial: SavingsPlanOutput;
}) {
  const t = useTranslations("savingsPlan");
  const chf = useChf();
  const { conversationId, busy } = useChatActions();
  const [result, setResult] = useState(initial);
  const [params, setParams] = useState(initial.params);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(0);
  // The slider ranges follow the Pax calculator but always fit the advisor's own values.
  const [ranges] = useState(() => ({
    goal: Math.max(300_000, initial.params.goal),
    startCapital: Math.max(100_000, initial.params.startCapital),
  }));

  function change(key: keyof SavingsPlanParams, value: number) {
    const next = { ...params, [key]: value };
    setParams(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const request = ++latest.current;
      startTransition(async () => {
        const recalculated = await recalculateSavingsPlan({
          conversationId,
          toolCallId,
          params: next,
        }).catch(() => null);
        if (request !== latest.current) return;
        if (recalculated) setResult(recalculated);
        setFailed(!recalculated);
      });
    }, RECALCULATE_DELAY_MS);
  }

  const { goal, years } = result.params;
  return (
    <WidgetCard
      icon={Target}
      title={t("title")}
      aside={pending ? <Spinner label={t("recalculating")} /> : null}
    >
      <div aria-live="polite" className={cn(pending && "opacity-60")}>
        {result.reachedWithoutSaving ? (
          <p className="text-heading-m font-bold">{t("reached")}</p>
        ) : (
          <p className="text-heading-m font-bold tabular-nums">
            {t("monthly", { amount: chf(result.monthly) })}
          </p>
        )}
        <p className="text-paragraph-s text-fg-muted">{t("goal", { amount: chf(goal), years })}</p>
      </div>

      {/* While the advisor answers, its message is not stored yet: a new plan could not be kept. */}
      <fieldset disabled={busy} className="mt-4 flex flex-col gap-3">
        <Slider
          label={t("params.goal")}
          display={chf(params.goal)}
          min={SAVINGS_LIMITS.goal.min}
          max={ranges.goal}
          step={1000}
          value={params.goal}
          onChange={(v) => change("goal", v)}
        />
        <Slider
          label={t("params.years")}
          display={t("yearsValue", { years: params.years })}
          min={SAVINGS_LIMITS.years.min}
          max={SAVINGS_LIMITS.years.max}
          step={1}
          value={params.years}
          onChange={(v) => change("years", v)}
        />
        <Slider
          label={t("params.startCapital")}
          display={chf(params.startCapital)}
          min={SAVINGS_LIMITS.startCapital.min}
          max={ranges.startCapital}
          step={1000}
          value={params.startCapital}
          onChange={(v) => change("startCapital", v)}
        />
      </fieldset>

      {failed ? (
        <p role="alert" className="mt-3 text-paragraph-xs text-error-dark">
          {t("failed")}
        </p>
      ) : null}

      <div className={cn("mt-5", pending && "opacity-60")}>
        <GrowthChart series={result.series} />
        <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Figure label={t("deposits")} value={chf(result.deposits)} kind="deposits" />
          <Figure label={t("interest")} value={chf(result.interest)} kind="interest" />
          <Figure label={t("endCapital")} value={chf(result.endCapital)} />
        </dl>
      </div>

      <FinePrint>{t("assumptions", { interest: result.assumptions.interestRate })}</FinePrint>
    </WidgetCard>
  );
}

function Slider({
  label,
  display,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  display: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex justify-between gap-3 text-paragraph-xs font-medium">
        <span>{label}</span>
        <span className="tabular-nums">{display}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={display}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-pax-purple"
      />
    </div>
  );
}

const FILL = { deposits: "bg-chart-2", interest: "bg-chart-1" } as const;

/** One column per year: what was paid in (purple) and the interest on top (green). */
function GrowthChart({ series }: { series: SavingsYear[] }) {
  const t = useTranslations("savingsPlan");
  const top = Math.max(1, ...series.map((s) => s.deposits + s.interest));
  if (series.length === 0) return null;
  return (
    <figure>
      <div aria-hidden className="flex h-24 items-end gap-px">
        {series.map((s) => (
          <div key={s.year} className="flex h-full flex-1 flex-col justify-end">
            <div className={FILL.interest} style={{ height: `${(s.interest / top) * 100}%` }} />
            <div className={FILL.deposits} style={{ height: `${(s.deposits / top) * 100}%` }} />
          </div>
        ))}
      </div>
      <figcaption className="mt-1 flex justify-between text-paragraph-xs text-fg-muted">
        <span>{t("yearsValue", { years: 1 })}</span>
        <span>{t("yearsValue", { years: series.length })}</span>
      </figcaption>
    </figure>
  );
}

function Figure({
  label,
  value,
  kind,
}: {
  label: string;
  value: string;
  kind?: keyof typeof FILL;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-m bg-surface-muted p-2.5">
      <dt className="flex items-center gap-1.5 text-paragraph-xs text-fg-muted">
        {kind ? <span aria-hidden className={cn("inline-block size-2.5", FILL[kind])} /> : null}
        {label}
      </dt>
      <dd className="text-paragraph-s font-bold tabular-nums">{value}</dd>
    </div>
  );
}

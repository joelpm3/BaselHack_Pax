"use client";

import { MessageSquareText, RotateCcw, Sprout } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useChatActions } from "@/components/chat/chat-actions";
import { Button } from "@/components/ui/button";
import {
  COMPOUND_LIMITS,
  COMPOUND_PARTS,
  type CompoundParams,
  type CompoundPart,
  clampCompound,
  compoundColumns,
  compoundGrowth,
} from "@/lib/advisor/explainers/compound-interest";
import type { CompoundInterestOutput } from "@/lib/advisor/explainers/types";
import { saveCompoundInputs } from "@/lib/advisor/widget-inputs-actions";
import type { WidgetProps } from "../types";
import {
  FinePrint,
  isRecord,
  useChf,
  WidgetCard,
  WidgetFailed,
  WidgetPending,
} from "../widget-card";
import { KeySquare, SquareColumns } from "./square-columns";

/** Interest on interest is the point of the widget, so it gets the strongest colour. */
const FILL: Record<CompoundPart, string> = {
  deposits: "bg-pax-purple border-pax-purple",
  interest: "bg-light-green border-pax-green",
  interestOnInterest: "bg-pax-green border-pax-green",
};

const MAX_COLUMNS = 12;
const MAX_ROWS = 18;
const PARAM_KEYS = ["startAmount", "monthlySaving", "ratePercent", "years"] as const;

/** Wait this long after the last slider move before storing the values for the advisor. */
const SAVE_DELAY_MS = 400;

export function CompoundInterestWidget({ toolCallId, state, output }: WidgetProps) {
  const t = useTranslations("explainers.compound");
  if (state === "output-error") return <WidgetFailed icon={Sprout} title={t("title")} />;
  if (state !== "output-available") return <WidgetPending icon={Sprout} label={t("pending")} />;
  const data = output as CompoundInterestOutput | undefined;
  if (!data || data.status !== "ok" || !isRecord(data.params)) return null;
  return <CompoundBody toolCallId={toolCallId} initial={data} />;
}

/** The customer's stored slider values (after a reload), or the tool's own. */
function startingParams(initial: CompoundInterestOutput): CompoundParams {
  const saved = initial.customerInputs?.values;
  if (!isRecord(saved)) return initial.params;
  const valid = PARAM_KEYS.every((key) => typeof saved[key] === "number");
  return valid ? clampCompound(saved as unknown as CompoundParams) : initial.params;
}

function CompoundBody({
  toolCallId,
  initial,
}: {
  toolCallId: string;
  initial: CompoundInterestOutput;
}) {
  const t = useTranslations("explainers.compound");
  const tShared = useTranslations("explainers");
  const chf = useChf();
  const locale = useLocale();
  const { conversationId, busy, sendMessage } = useChatActions();
  const [params, setParams] = useState<CompoundParams>(() => startingParams(initial));
  const [touched, setTouched] = useState<Set<keyof CompoundParams>>(() => {
    const start = startingParams(initial);
    return new Set(PARAM_KEYS.filter((key) => start[key] !== initial.params[key]));
  });
  const save = useInputsSaver(conversationId, toolCallId, busy);

  const rows = useMemo(() => compoundGrowth(params), [params]);
  const { unit, columns } = useMemo(
    () => compoundColumns(rows, { maxColumns: MAX_COLUMNS, maxSquares: MAX_ROWS }),
    [rows],
  );
  const last = rows[rows.length - 1] ?? rows[0];
  const amounts = {
    deposits: Math.round(last?.deposits ?? 0),
    interest: Math.round(last?.interest ?? 0),
    interestOnInterest: Math.round(last?.interestOnInterest ?? 0),
  };
  const total = amounts.deposits + amounts.interest + amounts.interestOnInterest;
  const share = total > 0 ? Math.round((amounts.interestOnInterest / total) * 100) : 0;
  const percent = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const display = (key: keyof CompoundParams, value: number) =>
    key === "years"
      ? t("years", { years: value })
      : key === "ratePercent"
        ? t("rate", { rate: percent.format(value) })
        : chf(value);

  function change(key: keyof CompoundParams, value: number) {
    const next = { ...params, [key]: value };
    setParams(next);
    setTouched((current) => new Set(current).add(key));
    save.schedule(next);
  }

  function reset() {
    setParams(initial.params);
    setTouched(new Set());
    save.schedule(initial.params);
  }

  async function discuss() {
    await save.flush();
    sendMessage(t("discussMessage", { params: summary, total: chf(total) }));
  }

  const summary = PARAM_KEYS.map(
    (key) => `${t(`params.${key}`)} ${display(key, params[key])}`,
  ).join(", ");

  return (
    <WidgetCard icon={Sprout} title={t("title")}>
      <p className="text-paragraph-s text-fg-muted">
        {initial.basis === "pillar3a"
          ? t("introPillar3a")
          : initial.basis === "own"
            ? t("introOwn")
            : t("introGeneral")}
      </p>

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-paragraph-s font-medium">{t("total", { years: params.years })}</span>
        <span className="text-heading-m font-bold tabular-nums" aria-live="polite">
          {chf(total)}
        </span>
      </div>

      <figure className="mt-4">
        <SquareColumns
          columns={columns.map((c) => ({ key: c.year, label: String(c.year), squares: c.squares }))}
          order={COMPOUND_PARTS}
          fill={FILL}
          className="min-h-24"
        />
        <figcaption className="mt-2 flex flex-wrap justify-between gap-x-3 text-paragraph-xs text-fg-muted">
          <span>{t("axis")}</span>
          <span>{t("unit", { amount: chf(unit) })}</span>
          <span className="sr-only">
            {t("chartSummary", {
              years: params.years,
              total: chf(total),
              deposits: chf(amounts.deposits),
              interest: chf(amounts.interest),
              interestOnInterest: chf(amounts.interestOnInterest),
            })}
          </span>
        </figcaption>
      </figure>

      <dl className="mt-4 flex flex-col gap-1.5">
        {COMPOUND_PARTS.map((part) => (
          <div key={part} className="flex items-center gap-2 text-paragraph-s">
            <KeySquare className={FILL[part]} />
            <dt className="flex-1">{t(`parts.${part}`)}</dt>
            <dd
              className={part === "interestOnInterest" ? "font-bold tabular-nums" : "tabular-nums"}
            >
              {chf(amounts[part])}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-paragraph-s">
        {params.ratePercent > 0 ? t("share", { share }) : t("noInterest")}
      </p>

      <div className="mt-5 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
        {PARAM_KEYS.map((key) => (
          <Slider
            key={key}
            name={key}
            label={t(`params.${key}`)}
            value={params[key]}
            valueText={display(key, params[key])}
            source={touched.has(key) ? null : t(`sources.${initial.sources[key]}`)}
            onChange={(value) => change(key, value)}
          />
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={busy} onClick={discuss}>
          <MessageSquareText aria-hidden />
          {tShared("discuss")}
        </Button>
        {touched.size > 0 ? (
          <Button size="sm" variant="ghost" onClick={reset}>
            <RotateCcw aria-hidden />
            {t("reset")}
          </Button>
        ) : null}
      </div>

      <FinePrint>{t("disclaimer", { rate: percent.format(params.ratePercent) })}</FinePrint>
    </WidgetCard>
  );
}

function Slider({
  name,
  label,
  value,
  valueText,
  source,
  onChange,
}: {
  name: keyof CompoundParams;
  label: string;
  value: number;
  valueText: string;
  source: string | null;
  onChange: (value: number) => void;
}) {
  const id = `${useId()}-${name}`;
  const { min, max, step } = COMPOUND_LIMITS[name];
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-paragraph-xs font-medium">
          {label}
        </label>
        <span className="text-paragraph-s font-bold tabular-nums">{valueText}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={valueText}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-6 w-full cursor-pointer accent-pax-purple"
      />
      {source ? <span className="text-paragraph-xs text-fg-muted">{source}</span> : null}
    </div>
  );
}

/** How often to retry values the server could not store yet (the turn's message is not saved). */
const SAVE_RETRIES = 3;

/**
 * Stores the slider values for the advisor, debounced; no chat message is sent. While a turn
 * runs, its message (perhaps this very widget) is not stored yet, so values that could not be
 * kept wait and go out again once the advisor has finished.
 */
function useInputsSaver(conversationId: string, toolCallId: string, busy: boolean) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<CompoundParams | null>(null);
  const retries = useRef(0);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const values = pending.current;
    if (!values) return;
    const saved = await saveCompoundInputs({ conversationId, toolCallId, values }).catch(
      () => false,
    );
    // Newer values replaced these meanwhile: their own timer sends them.
    if (pending.current !== values) return;
    if (saved) {
      pending.current = null;
      retries.current = 0;
    } else if (retries.current < SAVE_RETRIES) {
      retries.current += 1;
      timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS * 4);
    }
  }, [conversationId, toolCallId]);

  useEffect(() => {
    if (busy || !pending.current) return;
    retries.current = 0;
    void flush();
  }, [busy, flush]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const schedule = useCallback(
    (values: CompoundParams) => {
      pending.current = values;
      retries.current = 0;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush],
  );

  return { schedule, flush };
}

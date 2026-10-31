"use client";

import { MessageSquareText, RotateCcw, Sprout } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";
import { useChatActions } from "@/components/chat/chat-actions";
import { Button } from "@/components/ui/button";
import {
  COMPOUND_LIMITS,
  COMPOUND_PARTS,
  type CompoundParams,
  type CompoundPart,
  compoundColumns,
  compoundGrowth,
} from "@/lib/advisor/explainers/compound-interest";
import type { CompoundInterestOutput } from "@/lib/advisor/explainers/types";
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

export function CompoundInterestWidget({ state, output }: WidgetProps) {
  const t = useTranslations("explainers.compound");
  if (state === "output-error") return <WidgetFailed icon={Sprout} title={t("title")} />;
  if (state !== "output-available") return <WidgetPending icon={Sprout} label={t("pending")} />;
  const data = output as CompoundInterestOutput | undefined;
  if (!data || data.status !== "ok" || !isRecord(data.params)) return null;
  return <CompoundBody initial={data} />;
}

function CompoundBody({ initial }: { initial: CompoundInterestOutput }) {
  const t = useTranslations("explainers.compound");
  const tShared = useTranslations("explainers");
  const chf = useChf();
  const locale = useLocale();
  const { busy, sendMessage } = useChatActions();
  const [params, setParams] = useState<CompoundParams>(initial.params);
  const [touched, setTouched] = useState<Set<keyof CompoundParams>>(() => new Set());

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
    setParams((current) => ({ ...current, [key]: value }));
    setTouched((current) => new Set(current).add(key));
  }

  function reset() {
    setParams(initial.params);
    setTouched(new Set());
  }

  const summary = PARAM_KEYS.map(
    (key) => `${t(`params.${key}`)} ${display(key, params[key])}`,
  ).join(", ");

  return (
    <WidgetCard icon={Sprout} title={t("title")}>
      <p className="text-paragraph-s text-fg-muted">
        {initial.basis === "pillar3a" ? t("introPillar3a") : t("introGeneral")}
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
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => sendMessage(t("discussMessage", { params: summary, total: chf(total) }))}
        >
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

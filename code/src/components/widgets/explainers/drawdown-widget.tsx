"use client";

import { Hourglass } from "lucide-react";
import { useTranslations } from "next-intl";
import { columnYears, squareUnit } from "@/lib/advisor/explainers/compound-interest";
import type { CapitalDrawdownOutput, DrawdownSource } from "@/lib/advisor/explainers/types";
import type { WidgetProps } from "../types";
import { FinePrint, useChf, WidgetCard, WidgetFailed, WidgetPending } from "../widget-card";
import { SquareColumns } from "./square-columns";

const MAX_COLUMNS = 12;
const MAX_ROWS = 18;
const ORDER = ["capital"] as const;
const FILL = { capital: "bg-pax-purple border-pax-purple" };

/** How long a capital lasts with monthly withdrawals (Logismata), as shrinking square columns. */
export function DrawdownWidget({ state, input, output }: WidgetProps) {
  const t = useTranslations("explainers.drawdown");
  const chf = useChf();
  const source = (input as { source?: DrawdownSource } | undefined)?.source ?? "savings";
  const title = t(`titles.${source}`);
  if (state === "output-error") return <WidgetFailed icon={Hourglass} title={title} />;
  if (state !== "output-available") return <WidgetPending icon={Hourglass} label={t("pending")} />;
  const data = output as CapitalDrawdownOutput | undefined;
  if (!data || data.status !== "ok" || !Array.isArray(data.capitalByYear)) return null;

  const series = data.capitalByYear;
  const unit = squareUnit(series[0] ?? data.capital, MAX_ROWS);
  // Always start with the full capital, then evenly spaced years up to the last one.
  const indices = [
    0,
    ...(series.length > 1 ? columnYears(series.length - 1, MAX_COLUMNS - 1) : []),
  ];
  const columns = indices.map((i) => ({
    key: i,
    label: String(data.startAge + i),
    squares: { capital: Math.round((series[i] ?? 0) / unit) },
  }));
  const endAge = data.startAge + Math.max(0, series.length - 1);

  return (
    <WidgetCard icon={Hourglass} title={t(`titles.${data.source}`)}>
      <p className="text-paragraph-s text-fg-muted">
        {t("capital", { amount: chf(data.capital), age: data.startAge })} (
        {t(`capitalSources.${data.capitalSource}`)})
      </p>
      <p className="mt-2 text-heading-s font-bold">
        {data.withdrawalSource === "customer"
          ? t("lastsCustomer", {
              amount: chf(data.monthlyWithdrawal),
              years: data.years,
              months: data.months,
              age: data.lastsUntilAge,
            })
          : t("lastsCalculated", { amount: chf(data.monthlyWithdrawal), age: data.lastsUntilAge })}
      </p>

      {columns.length > 1 ? (
        <figure className="mt-4">
          <SquareColumns columns={columns} order={ORDER} fill={FILL} className="min-h-16" />
          <figcaption className="mt-2 flex flex-wrap justify-between gap-x-3 text-paragraph-xs text-fg-muted">
            <span>{t("axis")}</span>
            <span>{t("unit", { amount: chf(unit) })}</span>
            <span className="sr-only">
              {t("chartSummary", {
                start: chf(series[0] ?? data.capital),
                startAge: data.startAge,
                end: chf(series.at(-1) ?? 0),
                endAge,
              })}
            </span>
          </figcaption>
        </figure>
      ) : null}

      <FinePrint>{t("finePrint", { interest: data.interestRate })}</FinePrint>
    </WidgetCard>
  );
}

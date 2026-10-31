"use client";

import { Landmark } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { CapitalPayoutTaxOutput, CapitalPayoutYearResult } from "@/lib/advisor/capital-payout";
import type { WidgetProps } from "./types";
import { FinePrint, useChf, WidgetCard, WidgetFailed, WidgetPending } from "./widget-card";

type OkOutput = Extract<CapitalPayoutTaxOutput, { status: "ok" }>;

const AUTHORITIES = ["federal", "state", "community", "church"] as const;

/** Tax on a lump-sum payout from the pension fund or 3a, optionally staggered over several years. */
export function CapitalPayoutTaxWidget({ state, output }: WidgetProps) {
  const t = useTranslations("capitalPayout");
  if (state === "output-error") return <WidgetFailed icon={Landmark} title={t("title")} />;
  if (state !== "output-available") return <WidgetPending icon={Landmark} label={t("pending")} />;
  const data = output as CapitalPayoutTaxOutput | undefined;
  if (!data || data.status !== "ok" || !Array.isArray(data.years) || data.years.length === 0)
    return null;
  return <CapitalPayoutBody data={data} />;
}

function CapitalPayoutBody({ data }: { data: OkOutput }) {
  const t = useTranslations("capitalPayout");
  const chf = useChf();
  const percent = usePercent();
  const staggered = data.years.length > 1;
  const only = data.years[0];
  const sourceList = (year: CapitalPayoutYearResult) =>
    year.sources.map((s) => t(`sources.${s}`)).join(t("and"));

  return (
    <WidgetCard icon={Landmark} title={t("title")}>
      <p className="text-paragraph-s text-fg-muted">
        {staggered
          ? t("leadStaggered", { amount: chf(data.totalAmount), count: data.years.length })
          : t("lead", {
              amount: chf(only.amount),
              sources: sourceList(only),
              age: only.age,
            })}
        {data.place ? t("place", { place: data.place }) : ""}
      </p>
      <p className="mt-1 text-heading-m font-bold tabular-nums">
        {t("tax", { amount: chf(data.totalTax) })}
      </p>
      <p className="text-paragraph-s tabular-nums">{t("net", { amount: chf(data.netCapital) })}</p>

      {staggered ? (
        <ol className="mt-4 flex flex-col gap-2">
          {data.years.map((y) => (
            <li
              key={y.age}
              className="flex items-baseline justify-between gap-3 rounded-m bg-surface-muted p-2.5"
            >
              <span className="text-paragraph-xs">
                <span className="font-bold">{t("atAge", { age: y.age, year: y.year })}</span>{" "}
                {t("yearPayout", { amount: chf(y.amount), sources: sourceList(y) })}
              </span>
              <span className="shrink-0 text-paragraph-s font-bold tabular-nums">
                {chf(y.tax.total)}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Figure label={t("rate")} value={percent(only.taxPercent)} />
          {AUTHORITIES.filter((a) => a !== "church" || only.tax.church > 0).map((authority) => (
            <Figure
              key={authority}
              label={t(`authorities.${authority}`)}
              value={chf(only.tax[authority])}
            />
          ))}
        </dl>
      )}

      {data.singlePayout ? (
        <p className="mt-4 text-paragraph-s">
          {data.singlePayout.saving > 0
            ? t("comparison.saving", {
                age: data.singlePayout.age,
                tax: chf(data.singlePayout.tax),
                saving: chf(data.singlePayout.saving),
              })
            : t("comparison.none", {
                age: data.singlePayout.age,
                tax: chf(data.singlePayout.tax),
              })}
        </p>
      ) : null}

      <FinePrint>
        {t("assumptions", {
          joint: data.assumptions.jointlyTaxed ? "yes" : "no",
          children: data.assumptions.children,
        })}
      </FinePrint>
    </WidgetCard>
  );
}

function usePercent() {
  const locale = useLocale();
  return (value: number) =>
    `${new Intl.NumberFormat(`${locale}-CH`, { maximumFractionDigits: 1 }).format(value)} %`;
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-m bg-surface-muted p-2.5">
      <dt className="text-paragraph-xs text-fg-muted">{label}</dt>
      <dd className="text-paragraph-s font-bold tabular-nums">{value}</dd>
    </div>
  );
}

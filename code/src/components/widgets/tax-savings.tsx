"use client";

import { PiggyBank } from "lucide-react";
import { useTranslations } from "next-intl";
import type { TaxSavingsOutput } from "@/lib/advisor/types";
import type { WidgetProps } from "./types";
import {
  FinePrint,
  isRecord,
  useChf,
  WidgetCard,
  WidgetFailed,
  WidgetPending,
} from "./widget-card";

/** 3a (and optional pension-fund buy-in) tax effect for the customer's place of residence. */
export function TaxSavingsWidget({ state, output }: WidgetProps) {
  const t = useTranslations("widgets.tax");
  const chf = useChf();
  if (state === "output-error") return <WidgetFailed icon={PiggyBank} title={t("title")} />;
  if (state !== "output-available") return <WidgetPending icon={PiggyBank} label={t("pending")} />;
  const data = output as TaxSavingsOutput | undefined;
  if (!data || data.status !== "ok" || !isRecord(data.saving3a)) return null;
  const s = data.saving3a;

  return (
    <WidgetCard icon={PiggyBank} title={t("title")}>
      <p className="text-paragraph-s text-fg-muted">
        {t("contribution", { amount: chf(s.yearlyAmount), max: chf(s.max3a) })}
      </p>
      <p className="mt-1 text-heading-m font-bold tabular-nums">
        {t("yearly", { amount: chf(s.yearlyTaxSavings) })}
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Figure label={t("overall", { years: s.duration })} value={chf(s.overallTaxSavings)} />
        <Figure label={t("netCapital")} value={chf(s.netCapital)} />
        <Figure label={t("capitalTax")} value={chf(s.capitalTax)} />
      </dl>

      {data.buyIn ? (
        <section className="mt-5 border-t border-line pt-4">
          <h4 className="text-paragraph-s font-bold">
            {t("buyIn.title", { amount: chf(data.buyIn.amount), years: data.buyIn.years })}
          </h4>
          <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Figure label={t("buyIn.taxSavings")} value={chf(data.buyIn.taxSavings)} />
            <Figure label={t("buyIn.netInvestment")} value={chf(data.buyIn.netInvestment)} />
            <Figure
              label={t("buyIn.additionalPension")}
              value={chf(data.buyIn.additionalPension)}
            />
          </dl>
        </section>
      ) : null}

      <FinePrint>{t("assumptions", { interest: data.assumptions.interestRate })}</FinePrint>
    </WidgetCard>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-m bg-surface-muted p-2.5">
      <dt className="text-paragraph-xs text-fg-muted">{label}</dt>
      <dd className="text-paragraph-s font-bold tabular-nums">{value}</dd>
    </div>
  );
}

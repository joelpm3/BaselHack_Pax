"use client";

import { Landmark } from "lucide-react";
import { useTranslations } from "next-intl";
import { monthlyChf } from "@/components/vorsorgebild/grid";
import { SquareGrid } from "@/components/vorsorgebild/square-grid";
import { LegendSquare } from "@/components/vorsorgebild/square-style";
import type { PensionOverviewOutput } from "@/lib/advisor/types";
import type { WidgetProps } from "./types";
import {
  FinePrint,
  isRecord,
  useChf,
  WidgetCard,
  WidgetFailed,
  WidgetPending,
} from "./widget-card";

/** Three-pillar retirement overview: what each pillar pays against the need, and the gap. */
export function PensionOverviewWidget({ state, output }: WidgetProps) {
  const t = useTranslations("widgets.pension");
  const chf = useChf();
  if (state === "output-error") return <WidgetFailed icon={Landmark} title={t("title")} />;
  if (state !== "output-available") return <WidgetPending icon={Landmark} label={t("pending")} />;
  const data = output as PensionOverviewOutput | undefined;
  if (!data || data.status !== "ok" || !isRecord(data.breakdown)) return null;
  const b = data.breakdown;
  const pillars = [
    { key: "pillar1", label: t("pillar1"), amount: b.pillar1 },
    { key: "pillar2", label: t("pillar2"), amount: b.pillar2 },
    { key: "other", label: t("other"), amount: b.other },
  ] as const;

  return (
    <WidgetCard icon={Landmark} title={t("title", { age: data.retirementAge })}>
      <dl className="grid grid-cols-3 gap-2">
        {pillars.map((pillar) => (
          <div key={pillar.key} className="flex flex-col gap-1 rounded-m bg-surface-muted p-2.5">
            <dt className="flex items-center gap-1.5 text-paragraph-xs text-fg-muted">
              <LegendSquare kind={pillar.key} />
              {pillar.label}
            </dt>
            <dd className="text-paragraph-s font-bold tabular-nums">
              {chf(monthlyChf(pillar.amount))}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex flex-col gap-2">
        <SquareGrid breakdown={b} size="md" columns={10} />
        <p className="text-paragraph-xs text-fg-muted">{t("unit")}</p>
      </div>

      <dl className="mt-4 flex flex-col gap-1 border-t border-line pt-3 text-paragraph-s">
        <div className="flex justify-between gap-3">
          <dt>{t("need", { percent: data.assumptions.needPercent })}</dt>
          <dd className="tabular-nums">{chf(monthlyChf(b.need))}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>{t("total")}</dt>
          <dd className="tabular-nums">{chf(monthlyChf(b.total))}</dd>
        </div>
        <div className="flex justify-between gap-3 font-bold">
          <dt>{b.gap > 0 ? t("gap") : t("surplus")}</dt>
          <dd className={b.gap > 0 ? "tabular-nums" : "tabular-nums text-contrast-green"}>
            {chf(monthlyChf(b.gap > 0 ? b.gap : b.surplus))}
          </dd>
        </div>
      </dl>
      {b.gap > 0 && b.capitalGap > 0 ? (
        <p className="mt-2 text-paragraph-xs text-fg-muted">
          {t("capitalGap", { amount: chf(b.capitalGap), year: data.retirementYear })}
        </p>
      ) : null}

      <FinePrint>
        {data.household ? `${t("household")} ` : ""}
        {data.assumptions.pillar2Estimated ? `${t("estimated")} ` : ""}
        {t("assumptions", { interest: data.assumptions.interestRate })}
      </FinePrint>
    </WidgetCard>
  );
}

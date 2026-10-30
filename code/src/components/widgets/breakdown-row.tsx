"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { monthlyChf, SOURCES } from "@/components/vorsorgebild/grid";
import { SquareGrid } from "@/components/vorsorgebild/square-grid";
import { LegendSquare } from "@/components/vorsorgebild/square-style";
import type { IncomeBreakdown } from "@/lib/advisor/types";
import { cn } from "@/lib/utils";
import { useChf } from "./widget-card";

/** One situation as a row of squares with its gap, Vorsorgecheck style. */
export function BreakdownRow({
  label,
  breakdown,
  emphasis = false,
}: {
  label: ReactNode;
  breakdown: IncomeBreakdown;
  emphasis?: boolean;
}) {
  const t = useTranslations("widgets.breakdown");
  const chf = useChf();
  const gap = monthlyChf(breakdown.gap);
  const status =
    breakdown.need === 0 ? t("noNeed") : gap > 0 ? t("gap", { amount: chf(gap) }) : t("covered");
  const description = [
    ...SOURCES.filter((s) => breakdown[s] > 0).map(
      (s) => `${t(`sources.${s}`)} ${chf(monthlyChf(breakdown[s]))}`,
    ),
    `${t("need")} ${chf(monthlyChf(breakdown.need))}`,
    status,
  ].join(", ");

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className={cn("text-paragraph-xs", emphasis ? "font-bold" : "font-medium")}>
          {label}
        </span>
        <span
          className={cn(
            "text-right text-paragraph-xs tabular-nums",
            gap > 0 && breakdown.need > 0 ? "font-bold text-ink" : "text-contrast-green",
          )}
        >
          {status}
        </span>
      </div>
      {breakdown.need > 0 || breakdown.total > 0 ? (
        <SquareGrid breakdown={breakdown} size="sm" />
      ) : null}
      <span className="sr-only">{description}</span>
    </div>
  );
}

/** Legend for the sources that appear in the given breakdowns. */
export function BreakdownLegend({ breakdowns }: { breakdowns: IncomeBreakdown[] }) {
  const t = useTranslations("widgets.breakdown");
  const used = SOURCES.filter((s) => breakdowns.some((b) => b[s] > 0));
  const hasGap = breakdowns.some((b) => b.gap > 0);
  return (
    <ul aria-hidden className="flex flex-wrap gap-x-4 gap-y-1 text-paragraph-xs text-fg-muted">
      {used.map((source) => (
        <li key={source} className="flex items-center gap-1.5">
          <LegendSquare kind={source} />
          {t(`sources.${source}`)}
        </li>
      ))}
      {hasGap ? (
        <li className="flex items-center gap-1.5">
          <LegendSquare kind="gap" />
          {t("sources.gap")}
        </li>
      ) : null}
      <li>{t("unit")}</li>
    </ul>
  );
}

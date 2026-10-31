"use client";

import { Check, Circle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { ProductCode } from "@/lib/domain/products";
import type { QuoteIssue, QuoteRider, ScenarioValues } from "@/lib/pricing/types";
import type { CoverView, Criterion, PriceView } from "@/lib/sales/types";
import { cn, formatChf } from "@/lib/utils";

export function useMoney() {
  const locale = useLocale();
  return {
    chf: (amount: number) => formatChf(Math.round(amount), locale),
    chf2: (amount: number) => formatChf(amount, locale, 2),
  };
}

/** "Richtwert gemäss Pax-Tarif, unverbindlich" or "Geschätzt, unverbindlich". */
export function PriceSourceBadge({ source }: { source: PriceView["source"] }) {
  const t = useTranslations("sales.price");
  return (
    <Badge
      tone={source === "quicksale" ? "info" : "warning"}
      className="rounded-m whitespace-normal"
    >
      {source === "quicksale" ? t("labelQuicksale") : t("labelEstimate")}
    </Badge>
  );
}

/** The premium as the customer pays it, the surplus-reduced amount and the price source. */
export function PriceTag({ price }: { price: PriceView }) {
  const t = useTranslations("sales.price");
  const { chf, chf2 } = useMoney();
  const single = price.singlePremium ?? 0;
  const free = price.annualGross === 0 && single === 0;
  return (
    <div className="flex flex-col gap-1.5">
      {free ? (
        <p className="text-heading-s font-bold">{t("free")}</p>
      ) : single > 0 && price.annualGross === 0 ? (
        <p className="text-heading-s font-bold">
          {chf(single)} <span className="text-paragraph-s font-normal">{t("once")}</span>
        </p>
      ) : (
        <p className="text-heading-s font-bold tabular-nums">
          {chf2(price.annualGross)}{" "}
          <span className="text-paragraph-s font-normal">{t("perYear")}</span>
        </p>
      )}
      {price.annualNet > 0 && price.annualNet < price.annualGross - 0.04 ? (
        <p className="text-paragraph-xs text-fg-muted">
          {t("net", { amount: chf2(price.annualNet) })}
        </p>
      ) : null}
      <div>
        <PriceSourceBadge source={price.source} />
      </div>
    </div>
  );
}

/** Projected values; the medium scenario is the one Pax offers headline. */
export function ScenarioList({
  title,
  values,
  note,
}: {
  title: string;
  values: ScenarioValues;
  note?: string;
}) {
  const t = useTranslations("sales.price");
  const { chf } = useMoney();
  const rows = (["guaranteed", "low", "medium", "high"] as const).filter(
    (k) => values[k] !== undefined,
  );
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-paragraph-xs font-medium">{title}</p>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-paragraph-xs">
        {rows.map((key) => (
          <div key={key} className="contents">
            <dt className={cn(key === "medium" ? "font-medium" : "text-fg-muted")}>
              {t(`scenario.${key}`)}
            </dt>
            <dd className={cn("text-right tabular-nums", key === "medium" && "font-medium")}>
              {chf(values[key] ?? 0)}
            </dd>
          </div>
        ))}
      </dl>
      {note ? <p className="text-paragraph-xs text-fg-muted">{note}</p> : null}
    </div>
  );
}

export function RiderList({ riders }: { riders: QuoteRider[] }) {
  const t = useTranslations("sales.riders");
  const { chf2 } = useMoney();
  if (riders.length === 0) return null;
  return (
    <ul className="flex flex-col gap-0.5 text-paragraph-xs">
      {riders.map((r) => (
        <li key={`${r.code}-${r.name}`} className="flex justify-between gap-3">
          <span>{r.code && t.has(r.code) ? t(r.code) : r.name}</span>
          <span className="tabular-nums text-fg-muted">
            {r.premiumAnnual > 0 ? chf2(r.premiumAnnual) : t("included")}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function IssueList({ issues }: { issues: QuoteIssue[] }) {
  const t = useTranslations("sales.issues");
  const shown = issues.filter((i) => i.code !== "quicksale_unavailable");
  if (shown.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 text-paragraph-xs text-warning-dark">
      {shown.map((issue) => (
        <li key={`${issue.code}-${JSON.stringify(issue.params ?? {})}`}>
          {t(issue.code, issue.params ?? {})}
        </li>
      ))}
    </ul>
  );
}

export function CriteriaList({ criteria }: { criteria: Criterion[] }) {
  const t = useTranslations("sales.recommendation");
  return (
    <ul className="flex flex-col gap-2">
      {criteria.map((c) => (
        <li key={c.criterion} className="flex items-start gap-2 text-paragraph-xs">
          {c.met ? (
            <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-contrast-green" />
          ) : (
            <Circle aria-hidden className="mt-0.5 size-4 shrink-0 text-gray-5" />
          )}
          <span>
            <span className="font-medium">{c.criterion}</span>
            <span className="sr-only"> ({c.met ? t("met") : t("open")})</span>
            <span className="block text-fg-muted">{c.value}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Label/value pairs; one column on phones, two from `sm`. */
export function FactGrid({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col">
          <dt className="text-paragraph-xs text-fg-muted">{item.label}</dt>
          <dd className="text-paragraph-s font-medium">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** What is insured, for how long, in which pillar. */
export function CoverFacts({
  productCode,
  pillar,
  cover,
  price,
  extra = [],
}: {
  productCode: ProductCode;
  pillar: "3a" | "3b" | null;
  cover: CoverView;
  price: PriceView | null;
  extra?: Array<{ label: string; value: ReactNode }>;
}) {
  const t = useTranslations("sales.cover");
  const { chf } = useMoney();
  const items: Array<{ label: string; value: ReactNode }> = [];
  if (productCode === "todesfall" && cover.sumInsured)
    items.push({ label: t("sumInsured"), value: chf(cover.sumInsured) });
  if (cover.annualPension && productCode === "erwerbsunfaehigkeit") {
    items.push({
      label: t("annualPension"),
      value: t("perYear", { amount: chf(cover.annualPension) }),
    });
    if (cover.waitingPeriodMonths)
      items.push({
        label: t("waitingPeriod"),
        value: t("months", { months: cover.waitingPeriodMonths }),
      });
  }
  if (cover.annualPremium && productCode !== "todesfall" && productCode !== "erwerbsunfaehigkeit")
    items.push({
      label: t("savingsPremium"),
      value: t("perYear", { amount: chf(cover.annualPremium) }),
    });
  if (cover.singlePremium)
    items.push({ label: t("singlePremium"), value: chf(cover.singlePremium) });
  if (price?.payoutAnnual?.medium)
    items.push({
      label: t("payout"),
      value: t("perYear", { amount: chf(price.payoutAnnual.medium) }),
    });
  if (productCode !== "care")
    items.push({
      label: t("duration"),
      value: t("durationValue", { years: cover.durationYears, endAge: cover.endAge }),
    });
  if (pillar) items.push({ label: t("pillar"), value: t(`pillar${pillar}`) });
  return <FactGrid items={[...items, ...extra]} />;
}

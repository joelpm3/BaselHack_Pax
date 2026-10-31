"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import type { PictureKind, PictureScenario, VorsorgebildModel } from "@/lib/advisor/types";
import { cn, formatChf } from "@/lib/utils";
import { monthlyChf, SOURCES } from "./grid";
import { SquareGrid } from "./square-grid";
import { LegendSquare } from "./square-style";

const ORDER: PictureKind[] = ["retirement", "disability", "death"];

export function pickDefault(model: VorsorgebildModel): PictureKind | null {
  return ORDER.find((k) => model.scenarios.some((s) => s.kind === k)) ?? null;
}

/** The full Vorsorgebild: desktop side panel and the content of the mobile sheet. */
export function VorsorgebildPanel({ model }: { model: VorsorgebildModel }) {
  const t = useTranslations("chat.picture");
  const [selected, setSelected] = useState<PictureKind | null>(null);
  const kind =
    selected && model.scenarios.some((s) => s.kind === selected) ? selected : pickDefault(model);
  const scenario = model.scenarios.find((s) => s.kind === kind);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="text-heading-s font-bold">{t("title")}</h2>
        <p className="flex items-center gap-1.5 text-paragraph-xs text-fg-muted">
          <span aria-hidden className="inline-block size-2.5 bg-pax-purple" />
          {t("unit")}
        </p>
      </header>

      {scenario ? (
        <>
          <ScenarioTabs model={model} kind={scenario.kind} onSelect={setSelected} />
          <ScenarioPicture scenario={scenario} />
        </>
      ) : (
        <Building model={model} />
      )}

      <Pillars model={model} />
    </div>
  );
}

function ScenarioTabs({
  model,
  kind,
  onSelect,
}: {
  model: VorsorgebildModel;
  kind: PictureKind;
  onSelect: (kind: PictureKind) => void;
}) {
  const t = useTranslations("chat.picture.tabs");
  return (
    <div role="tablist" aria-label={t("label")} className="flex gap-1 rounded-m bg-gray-2 p-1">
      {ORDER.map((k) => {
        const available = model.scenarios.some((s) => s.kind === k);
        return (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={k === kind}
            disabled={!available}
            onClick={() => onSelect(k)}
            className={cn(
              "flex-1 rounded-sm px-2 py-1.5 text-paragraph-xs font-medium transition-colors",
              k === kind ? "bg-surface text-ink" : "text-fg-muted hover:text-ink",
              "disabled:cursor-not-allowed disabled:text-gray-4",
            )}
          >
            {t(k)}
          </button>
        );
      })}
    </div>
  );
}

function ScenarioPicture({ scenario }: { scenario: PictureScenario }) {
  const t = useTranslations("chat.picture");
  const locale = useLocale();
  const { breakdown } = scenario;
  const chf = (annual: number) => formatChf(monthlyChf(annual), locale);
  const sources = SOURCES.filter((s) => breakdown[s] > 0);

  if (breakdown.need === 0) {
    return <p className="text-paragraph-s text-fg-muted">{t(`noNeed.${scenario.kind}`)}</p>;
  }

  return (
    <section aria-labelledby="vorsorgebild-figures" className="flex flex-col gap-4">
      <div>
        <p className="text-paragraph-xs text-fg-muted">{t(`context.${scenario.kind}`)}</p>
        <p id="vorsorgebild-figures" className="mt-1 text-heading-s font-bold">
          {breakdown.gap > 0 ? t("gap", { amount: chf(breakdown.gap) }) : t("covered")}
        </p>
      </div>

      <SquareGrid
        key={`${scenario.kind}-${scenario.calculatedAt}`}
        breakdown={breakdown}
        columns={10}
        size="lg"
        animate
      />

      <ul className="flex flex-col gap-1.5 text-paragraph-xs">
        {sources.map((source) => (
          <li key={source} className="flex items-center gap-2">
            <LegendSquare kind={source} />
            <span className="flex-1">{t(`sources.${source}`)}</span>
            <span className="tabular-nums">{chf(breakdown[source])}</span>
          </li>
        ))}
        {breakdown.gap > 0 ? (
          <li className="flex items-center gap-2 font-medium">
            <LegendSquare kind="gap" />
            <span className="flex-1">{t("sources.gap")}</span>
            <span className="tabular-nums">{chf(breakdown.gap)}</span>
          </li>
        ) : null}
        <li className="mt-1 flex items-center gap-2 border-t border-line pt-2 text-fg-muted">
          <span aria-hidden className="size-3" />
          <span className="flex-1">{t("need")}</span>
          <span className="tabular-nums">{chf(breakdown.need)}</span>
        </li>
      </ul>

      <table className="sr-only">
        <caption>{t("table.caption")}</caption>
        <tbody>
          {sources.map((source) => (
            <tr key={source}>
              <th scope="row">{t(`sources.${source}`)}</th>
              <td>{chf(breakdown[source])}</td>
            </tr>
          ))}
          <tr>
            <th scope="row">{t("need")}</th>
            <td>{chf(breakdown.need)}</td>
          </tr>
          <tr>
            <th scope="row">{t("sources.gap")}</th>
            <td>{chf(breakdown.gap)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function Building({ model }: { model: VorsorgebildModel }) {
  const t = useTranslations("chat.picture.building");
  const tf = useTranslations("chat.picture.facts");
  const known = model.facts.filter((f) => f.known).length;
  return (
    <section className="flex flex-col gap-4">
      <div>
        <p className="text-heading-s font-bold">{t("title")}</p>
        <p className="mt-1 text-paragraph-s text-fg-muted">{t("body")}</p>
      </div>
      <ul
        className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-x-3 gap-y-2.5"
        aria-label={t("known", { count: known, total: model.facts.length })}
      >
        {model.facts.map((fact) => (
          <li key={fact.key} className="flex min-w-0 items-center gap-2 text-paragraph-xs">
            <span
              aria-hidden
              className={cn(
                "size-4 shrink-0 border-[1.5px] transition-colors duration-500",
                fact.known ? "border-pax-purple bg-pax-purple" : "border-gray-4",
              )}
            />
            <span className={cn("min-w-0 hyphens-auto", fact.known ? "text-ink" : "text-fg-muted")}>
              {tf(fact.key)}
              <span className="sr-only">: {fact.known ? t("factKnown") : t("factOpen")}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Pillars({ model }: { model: VorsorgebildModel }) {
  const t = useTranslations("chat.picture.pillars");
  const locale = useLocale();
  const { pillars } = model;
  const p2 =
    pillars.hasPensionFund === false
      ? t("p2No")
      : pillars.pensionCapital !== null
        ? t("p2Capital", { amount: formatChf(pillars.pensionCapital, locale) })
        : pillars.hasPensionFund
          ? t("p2Yes")
          : t("open");
  const p3Parts = [
    pillars.pillar3aBalance !== null
      ? t("p3Balance", { amount: formatChf(pillars.pillar3aBalance, locale) })
      : null,
    pillars.pillar3aContribution !== null
      ? t("p3Contribution", { amount: formatChf(pillars.pillar3aContribution, locale) })
      : null,
    pillars.policies > 0 ? t("policies", { count: pillars.policies }) : null,
  ].filter(Boolean);
  const rows = [
    { key: "p1", label: t("p1"), value: t("p1Status") },
    { key: "p2", label: t("p2"), value: p2 },
    { key: "p3", label: t("p3"), value: p3Parts.length ? p3Parts.join(", ") : t("open") },
  ];
  return (
    <section>
      <h3 className="text-paragraph-s font-bold">{t("title")}</h3>
      <dl className="mt-2 flex flex-col divide-y divide-line">
        {rows.map((row) => (
          <div key={row.key} className="flex flex-col gap-0.5 py-2">
            <dt className="text-paragraph-xs font-medium">{row.label}</dt>
            <dd className="text-paragraph-xs text-fg-muted">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

"use client";

import { ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { RiskAnalysisOutput, RiskPersonResult } from "@/lib/advisor/types";
import { cn } from "@/lib/utils";
import { BreakdownLegend, BreakdownRow } from "./breakdown-row";
import { usePolicyCoverText } from "./policy-cover-note";
import type { WidgetProps } from "./types";
import { FinePrint, WidgetCard, WidgetFailed, WidgetPending } from "./widget-card";

const ORDER = [
  ["disability", "illness"],
  ["disability", "accident"],
  ["death", "illness"],
  ["death", "accident"],
] as const;

/** Gap chart in the style of the Pax Vorsorgecheck: disability and death, illness vs accident. */
export function RiskAnalysisWidget({ state, output }: WidgetProps) {
  const t = useTranslations("widgets.risk");
  const [personIndex, setPersonIndex] = useState(0);
  const policyCoverText = usePolicyCoverText();
  if (state === "output-error") return <WidgetFailed icon={ShieldAlert} title={t("title")} />;
  if (state !== "output-available")
    return <WidgetPending icon={ShieldAlert} label={t("pending")} />;
  const data = output as RiskAnalysisOutput | undefined;
  if (!data || data.status !== "ok" || !Array.isArray(data.persons) || data.persons.length === 0)
    return null;
  const persons = data.persons;
  const person = persons[Math.min(personIndex, persons.length - 1)];
  const name = (p: RiskPersonResult) => p.firstName ?? (p.person === 1 ? t("you") : t("partner"));
  // Results stored before policies were counted have no policyCover.
  const cover = Array.isArray(data.policyCover)
    ? data.policyCover.find((c) => c.person === person.person)
    : undefined;
  const coverText = person.retired ? "" : policyCoverText(cover, ["disability", "death"]);

  return (
    <WidgetCard icon={ShieldAlert} title={t("title")}>
      {persons.length > 1 ? (
        <div
          role="tablist"
          aria-label={t("persons")}
          className="mb-4 flex gap-1 rounded-m bg-gray-2 p-1"
        >
          {persons.map((p, i) => (
            <button
              key={p.person}
              type="button"
              role="tab"
              aria-selected={i === personIndex}
              onClick={() => setPersonIndex(i)}
              className={cn(
                "flex-1 rounded-sm px-2 py-1.5 text-paragraph-xs font-medium",
                i === personIndex ? "bg-surface text-ink" : "text-fg-muted hover:text-ink",
              )}
            >
              {t("ifHappensTo", { name: name(p) })}
            </button>
          ))}
        </div>
      ) : null}

      {person.retired ? (
        <p className="text-paragraph-s text-fg-muted">{t("retired", { name: name(person) })}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {ORDER.map(([event, cause]) => {
            const scenario = person.scenarios.find((s) => s.event === event && s.cause === cause);
            if (!scenario) return null;
            return (
              <BreakdownRow
                key={`${event}-${cause}`}
                label={t(`${event}.${cause}`)}
                breakdown={scenario.breakdown}
                emphasis={cause === "illness"}
              />
            );
          })}
          <BreakdownLegend breakdowns={person.scenarios.map((s) => s.breakdown)} />
        </div>
      )}

      <FinePrint>
        {data.assumptions.pillar2Estimated ? `${t("estimated")} ` : ""}
        {t("assumptions", {
          need: data.assumptions.needPercent,
          deathNeed: data.assumptions.deathNeedPercent ?? 70,
        })}
        {coverText ? ` ${coverText}` : ""}
      </FinePrint>
    </WidgetCard>
  );
}

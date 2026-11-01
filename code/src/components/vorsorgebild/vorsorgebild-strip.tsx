"use client";

import { ChevronUp, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef } from "react";
import { cn, formatChf } from "@/lib/utils";
import { monthlyChf, targetBreakdown } from "./grid";
import { SquareGrid } from "./square-grid";
import {
  DiscussedMark,
  shownKind,
  VorsorgebildPanel,
  type VorsorgebildPanelProps,
} from "./vorsorgebild-panel";

/**
 * Mobile: a compact strip under the header that opens the full picture as a bottom sheet. It
 * follows the situation Clara talks about without opening the sheet.
 */
export function VorsorgebildStrip({ model, focus, onSelect }: VorsorgebildPanelProps) {
  const t = useTranslations("chat.picture");
  const locale = useLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  const kind = shownKind(model, focus);
  const scenario = model.scenarios.find((s) => s.kind === kind);
  const known = model.facts.filter((f) => f.known).length;
  // Before the first calculation the strip shows the open need (a retirement figure), like the panel.
  const squares =
    scenario?.breakdown ??
    (kind === null || kind === "retirement" ? targetBreakdown(model.pillars.incomeToday) : null);
  const discussed = focus.byAdvisor && focus.kind === kind;

  // Whose gap it is, and whether it rests on estimates or a calculation older than the profile.
  const scenarioKind = scenario
    ? scenario.personName && scenario.kind !== "retirement"
      ? t("strip.kindOf", { kind: t(`tabs.${scenario.kind}`), name: scenario.personName })
      : t(`tabs.${scenario.kind}`)
    : "";
  const provisional = Boolean(scenario?.estimated || model.pending);
  const summary = scenario
    ? scenario.breakdown.gap > 0
      ? t(provisional ? "strip.gapEstimated" : "strip.gap", {
          kind: scenarioKind,
          amount: formatChf(monthlyChf(scenario.breakdown.gap), locale),
        })
      : t(provisional ? "strip.coveredEstimated" : "strip.covered", { kind: scenarioKind })
    : kind && focus.kind
      ? t("strip.open", { kind: t(`tabs.${kind}`) })
      : t("strip.building", { count: known, total: model.facts.length });

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="flex w-full items-center gap-3 border-b border-line bg-surface px-4 py-2.5 text-left"
        aria-haspopup="dialog"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="flex items-start justify-between gap-2">
            <span className="text-paragraph-xs font-bold">{t("title")}</span>
            <span
              // A new situation fades in, so a switch while the sheet is closed gets noticed.
              key={`${kind}-${focus.seq}`}
              className={cn(
                "flex min-w-0 items-center gap-1.5 text-paragraph-xs transition-opacity duration-500 starting:opacity-0",
                discussed ? "font-medium text-ink" : "text-fg-muted",
              )}
            >
              {discussed ? <DiscussedMark focus={focus} /> : null}
              <span className="line-clamp-2 text-right">{summary}</span>
            </span>
          </span>
          {squares ? (
            <SquareGrid
              key={scenario ? `${scenario.kind}-${scenario.calculatedAt}` : squares.need}
              breakdown={squares}
              size="xs"
              animate
              className="max-h-[22px] overflow-hidden"
            />
          ) : (
            // Facts are circles: squares always stand for money in the Vorsorgebild.
            <span aria-hidden className="flex gap-1">
              {model.facts.map((fact) => (
                <span
                  key={fact.key}
                  className={cn(
                    "size-2 rounded-full",
                    fact.known ? "bg-pax-purple" : "border border-gray-4",
                  )}
                />
              ))}
            </span>
          )}
        </span>
        <ChevronUp aria-hidden className="size-5 shrink-0 text-fg-muted" />
        <span className="sr-only">{t("open")}</span>
      </button>

      <dialog
        ref={dialog}
        aria-label={t("title")}
        className="m-0 mt-auto max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-[20px] bg-surface p-0 backdrop:bg-ink/40"
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current?.close();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") dialog.current?.close();
        }}
      >
        <div className="flex justify-end px-3 pt-3">
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="rounded-full p-2 text-fg-muted hover:bg-gray-1"
          >
            <X aria-hidden className="size-5" />
            <span className="sr-only">{t("close")}</span>
          </button>
        </div>
        <div className="px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <VorsorgebildPanel model={model} focus={focus} onSelect={onSelect} />
        </div>
      </dialog>
    </>
  );
}

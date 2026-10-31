"use client";

import { ChevronUp, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef } from "react";
import type { VorsorgebildModel } from "@/lib/advisor/types";
import { cn, formatChf } from "@/lib/utils";
import { monthlyChf, targetBreakdown } from "./grid";
import { SquareGrid } from "./square-grid";
import { pickDefault, VorsorgebildPanel } from "./vorsorgebild-panel";

/** Mobile: a compact strip under the header that opens the full picture as a bottom sheet. */
export function VorsorgebildStrip({ model }: { model: VorsorgebildModel }) {
  const t = useTranslations("chat.picture");
  const locale = useLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  const kind = pickDefault(model);
  const scenario = model.scenarios.find((s) => s.kind === kind);
  const known = model.facts.filter((f) => f.known).length;
  // Before the first calculation the strip shows the open need, like the panel.
  const squares = scenario?.breakdown ?? targetBreakdown(model.pillars.incomeToday);

  const summary = scenario
    ? scenario.breakdown.gap > 0
      ? t("strip.gap", {
          kind: t(`tabs.${scenario.kind}`),
          amount: formatChf(monthlyChf(scenario.breakdown.gap), locale),
        })
      : t("strip.covered", { kind: t(`tabs.${scenario.kind}`) })
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
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-paragraph-xs font-bold">{t("title")}</span>
            <span className="truncate text-paragraph-xs text-fg-muted">{summary}</span>
          </span>
          {squares ? (
            <SquareGrid
              key={scenario?.calculatedAt ?? squares.need}
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
          <VorsorgebildPanel model={model} />
        </div>
      </dialog>
    </>
  );
}

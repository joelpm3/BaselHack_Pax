"use client";

import { Baby, House, MessageSquareText, Sunset, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { recalculateScenario } from "@/app/[locale]/chat/actions";
import { useChatActions } from "@/components/chat/chat-actions";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { monthlyChf } from "@/components/vorsorgebild/grid";
import type {
  ScenarioComparison,
  ScenarioKind,
  ScenarioOutput,
  ScenarioParams,
} from "@/lib/advisor/types";
import { cn } from "@/lib/utils";
import { BreakdownLegend, BreakdownRow } from "./breakdown-row";
import type { WidgetProps } from "./types";
import { FinePrint, useChf, WidgetCard, WidgetFailed, WidgetPending } from "./widget-card";

const ICONS = { child: Baby, home_purchase: House, early_retirement: Sunset, pillar3a: Wallet };

type OkOutput = Extract<ScenarioOutput, { status: "ok" }>;
type ParamKey = keyof ScenarioParams;

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values.filter((v) => Number.isFinite(v) && v >= 0))].sort((a, b) => a - b);
}

function controlsFor(result: OkOutput): Array<{ key: ParamKey; options: number[]; chf: boolean }> {
  const p = result.params;
  switch (result.scenario) {
    case "child":
      return [{ key: "children", options: [1, 2, 3], chf: false }];
    case "early_retirement": {
      const ages: number[] = [];
      for (let a = result.limits.minRetirementAge; a <= result.limits.maxRetirementAge; a++)
        ages.push(a);
      return [{ key: "retirementAge", options: ages, chf: false }];
    }
    case "pillar3a":
      return [
        {
          key: "yearlyAmount",
          options: uniqueSorted([0, 2000, 4000, result.limits.max3a, p.yearlyAmount ?? 0]),
          chf: true,
        },
      ];
    case "home_purchase":
      return [
        {
          key: "pensionFundWithdrawal",
          options: uniqueSorted([0, 20000, 50000, 100000, 150000, p.pensionFundWithdrawal ?? 0]),
          chf: true,
        },
        {
          key: "pillar3aWithdrawal",
          options: uniqueSorted([0, 10000, 30000, 50000, p.pillar3aWithdrawal ?? 0]),
          chf: true,
        },
      ];
  }
}

/** Interactive what-if: the customer changes the values, Logismata recalculates, squares compare. */
export function ScenarioWidget({ toolCallId, state, input, output }: WidgetProps) {
  const t = useTranslations("widgets.scenario");
  const kind = (input as { scenario?: ScenarioKind } | undefined)?.scenario;
  const Icon = (kind && ICONS[kind]) || House;
  const title = kind ? t(`titles.${kind}`) : t("title");
  if (state === "output-error") return <WidgetFailed icon={Icon} title={title} />;
  if (state !== "output-available") return <WidgetPending icon={Icon} label={t("pending")} />;
  const data = output as ScenarioOutput | undefined;
  if (!data || data.status !== "ok" || !Array.isArray(data.comparisons)) return null;
  return <ScenarioBody toolCallId={toolCallId} initial={data} />;
}

function ScenarioBody({ toolCallId, initial }: { toolCallId: string; initial: OkOutput }) {
  const t = useTranslations("widgets.scenario");
  const chf = useChf();
  const { conversationId, busy, sendMessage } = useChatActions();
  const [result, setResult] = useState(initial);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const Icon = ICONS[result.scenario];

  function change(key: ParamKey, value: number) {
    const params = { ...result.params, [key]: value };
    startTransition(async () => {
      try {
        const next = await recalculateScenario({
          conversationId,
          toolCallId,
          scenario: result.scenario,
          params,
        });
        if (next.status === "ok") setResult(next);
        setFailed(next.status !== "ok");
      } catch {
        setFailed(true);
      }
    });
  }

  const paramSummary = controlsFor(result)
    .map(({ key, chf: isChf }) => {
      const value = result.params[key] ?? 0;
      return `${t(`params.${key}`)}: ${isChf ? chf(value) : value}`;
    })
    .join(", ");

  return (
    <WidgetCard
      icon={Icon}
      title={t(`titles.${result.scenario}`)}
      aside={pending ? <Spinner label={t("recalculating")} /> : null}
    >
      <div className="flex flex-col gap-3">
        {controlsFor(result).map((control) => (
          <fieldset key={control.key} className="flex flex-col gap-1.5" disabled={pending || busy}>
            <legend className="text-paragraph-xs font-medium">{t(`params.${control.key}`)}</legend>
            <div className="flex flex-wrap gap-1.5">
              {control.options.map((option) => {
                const active = (result.params[control.key] ?? 0) === option;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={active}
                    onClick={() => !active && change(control.key, option)}
                    className={cn(
                      "rounded-full border-[1.5px] px-3 py-1 text-paragraph-xs font-medium tabular-nums transition-colors",
                      active
                        ? "border-pax-purple bg-pax-purple text-white"
                        : "border-line-strong text-ink hover:border-pax-purple",
                    )}
                  >
                    {control.chf ? chf(option) : option}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      {failed ? (
        <p role="alert" className="mt-3 text-paragraph-xs text-error-dark">
          {t("failed")}
        </p>
      ) : null}

      <div aria-live="polite" className={cn("mt-5 flex flex-col gap-5", pending && "opacity-60")}>
        {result.comparisons.map((comparison) => (
          <Comparison key={`${comparison.kind}-${comparison.person}`} comparison={comparison} />
        ))}
        {result.comparisons.length === 0 ? (
          <p className="text-paragraph-s text-fg-muted">{t("noChange")}</p>
        ) : (
          <BreakdownLegend breakdowns={result.comparisons.flatMap((c) => [c.before, c.after])} />
        )}
      </div>

      {result.extra?.yearlyTaxSavings ? (
        <p className="mt-4 text-paragraph-s">
          {t("taxSavings", { amount: chf(result.extra.yearlyTaxSavings) })}
        </p>
      ) : null}
      {result.extra?.lostPension ? (
        <p className="mt-4 text-paragraph-s">
          {t("lostPension", { amount: chf(monthlyChf(result.extra.lostPension)) })}
        </p>
      ) : null}

      <div className="mt-4">
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || pending}
          onClick={() =>
            sendMessage(
              t("discussMessage", {
                scenario: t(`titles.${result.scenario}`),
                params: paramSummary,
              }),
            )
          }
        >
          <MessageSquareText aria-hidden />
          {t("discuss")}
        </Button>
      </div>

      <FinePrint>
        {result.assumptions.pillar2Estimated ? `${t("estimated")} ` : ""}
        {t("assumptions")}
      </FinePrint>
    </WidgetCard>
  );
}

function Comparison({ comparison }: { comparison: ScenarioComparison }) {
  const t = useTranslations("widgets.scenario");
  const chf = useChf();
  const before = monthlyChf(comparison.before.gap);
  const after = monthlyChf(comparison.after.gap);
  const delta = after - before;
  const who = comparison.firstName ?? t(comparison.person === 1 ? "you" : "partner");
  const heading =
    comparison.kind === "retirement"
      ? t("kinds.retirement")
      : t(`kinds.${comparison.kind}`, { name: who });
  return (
    <section className="flex flex-col gap-2.5">
      <h4 className="text-paragraph-s font-bold">{heading}</h4>
      <BreakdownRow label={t("before")} breakdown={comparison.before} />
      <BreakdownRow label={t("after")} breakdown={comparison.after} emphasis />
      <p className="text-paragraph-xs text-fg-muted">
        {delta === 0
          ? t("deltaNone")
          : delta > 0
            ? t("deltaUp", { amount: chf(delta) })
            : t("deltaDown", { amount: chf(-delta) })}
      </p>
    </section>
  );
}

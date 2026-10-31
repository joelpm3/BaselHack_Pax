"use client";

import { Route } from "lucide-react";
import { useTranslations } from "next-intl";
import { CHF_PER_SQUARE, MAX_SQUARES, monthlyChf } from "@/components/vorsorgebild/grid";
import { phaseAt } from "@/lib/advisor/explainers/life-plan";
import type { LifeEvent, LifePhaseKind, LifePlanOutput } from "@/lib/advisor/explainers/types";
import { cn } from "@/lib/utils";
import { BreakdownRow } from "../breakdown-row";
import { profileFieldLabelKey } from "../profile-format";
import type { WidgetProps } from "../types";
import { FinePrint, useChf, WidgetCard, WidgetFailed, WidgetPending } from "../widget-card";
import { KeySquare } from "./square-columns";

type Plan = Extract<LifePlanOutput, { status: "ok" }>;

const PHASE_FILL: Record<LifePhaseKind, string> = {
  work: "bg-light-purple border-light-purple",
  sabbatical: "bg-transparent border-pax-purple border-dashed",
  retirement: "bg-light-green border-pax-green",
};
const EVENT_FILL = "bg-pax-purple border-pax-purple text-white";

export function LifePlanWidget({ state, output }: WidgetProps) {
  const t = useTranslations("explainers.lifePlan");
  if (state === "output-error") return <WidgetFailed icon={Route} title={t("title")} />;
  if (state !== "output-available") return <WidgetPending icon={Route} label={t("pending")} />;
  const data = output as LifePlanOutput | undefined;
  if (!data || data.status !== "ok" || !Array.isArray(data.events)) return null;
  return <LifePlanBody plan={data} />;
}

function LifePlanBody({ plan }: { plan: Plan }) {
  const t = useTranslations("explainers.lifePlan");
  // Numbers link the squares to the list; undated plans get no number.
  const numbered = plan.events.filter((e) => e.age !== null);
  const undated = plan.events.filter((e) => e.age === null);
  const numberAt = new Map<number, number>();
  numbered.forEach((event, i) => {
    if (event.age !== null && !numberAt.has(event.age)) numberAt.set(event.age, i + 1);
  });
  const usedPhases = (["work", "sabbatical", "retirement"] as const).filter((kind) =>
    plan.phases.some((p) => p.kind === kind),
  );

  return (
    <WidgetCard icon={Route} title={t("title")}>
      <figure>
        <LifeGrid plan={plan} numberAt={numberAt} />
        <figcaption className="mt-3 flex flex-col gap-1.5 text-paragraph-xs text-fg-muted">
          <span>{t("gridCaption", { age: plan.horizonAge })}</span>
          <ul aria-hidden className="flex flex-wrap gap-x-4 gap-y-1">
            {usedPhases.map((kind) => (
              <li key={kind} className="flex items-center gap-1.5">
                <KeySquare className={PHASE_FILL[kind]} />
                {t(`phases.${kind}`)}
              </li>
            ))}
          </ul>
        </figcaption>
      </figure>

      <ol className="mt-5 flex flex-col gap-3">
        {numbered.map((event, i) => (
          <EventItem key={`${event.kind}-${event.year}-${i}`} event={event} number={i + 1} />
        ))}
        {undated.map((event, i) => (
          <EventItem key={`${event.kind}-undated-${i}`} event={event} number={null} />
        ))}
      </ol>

      <Money plan={plan} />

      <FinePrint>
        {plan.retirement.income.status === "ok" && plan.retirement.income.pillar2Estimated
          ? `${t("estimated")} `
          : ""}
        {t("finePrint", { need: plan.needPercent })}
      </FinePrint>
    </WidgetCard>
  );
}

/** One square per year of life, a row per decade, so ages line up like a calendar. */
function LifeGrid({ plan, numberAt }: { plan: Plan; numberAt: Map<number, number> }) {
  const t = useTranslations("explainers.lifePlan");
  const firstDecade = Math.floor(plan.currentAge / 10) * 10;
  const decades: number[] = [];
  for (let d = firstDecade; d <= plan.horizonAge; d += 10) decades.push(d);

  return (
    <div aria-hidden className="flex flex-col gap-1">
      {decades.map((decade) => (
        <div key={decade} className="flex items-center gap-2">
          <span className="w-8 shrink-0 text-right text-paragraph-xs text-fg-muted tabular-nums">
            {t("decade", { age: decade })}
          </span>
          <div className="grid grid-cols-10 gap-1">
            {Array.from({ length: 10 }, (_, i) => {
              const age = decade + i;
              const inPlan = age >= plan.currentAge && age <= plan.horizonAge;
              const phase = inPlan ? phaseAt(plan.phases, age) : null;
              const number = numberAt.get(age);
              return (
                <span
                  key={age}
                  className={cn(
                    "flex size-[1.125rem] items-center justify-center border-[1.5px] text-[0.625rem] font-bold leading-none sm:size-5",
                    !inPlan && "border-transparent",
                    inPlan && !phase && "border-gray-3",
                    phase && !number && PHASE_FILL[phase.kind],
                    number && EVENT_FILL,
                  )}
                >
                  {number ?? ""}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

const ASSUMPTION_NOTES = new Set<LifeEvent["kind"]>([
  "retirement",
  "partner_retirement",
  "sabbatical",
]);

function EventItem({ event, number }: { event: LifeEvent; number: number | null }) {
  const t = useTranslations("explainers.lifePlan");
  // A sabbatical's length is always assumed: the profile has no duration.
  const assumption =
    (event.source === "assumption" || event.kind === "sabbatical") &&
    ASSUMPTION_NOTES.has(event.kind)
      ? t(`assumptions.${event.kind as "retirement" | "partner_retirement" | "sabbatical"}`)
      : null;
  const source = t(`sources.${event.source}`);
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center border-[1.5px] text-[0.6875rem] font-bold",
          number === null ? "border-pax-purple border-dashed" : EVENT_FILL,
        )}
      >
        {number ?? ""}
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="text-paragraph-s font-medium">
          {t(`events.${event.kind}`)}
          {event.note ? <span className="font-normal text-fg-muted">: {event.note}</span> : null}
        </span>
        <span className="text-paragraph-xs text-fg-muted">
          {event.year !== null && event.age !== null
            ? t("when", { year: event.year, age: event.age })
            : t("noYear")}
          {`, ${source}`}
          {assumption ? <span className="text-warning-dark">{`, ${assumption}`}</span> : null}
        </span>
      </div>
    </li>
  );
}

/** Squares of CHF 500 per month, the same unit as the Vorsorgebild. */
function MoneyRow({ label, monthly, fill }: { label: string; monthly: number; fill: string }) {
  const chf = useChf();
  const count = Math.min(MAX_SQUARES, Math.max(0, Math.round(monthly / CHF_PER_SQUARE)));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-paragraph-xs">
        <span className="font-medium">{label}</span>
        <span className="font-bold tabular-nums">{chf(monthly)}</span>
      </div>
      <div aria-hidden className="flex flex-wrap gap-1">
        {Array.from({ length: count }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: squares have no identity besides position
          <span key={i} className={cn("block size-3 border-[1.5px]", fill)} />
        ))}
      </div>
    </div>
  );
}

function Money({ plan }: { plan: Plan }) {
  const t = useTranslations("explainers.lifePlan");
  const tWidgets = useTranslations("widgets");
  const chf = useChf();
  const { money, retirement } = plan;
  const income = retirement.income;
  const retirementMonthly = income.status === "ok" ? monthlyChf(income.breakdown.total) : null;
  const shortfall =
    retirementMonthly !== null && money.expensesMonthly !== null
      ? money.expensesMonthly - retirementMonthly
      : null;

  return (
    <section className="mt-5 flex flex-col gap-4 border-t border-line pt-4">
      <h4 className="text-paragraph-s font-bold">{t("money")}</h4>
      {money.incomeMonthly !== null ? (
        <MoneyRow
          label={money.incomeIncludesPartner ? t("incomeTodayHousehold") : t("incomeToday")}
          monthly={money.incomeMonthly}
          fill="bg-light-purple border-pax-purple"
        />
      ) : null}
      {money.expensesMonthly !== null ? (
        <MoneyRow
          label={t("expenses")}
          monthly={money.expensesMonthly}
          fill="bg-transparent border-gray-5"
        />
      ) : null}
      {income.status === "ok" ? (
        <BreakdownRow
          label={t("retirementIncome", { age: retirement.age })}
          breakdown={income.breakdown}
          emphasis
        />
      ) : (
        <p className="text-paragraph-s text-fg-muted">
          {income.status === "missing"
            ? t("retirementMissing", {
                fields: income.missing
                  .map((path) => {
                    const key = profileFieldLabelKey(path);
                    return tWidgets.has(key) ? tWidgets(key) : path;
                  })
                  .join(", "),
              })
            : income.status === "too_early"
              ? t("retirementTooEarly")
              : t("retirementFailed")}
        </p>
      )}
      {shortfall !== null ? (
        <p className="text-paragraph-s">
          {shortfall > 0 ? t("expensesGap", { amount: chf(shortfall) }) : t("expensesCovered")}
        </p>
      ) : null}
      <p className="text-paragraph-xs text-fg-muted">{t("unit")}</p>
    </section>
  );
}

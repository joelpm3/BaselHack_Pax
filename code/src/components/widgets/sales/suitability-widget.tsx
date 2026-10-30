"use client";

import { CircleAlert, CircleCheck, ClipboardCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useId, useState, useTransition } from "react";
import { useChatActions } from "@/components/chat/chat-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { submitSuitabilityAction } from "@/lib/sales/actions";
import {
  type InvestmentProfile,
  NET_ASSETS,
  NET_INCOME,
  ONE_OFF_CAPACITY,
  POINTS,
  profileFor,
  SAVING_CAPACITY,
  type SuitabilityAnswers,
  type SuitabilityProduct,
  type SuitabilityResult,
  scoreSuitability,
} from "@/lib/sales/suitability";
import type { SuitabilityOutput, SuitabilityRecord } from "@/lib/sales/types";
import { cn } from "@/lib/utils";
import type { WidgetProps } from "../types";
import { WidgetCard, WidgetFailed, WidgetPending } from "../widget-card";
import { useMoney } from "./shared";

type Draft = Partial<SuitabilityAnswers>;
type PointQuestion = keyof typeof POINTS;
const POINT_QUESTIONS: PointQuestion[] = ["goal", "horizon", "knowledge", "drawdown"];
const PROFILE_TONE: Record<InvestmentProfile, string> = {
  conservative: "bg-chart-3",
  balanced: "bg-pax-green",
  dynamic: "bg-pax-purple",
};

/** The Angemessenheitsprüfung as a form with transparent points and the resulting fund profile. */
export function SuitabilityWidget({ toolCallId, state, output }: WidgetProps) {
  const t = useTranslations("sales.suitability");
  if (state === "output-error")
    return <WidgetFailed icon={ClipboardCheck} title={t("titleShort")} />;
  if (state !== "output-available")
    return <WidgetPending icon={ClipboardCheck} label={t("pending")} />;
  const data = output as SuitabilityOutput | undefined;
  if (!data) return null;
  if (data.status !== "ok" || !data.applicationId) {
    return (
      <WidgetCard icon={ClipboardCheck} title={t("titleShort")}>
        <p className="text-paragraph-s">{t("notApplicable", { product: data.productName })}</p>
      </WidgetCard>
    );
  }
  return <SuitabilityBody toolCallId={toolCallId} data={data} applicationId={data.applicationId} />;
}

function SuitabilityBody({
  toolCallId,
  data,
  applicationId,
}: {
  toolCallId: string;
  data: SuitabilityOutput;
  applicationId: string;
}) {
  const t = useTranslations("sales.suitability");
  const [record, setRecord] = useState<SuitabilityRecord | undefined>(data.record);
  const [editing, setEditing] = useState(!data.record);

  return (
    <WidgetCard icon={ClipboardCheck} title={t("title", { product: data.productName })}>
      {record && !editing ? (
        <ResultSummary record={record} onEdit={() => setEditing(true)} />
      ) : (
        <SuitabilityForm
          toolCallId={toolCallId}
          data={data}
          applicationId={applicationId}
          initial={record}
          onDone={(saved) => {
            setRecord(saved);
            setEditing(false);
          }}
        />
      )}
    </WidgetCard>
  );
}

function SuitabilityForm({
  toolCallId,
  data,
  applicationId,
  initial,
  onDone,
}: {
  toolCallId: string;
  data: SuitabilityOutput;
  applicationId: string;
  initial?: SuitabilityRecord;
  onDone: (record: SuitabilityRecord) => void;
}) {
  const t = useTranslations("sales.suitability");
  const tProfile = useTranslations("sales.profiles");
  const { chf } = useMoney();
  const { conversationId, busy, sendMessage } = useChatActions();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const product = data.productCode as SuitabilityProduct;
  const guarantee = data.guarantee ?? { min: 0, max: 0, default: 0 };

  const [draft, setDraft] = useState<Draft>(
    () =>
      initial?.answers ?? {
        annualPremium: data.plannedAnnualPremium,
        singlePremium: data.plannedSinglePremium,
        guaranteedSharePercent: guarantee.default,
      },
  );
  const [fund, setFund] = useState(initial?.fund ?? "");
  const set = <K extends keyof SuitabilityAnswers>(key: K, value: SuitabilityAnswers[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const complete = isComplete(draft);
  const result: SuitabilityResult | null = complete ? scoreSuitability(draft, product) : null;
  const basePoints = POINT_QUESTIONS.reduce(
    (sum, q) => sum + (draft[q] ? (POINTS[q] as Record<string, number>)[draft[q] as string] : 0),
    0,
  );
  const g = (draft.guaranteedSharePercent ?? 0) / 100;
  const liveTotal = Math.round(basePoints * (1 - g) + 120 * g);
  const chosenFund = result?.funds.includes(fund) ? fund : (result?.suggestedFund ?? "");

  function submit() {
    if (!result || !complete) return;
    setFailed(false);
    startTransition(async () => {
      const response = await submitSuitabilityAction({
        conversationId,
        toolCallId,
        applicationId,
        answers: draft,
        fund: chosenFund,
      }).catch(() => ({ ok: false as const }));
      if (!response.ok) {
        setFailed(true);
        return;
      }
      const r = response.record.result;
      onDone(response.record);
      sendMessage(
        r.suitable
          ? t("resultMessageOk", {
              product: data.productName,
              total: r.total,
              profile: tProfile(r.profile),
              fund: response.record.fund,
            })
          : t("resultMessageNo", {
              product: data.productName,
              total: r.total,
              profile: tProfile(r.profile),
            }),
        { inputMode: "widget" },
      );
    });
  }

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <p className="text-paragraph-s">{t("intro")}</p>

      <Section title={t("a.title")} hint={t("a.hint")}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AmountField
            label={t("a.annualPremium")}
            value={draft.annualPremium ?? null}
            onChange={(v) => set("annualPremium", v)}
          />
          <AmountField
            label={t("a.singlePremium")}
            value={draft.singlePremium ?? null}
            onChange={(v) => set("singlePremium", v)}
          />
        </div>
        <Brackets
          legend={t("a.netIncome")}
          options={NET_INCOME}
          labels="brackets.income"
          value={draft.netIncome}
          onChange={(v) => set("netIncome", v)}
        />
        <Brackets
          legend={t("a.netAssets")}
          options={NET_ASSETS}
          labels="brackets.assets"
          value={draft.netAssets}
          onChange={(v) => set("netAssets", v)}
        />
        <Brackets
          legend={t("a.savingCapacity")}
          options={SAVING_CAPACITY}
          labels="brackets.saving"
          value={draft.savingCapacity}
          onChange={(v) => set("savingCapacity", v)}
        />
        <Brackets
          legend={t("a.oneOffCapacity")}
          options={ONE_OFF_CAPACITY}
          labels="brackets.assets"
          value={draft.oneOffCapacity}
          onChange={(v) => set("oneOffCapacity", v)}
        />
      </Section>

      <Section title={t("b.title")}>
        <PointChoice question="goal" value={draft.goal} onChange={(v) => set("goal", v)} />
        <PointChoice question="horizon" value={draft.horizon} onChange={(v) => set("horizon", v)} />
      </Section>

      <Section title={t("c.title")}>
        <PointChoice
          question="knowledge"
          value={draft.knowledge}
          onChange={(v) => set("knowledge", v)}
        />
        <PointChoice
          question="drawdown"
          value={draft.drawdown}
          onChange={(v) => set("drawdown", v)}
        />
      </Section>

      <Section
        title={t("d.title")}
        hint={guarantee.max > 0 ? t("d.hint") : t("d.none", { product: data.productName })}
      >
        {guarantee.max > 0 ? (
          <GuaranteeSlider
            min={guarantee.min}
            max={guarantee.max}
            value={draft.guaranteedSharePercent ?? guarantee.default}
            onChange={(v) => set("guaranteedSharePercent", v)}
          />
        ) : null}
        <p className="text-paragraph-xs text-fg-muted tabular-nums">
          {t("d.formula", {
            points: basePoints,
            g: draft.guaranteedSharePercent ?? 0,
            total: liveTotal,
          })}
        </p>
      </Section>

      <div className="flex flex-col gap-4 rounded-m bg-surface-muted p-4">
        <ScoreScale total={liveTotal} />
        {result ? (
          <>
            <p className="text-paragraph-s">
              {t("profileIs", { profile: tProfile(result.profile), total: result.total })}
            </p>
            <FundChoice
              funds={result.funds}
              value={chosenFund}
              suggested={result.suggestedFund}
              onChange={setFund}
            />
            <Affordability
              result={result}
              chf={chf}
              annual={draft.annualPremium ?? null}
              single={draft.singlePremium ?? null}
            />
          </>
        ) : (
          <p className="text-paragraph-xs text-fg-muted">{t("answerAll")}</p>
        )}
      </div>

      {failed ? (
        <p role="alert" className="flex items-center gap-1.5 text-paragraph-xs text-error-dark">
          <CircleAlert aria-hidden className="size-4" />
          {t("error")}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={!result || busy || pending}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}

function isComplete(d: Draft): d is SuitabilityAnswers {
  return Boolean(
    d.netIncome &&
      d.netAssets &&
      d.savingCapacity &&
      d.oneOffCapacity &&
      d.goal &&
      d.horizon &&
      d.knowledge &&
      d.drawdown &&
      d.guaranteedSharePercent !== undefined &&
      ((d.annualPremium ?? 0) > 0 || (d.singlePremium ?? 0) > 0),
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h4 className="text-paragraph-s font-bold">{title}</h4>
        {hint ? <p className="mt-0.5 text-paragraph-xs text-fg-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function AmountField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-paragraph-xs font-medium">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-paragraph-s text-fg-muted">
          CHF
        </span>
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          step={1}
          className="pl-12 tabular-nums"
          value={value ?? ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? null : Math.max(0, Number(e.target.value)))
          }
        />
      </div>
    </div>
  );
}

function Brackets<T extends string>({
  legend,
  options,
  labels,
  value,
  onChange,
}: {
  legend: string;
  options: readonly T[];
  labels: string;
  value: T | undefined;
  onChange: (value: T) => void;
}) {
  const t = useTranslations("sales.suitability");
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-paragraph-xs font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <label
            key={option}
            className={cn(
              "cursor-pointer rounded-full border-[1.5px] px-3 py-1 text-paragraph-xs font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-pax-green",
              value === option
                ? "border-pax-purple bg-pax-purple text-white"
                : "border-line-strong hover:border-pax-purple",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
              className="sr-only"
            />
            {t(`${labels}.${option as string}`)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function PointChoice<Q extends PointQuestion>({
  question,
  value,
  onChange,
}: {
  question: Q;
  value: keyof (typeof POINTS)[Q] | undefined;
  onChange: (value: keyof (typeof POINTS)[Q] & string) => void;
}) {
  const t = useTranslations("sales.suitability");
  const name = useId();
  const options = Object.entries(POINTS[question]) as Array<
    [keyof (typeof POINTS)[Q] & string, number]
  >;
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-paragraph-xs font-medium">
        {t(`questions.${question as string}.label`)}
      </legend>
      {options.map(([option, points]) => (
        <label
          key={option}
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-m border-[1.2px] px-3 py-2.5 text-paragraph-xs transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-pax-green",
            value === option
              ? "border-pax-purple bg-info-light"
              : "border-line hover:border-pax-purple",
          )}
        >
          <input
            type="radio"
            name={name}
            value={option}
            checked={value === option}
            onChange={() => onChange(option)}
            className="mt-0.5 size-4 shrink-0 accent-pax-purple"
          />
          <span className="flex-1">{t(`questions.${question as string}.${option as string}`)}</span>
          <span className="shrink-0 tabular-nums text-fg-muted">{t("points", { points })}</span>
        </label>
      ))}
    </fieldset>
  );
}

function GuaranteeSlider({
  min,
  max,
  value,
  onChange,
}: {
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
}) {
  const t = useTranslations("sales.suitability");
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex justify-between text-paragraph-xs font-medium">
        <span>{t("d.label")}</span>
        <span className="tabular-nums">{value} %</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-pax-purple"
      />
    </div>
  );
}

/**
 * 0–120 points as 24 Pax squares of five points each, coloured by the band they fall in:
 * Konservativ ≤ 44, Ausgewogen 45–84, Dynamisch ≥ 85.
 */
function ScoreScale({ total }: { total: number }) {
  const t = useTranslations("sales.suitability");
  const tProfile = useTranslations("sales.profiles");
  const squares = Array.from({ length: 24 }, (_, i) => i);
  return (
    <div>
      <meter
        className="sr-only"
        min={0}
        max={120}
        value={total}
        aria-label={t("scale", { total })}
      />
      <div aria-hidden className="flex gap-[3px]">
        {squares.map((i) => {
          const band = profileFor(i * 5);
          const lit = total > i * 5;
          return (
            <span
              key={i}
              className={cn(
                "aspect-square min-w-0 flex-1 transition-colors",
                lit ? PROFILE_TONE[band] : "bg-gray-2",
              )}
            />
          );
        })}
      </div>
      <div className="mt-1.5 grid grid-cols-[9fr_8fr_7fr] text-paragraph-xs text-fg-muted">
        <span>{tProfile("conservative")}</span>
        <span>{tProfile("balanced")}</span>
        <span className="text-right">{tProfile("dynamic")}</span>
      </div>
      <p className="mt-2 text-paragraph-s font-bold tabular-nums">{t("total", { total })}</p>
    </div>
  );
}

function FundChoice({
  funds,
  value,
  suggested,
  onChange,
}: {
  funds: string[];
  value: string;
  suggested: string;
  onChange: (fund: string) => void;
}) {
  const t = useTranslations("sales.suitability");
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-paragraph-xs font-medium">{t("funds")}</legend>
      {funds.map((fund) => (
        <label key={fund} className="flex cursor-pointer items-start gap-2.5 text-paragraph-xs">
          <input
            type="radio"
            name={name}
            value={fund}
            checked={value === fund}
            onChange={() => onChange(fund)}
            className="mt-0.5 size-4 shrink-0 accent-pax-purple"
          />
          <span>
            {fund}
            {fund === suggested ? (
              <span className="ml-1.5 text-contrast-green">{t("suggested")}</span>
            ) : null}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function Affordability({
  result,
  chf,
  annual,
  single,
}: {
  result: SuitabilityResult;
  chf: (amount: number) => string;
  annual: number | null;
  single: number | null;
}) {
  const t = useTranslations("sales.suitability");
  const { affordability } = result;
  return (
    <div className="flex flex-col gap-1 text-paragraph-xs">
      {affordability.annual !== null ? (
        <Verdict ok={affordability.annual}>
          {t(affordability.annual ? "affordAnnualOk" : "affordAnnualNo", {
            amount: chf(annual ?? 0),
          })}
        </Verdict>
      ) : null}
      {affordability.single !== null ? (
        <Verdict ok={affordability.single}>
          {t(affordability.single ? "affordSingleOk" : "affordSingleNo", {
            amount: chf(single ?? 0),
          })}
        </Verdict>
      ) : null}
      <p
        className={cn(
          "mt-1 font-medium",
          result.suitable ? "text-contrast-green" : "text-error-dark",
        )}
      >
        {result.suitable ? t("suitable") : t("notSuitable")}
      </p>
    </div>
  );
}

function Verdict({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5">
      {ok ? (
        <CircleCheck aria-hidden className="mt-px size-4 shrink-0 text-contrast-green" />
      ) : (
        <CircleAlert aria-hidden className="mt-px size-4 shrink-0 text-error-dark" />
      )}
      {children}
    </p>
  );
}

function ResultSummary({ record, onEdit }: { record: SuitabilityRecord; onEdit: () => void }) {
  const t = useTranslations("sales.suitability");
  const tProfile = useTranslations("sales.profiles");
  const { chf } = useMoney();
  const { busy } = useChatActions();
  const r = record.result;
  return (
    <div className="flex flex-col gap-4">
      <ScoreScale total={r.total} />
      <p className="text-paragraph-s">
        {t("profileIs", { profile: tProfile(r.profile), total: r.total })}{" "}
        {t("pointsDetail", { points: r.basePoints, g: r.guaranteedSharePercent })}
      </p>
      <p className="text-paragraph-s">
        <span className="text-fg-muted">{t("fundChosen")} </span>
        <span className="font-medium">{record.fund}</span>
      </p>
      <Affordability
        result={r}
        chf={chf}
        annual={record.answers.annualPremium}
        single={record.answers.singlePremium}
      />
      <div>
        <Button size="sm" variant="secondary" disabled={busy} onClick={onEdit}>
          {t("edit")}
        </Button>
      </div>
    </div>
  );
}

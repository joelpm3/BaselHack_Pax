import { ChevronRight } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { SentimentBadge } from "@/components/firma/badges";
import { Panel } from "@/components/firma/page-parts";
import { Badge } from "@/components/ui/badge";
import { PRODUCT_CODES, PRODUCTS, type ProductCode } from "@/lib/domain/products";
import { GAP_TYPES, type GapType } from "@/lib/domain/taxonomy";
import type { ConversationDetail } from "@/lib/firma/conversations";
import { formatChf } from "@/lib/utils";

export function productName(code: string): string {
  return PRODUCT_CODES.includes(code as ProductCode) ? PRODUCTS[code as ProductCode].name : code;
}

/**
 * What the classifier made of the conversation: the summary and the next step stay visible, the
 * rest (signals, gaps, pain points, rules, model, conversation facts) sits behind one disclosure.
 */
export async function AnalysisSection({
  analysis,
  rules,
  pending,
  locale,
  facts,
}: {
  analysis: ConversationDetail["analysis"];
  rules: ConversationDetail["rules"];
  pending: boolean;
  locale: string;
  /** Conversation facts (mode, language, rule set) shown with the details. */
  facts: string;
}) {
  const [t, tTopic, tEvent, tIntent, tGap, tStrength, tAction, tFocus, format] = await Promise.all([
    getTranslations("firma.conversation.analysis"),
    getTranslations("common.taxonomy.topics"),
    getTranslations("common.taxonomy.lifeEvent"),
    getTranslations("common.taxonomy.intent"),
    getTranslations("common.taxonomy.gap"),
    getTranslations("firma.taxonomy.strength"),
    getTranslations("firma.taxonomy.ruleAction"),
    getTranslations("firmaFocus.conversation"),
    getFormatter(),
  ]);

  if (!analysis) {
    return (
      <Panel title={t("title")}>
        <p className="text-fg-muted">{pending ? t("running") : t("none")}</p>
      </Panel>
    );
  }

  const gapLabel = (gap: string) =>
    GAP_TYPES.includes(gap as GapType) ? tGap(gap as GapType) : gap;

  return (
    <Panel title={t("title")} actions={pending ? <Badge tone="info">{t("running")}</Badge> : null}>
      <div className="grid gap-4">
        <p>{analysis.summary}</p>
        {analysis.nextBestAction ? (
          <p className="grid gap-0.5 border-l-2 border-pax-purple pl-3">
            <span className="text-xs font-medium text-fg-muted">{t("nextBestAction")}</span>
            <span className="font-medium">{analysis.nextBestAction}</span>
          </p>
        ) : null}

        <details className="group">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 font-medium text-pax-purple [&::-webkit-details-marker]:hidden">
            <ChevronRight
              aria-hidden
              className="size-4 transition-transform group-open:rotate-90 motion-reduce:transition-none"
            />
            {tFocus("analysisDetails")}
          </summary>
          <div className="mt-4 grid gap-4">
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="info">{tIntent(analysis.intentStage)}</Badge>
              <SentimentBadge sentiment={analysis.sentiment} />
              {analysis.topics.map((topic) => (
                <Badge key={topic}>{tTopic(topic)}</Badge>
              ))}
            </div>

            {analysis.lifeEvents.length > 0 ? (
              <Field label={t("lifeEvents")}>
                {analysis.lifeEvents.map((e) => tEvent(e)).join(", ")}
              </Field>
            ) : null}

            {analysis.productInterest.length > 0 ? (
              <Field label={t("productInterest")}>
                <ul className="grid gap-1">
                  {analysis.productInterest.map((p) => (
                    <li key={p.productCode} className="flex justify-between gap-3">
                      <span>{productName(p.productCode)}</span>
                      <span className="text-fg-muted">{tStrength(p.strength)}</span>
                    </li>
                  ))}
                </ul>
              </Field>
            ) : null}

            {analysis.gaps.length > 0 ? (
              <Field label={t("gaps")}>
                <ul className="grid gap-1.5">
                  {analysis.gaps.map((g, i) => (
                    <li key={`${g.gap}-${i}`} className="grid gap-0.5">
                      <span className="flex justify-between gap-3">
                        <span className="font-medium">{gapLabel(g.gap)}</span>
                        <span className="tabular-nums">
                          {g.amountAnnual !== null
                            ? `${formatChf(g.amountAnnual, locale)} ${t("perYear")}`
                            : "–"}
                        </span>
                      </span>
                      {g.note ? <span className="text-fg-muted">{g.note}</span> : null}
                    </li>
                  ))}
                </ul>
              </Field>
            ) : null}

            {analysis.painPoints.length > 0 ? (
              <Field label={t("painPoints")}>
                <ul className="grid gap-1">
                  {analysis.painPoints.map((p) => (
                    <li key={p} className="flex gap-2">
                      <span aria-hidden className="mt-2 size-1.5 shrink-0 bg-chart-6" />
                      {p}
                    </li>
                  ))}
                </ul>
              </Field>
            ) : null}

            <Field label={t("handover")}>
              {analysis.handover.required ? (
                <Badge tone="warning">{t("handoverRequired")}</Badge>
              ) : (
                <span className="text-fg-muted">{t("handoverNotRequired")}</span>
              )}
              {analysis.handover.reason ? <p className="mt-1">{analysis.handover.reason}</p> : null}
            </Field>

            {analysis.handover.ruleIds.length > 0 ? (
              <Field label={t("triggeredRules")}>
                <ul className="grid gap-1.5">
                  {analysis.handover.ruleIds.map((id) => {
                    const rule = rules[id];
                    return (
                      <li key={id} className="rounded-m bg-gray-1 px-3 py-2">
                        {rule ? (
                          <>
                            <span className="text-xs text-fg-muted">
                              {tAction(rule.action)} · {t("ruleVersion", { version: rule.version })}
                            </span>
                            <p>{rule.text}</p>
                          </>
                        ) : (
                          <span className="text-fg-muted">{t("unknownRule")}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Field>
            ) : null}

            <p className="text-xs text-fg-subtle">
              {facts} ·{" "}
              {t("updated", {
                time: format.dateTime(analysis.updatedAt, {
                  hour: "2-digit",
                  minute: "2-digit",
                  day: "numeric",
                  month: "numeric",
                }),
                count: analysis.messageCountAnalyzed,
              })}{" "}
              · {t("model", { model: analysis.model ?? "–" })}
            </p>
          </div>
        </details>
      </div>
    </Panel>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <h3 className="text-xs font-medium text-fg-muted">{label}</h3>
      <div>{children}</div>
    </div>
  );
}

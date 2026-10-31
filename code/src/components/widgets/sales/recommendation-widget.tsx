"use client";

import { ChevronDown, CircleAlert, ExternalLink, Info, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useChatActions } from "@/components/chat/chat-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { declineRecommendationAction } from "@/lib/sales/actions";
import type { RecommendationStatus, RecommendationView, RecommendOutput } from "@/lib/sales/types";
import type { WidgetProps } from "../types";
import { WidgetCard, WidgetFailed, WidgetPending } from "../widget-card";
import { CoverFacts, CriteriaList, IssueList, PriceTag, RiderList, ScenarioList } from "./shared";

/** Recommendation cards: the gap, why this product (criteria), price, alternatives, next step. */
export function RecommendationWidget({ state, output }: WidgetProps) {
  const t = useTranslations("sales.recommendation");
  if (state === "output-error") return <WidgetFailed icon={ShieldCheck} title={t("title")} />;
  if (state !== "output-available")
    return <WidgetPending icon={ShieldCheck} label={t("pending")} />;
  const data = output as RecommendOutput | undefined;
  if (!data) return null;
  if (data.status === "needs_info") return <NeedsInfo missing={data.missing} />;
  // The analysis card follows in the same turn; an empty recommendation card would only confuse.
  if (data.status === "needs_analysis") return null;
  return <Recommendations data={data} />;
}

function NeedsInfo({ missing }: { missing: string[] }) {
  const t = useTranslations("sales.recommendation");
  // Field paths like "person.birthYear" become message keys like "person_birthYear".
  const fields = missing
    .map((m) => m.replace(".", "_"))
    .map((key) => (t.has(`missing.${key}`) ? t(`missing.${key}`) : key))
    .join(", ");
  return (
    <WidgetCard icon={ShieldCheck} title={t("title")}>
      <p className="text-paragraph-s">{t("needsInfo", { fields })}</p>
    </WidgetCard>
  );
}

function Recommendations({ data }: { data: RecommendOutput }) {
  const t = useTranslations("sales.recommendation");
  const [statuses, setStatuses] = useState<Record<string, RecommendationStatus>>(
    data.statuses ?? {},
  );
  const count = data.recommendations.length;
  return (
    <WidgetCard
      icon={ShieldCheck}
      title={count === 1 ? t("title") : t("titleMany", { count })}
      aside={
        <span className="text-paragraph-xs text-fg-muted">
          {t("rules", { version: data.ruleSetVersion })}
        </span>
      }
    >
      {count === 0 ? <p className="text-paragraph-s">{t("none")}</p> : null}
      <div className="flex flex-col divide-y divide-line">
        {data.recommendations.map((rec) => (
          <RecommendationItem
            key={rec.id}
            rec={rec}
            status={statuses[rec.id] ?? "shown"}
            onDeclined={() => setStatuses((s) => ({ ...s, [rec.id]: "declined" }))}
          />
        ))}
      </div>
      {data.excluded.length > 0 ? (
        <div className="mt-4 rounded-m bg-surface-muted p-3">
          <p className="text-paragraph-xs font-medium">{t("excluded")}</p>
          <ul className="mt-1 flex flex-col gap-1 text-paragraph-xs text-fg-muted">
            {data.excluded.map((e) => (
              <li key={`${e.productCode}-${e.reason}`}>
                <span className="font-medium text-fg">{e.productName}</span>: {e.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </WidgetCard>
  );
}

function RecommendationItem({
  rec,
  status,
  onDeclined,
}: {
  rec: RecommendationView;
  status: RecommendationStatus;
  onDeclined: () => void;
}) {
  const t = useTranslations("sales.recommendation");
  const tGap = useTranslations("sales.server.gaps");
  const tPrice = useTranslations("sales.price");
  const { conversationId, busy, sendMessage } = useChatActions();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const declined = status === "declined";
  const gaps = [rec.gap, ...rec.alsoCloses].map((g) => tGap(g)).join(", ");

  function decline() {
    setFailed(false);
    startTransition(async () => {
      const result = await declineRecommendationAction({
        conversationId,
        recommendationId: rec.id,
      }).catch(() => ({ ok: false }));
      if (!result.ok) {
        setFailed(true);
        return;
      }
      onDeclined();
      sendMessage(t("declineMessage", { product: rec.productName }), { inputMode: "widget" });
    });
  }

  return (
    <article
      className={declined ? "py-4 opacity-60 first:pt-0 last:pb-0" : "py-4 first:pt-0 last:pb-0"}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden className="size-2.5 shrink-0 bg-pax-green" />
        <p className="text-paragraph-xs text-fg-muted">{t("closes", { gaps })}</p>
        {rec.requiresSuitability ? <Badge tone="info">{t("conditional")}</Badge> : null}
        {status === "accepted" ? <Badge tone="success">{t("accepted")}</Badge> : null}
        {declined ? <Badge>{t("declined")}</Badge> : null}
      </div>
      <h4 className="mt-1.5 text-heading-s font-bold">{rec.headline}</h4>
      <p className="mt-0.5 text-paragraph-s font-medium text-pax-purple">{rec.productName}</p>
      <p className="mt-2 text-paragraph-s">{rec.rationale}</p>

      <div className="mt-4 flex flex-col gap-4 rounded-m bg-surface-muted p-4">
        <CoverFacts
          productCode={rec.productCode}
          pillar={rec.pillar}
          cover={rec.cover}
          price={rec.price}
        />
        {rec.price ? (
          <>
            <PriceTag price={rec.price} />
            {rec.price.maturity ? (
              <ScenarioList
                title={tPrice("maturityTitle")}
                values={rec.price.maturity}
                note={tPrice("scenarioNote")}
              />
            ) : null}
            {rec.price.payoutAnnual ? (
              <ScenarioList
                title={tPrice("payoutTitle")}
                values={rec.price.payoutAnnual}
                note={tPrice("scenarioNote")}
              />
            ) : null}
            <RiderList riders={rec.price.riders} />
            <IssueList issues={rec.price.issues} />
          </>
        ) : null}
      </div>

      {rec.flags.map((flag) => (
        <p
          key={flag.ruleId}
          className="mt-3 flex items-start gap-2 rounded-m bg-light-purple p-3 text-paragraph-xs text-deep-purple"
        >
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-medium">{t("flag")}</span> {flag.text}
          </span>
        </p>
      ))}

      <details className="group mt-3">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-paragraph-xs font-medium text-pax-purple [&::-webkit-details-marker]:hidden">
          <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" />
          {t("why", { count: rec.criteria.length })}
        </summary>
        <div className="mt-3">
          <CriteriaList criteria={rec.criteria} />
        </div>
      </details>

      {rec.alternatives.length > 0 ? (
        <details className="group mt-2">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-paragraph-xs font-medium text-pax-purple [&::-webkit-details-marker]:hidden">
            <ChevronDown
              aria-hidden
              className="size-4 transition-transform group-open:rotate-180"
            />
            {t("alternatives")}
          </summary>
          <ul className="mt-2 flex flex-col gap-2 text-paragraph-xs">
            {rec.alternatives.map((a) => (
              <li key={a.code}>
                <span className="font-medium">{a.label}</span>
                <span className="block text-fg-muted">{a.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {failed ? (
        <p
          role="alert"
          className="mt-3 flex items-center gap-1.5 text-paragraph-xs text-error-dark"
        >
          <CircleAlert aria-hidden className="size-4" />
          {t("error")}
        </p>
      ) : null}

      {status === "shown" ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {rec.requiresSuitability ? (
            <Button
              size="sm"
              disabled={busy || pending}
              onClick={() =>
                sendMessage(t("suitabilityMessage", { product: rec.productName }), {
                  inputMode: "widget",
                })
              }
            >
              {t("startSuitability")}
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={busy || pending}
              onClick={() =>
                sendMessage(t("offerMessage", { product: rec.productName }), {
                  inputMode: "widget",
                })
              }
            >
              {t("viewOffer")}
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={busy || pending} onClick={decline}>
            {t("decline")}
          </Button>
          <a
            href={rec.url}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-paragraph-xs font-medium text-contrast-green hover:underline"
          >
            {t("productPage")}
            <ExternalLink aria-hidden className="size-3.5" />
          </a>
        </div>
      ) : null}
    </article>
  );
}

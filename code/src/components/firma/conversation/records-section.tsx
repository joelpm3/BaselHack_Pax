import { Check, FileText, X } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { Panel } from "@/components/firma/page-parts";
import { Badge } from "@/components/ui/badge";
import { DOCUMENT_TYPES, type DocumentType, GAP_TYPES, type GapType } from "@/lib/domain/taxonomy";
import type { ConversationDetail } from "@/lib/firma/conversations";
import { compactJson } from "@/lib/insights/transcript";
import { formatChf } from "@/lib/utils";
import { productName } from "./analysis-section";

const dateTime = { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" } as const;

export async function RecommendationsSection({
  detail,
  locale,
}: {
  detail: ConversationDetail;
  locale: string;
}) {
  const [t, tGap, tx] = await Promise.all([
    getTranslations("firma.conversation.recommendations"),
    getTranslations("common.taxonomy.gap"),
    getTranslations("firma.taxonomy"),
  ]);
  return (
    <Panel title={t("title")} description={t("description")}>
      {detail.recommendations.length === 0 ? (
        <p className="text-fg-muted">{t("none")}</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {detail.recommendations.map((r) => (
            <li key={r.id} className="grid content-start gap-2 rounded-xl bg-gray-1 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{productName(r.productCode)}</span>
                {r.pillar ? <Badge>{r.pillar}</Badge> : null}
                <Badge tone="info">
                  {GAP_TYPES.includes(r.gap as GapType) ? tGap(r.gap) : r.gap}
                </Badge>
                <Badge
                  tone={
                    r.status === "accepted"
                      ? "success"
                      : r.status === "declined"
                        ? "neutral"
                        : "purple"
                  }
                  className="ml-auto"
                >
                  {tx(`recommendationStatus.${r.status}`)}
                </Badge>
              </div>
              <p className="font-medium">{r.headline}</p>
              <p className="text-fg-muted">{r.rationale}</p>
              {r.criteria.length > 0 ? (
                <ul className="grid gap-1">
                  {r.criteria.map((c) => (
                    <li key={c.criterion} className="flex items-start gap-2">
                      {c.met ? (
                        <Check
                          aria-label={t("met")}
                          className="mt-0.5 size-4 shrink-0 text-contrast-green"
                        />
                      ) : (
                        <X
                          aria-label={t("notMet")}
                          className="mt-0.5 size-4 shrink-0 text-error-dark"
                        />
                      )}
                      <span>
                        {c.criterion}: <span className="text-fg-muted">{c.value}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {r.premiumAnnual ? (
                <p>
                  <span className="font-medium">{formatChf(r.premiumAnnual, locale)}</span>{" "}
                  {t("perYear")}{" "}
                  <span className="text-fg-muted">
                    ({tx(`premiumSource.${r.premiumSource ?? "estimate"}`)})
                  </span>
                </p>
              ) : null}
              {r.alternatives && r.alternatives.length > 0 ? (
                <p className="text-xs text-fg-muted">
                  {t("alternatives")}:{" "}
                  {r.alternatives
                    .map((a) => `${productName(a.productCode)} (${a.reason})`)
                    .join("; ")}
                </p>
              ) : null}
              <p className="text-xs text-fg-subtle">{t("model", { model: r.model ?? "–" })}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export async function CalculationsSection({ detail }: { detail: ConversationDetail }) {
  const [t, format] = await Promise.all([
    getTranslations("firma.conversation.calculations"),
    getFormatter(),
  ]);
  return (
    <Panel title={t("title")} description={t("description", { count: detail.calculations.length })}>
      {detail.calculations.length === 0 ? (
        <p className="text-fg-muted">{t("none")}</p>
      ) : (
        <ul className="grid gap-1.5">
          {detail.calculations.map((c) => (
            <li key={c.id}>
              <details className="rounded-m border border-line">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 [&::-webkit-details-marker]:hidden">
                  <span className="tabular-nums text-fg-muted">
                    {format.dateTime(c.createdAt, {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                  <span className="font-medium">{c.operation}</span>
                  <span className="text-fg-muted">{c.provider}</span>
                  <span className="ml-auto flex items-center gap-2">
                    {c.durationMs !== null ? (
                      <span className="tabular-nums text-fg-muted">{c.durationMs} ms</span>
                    ) : null}
                    <Badge tone={c.status === "ok" ? "success" : "error"}>
                      {c.status === "ok" ? t("ok") : t("error")}
                    </Badge>
                  </span>
                </summary>
                <div className="grid gap-2 border-t border-line px-3 py-2 text-xs">
                  {c.error ? <p className="text-error-dark">{c.error}</p> : null}
                  <p>
                    <span className="font-medium text-fg-muted">{t("input")}: </span>
                    <span className="break-all">{compactJson(c.input, 1500)}</span>
                  </p>
                  <p>
                    <span className="font-medium text-fg-muted">{t("output")}: </span>
                    <span className="break-all">{compactJson(c.output, 2500) || "–"}</span>
                  </p>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export async function DocumentsSection({ detail }: { detail: ConversationDetail }) {
  const [t, tDoc, tx, format] = await Promise.all([
    getTranslations("firma.conversation.documents"),
    getTranslations("common.taxonomy.docType"),
    getTranslations("firma.taxonomy"),
    getFormatter(),
  ]);
  return (
    <Panel title={t("title")}>
      {detail.documents.length === 0 ? (
        <p className="text-fg-muted">{t("none")}</p>
      ) : (
        <ul className="grid gap-2">
          {detail.documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <FileText aria-hidden className="size-4 text-pax-purple" />
              {d.deletedAt ? (
                <span className="text-fg-muted line-through">{d.filename}</span>
              ) : (
                <a
                  href={`/api/documents/${d.id}/file`}
                  className="font-medium text-contrast-green hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  {d.filename}
                </a>
              )}
              <span className="text-fg-muted">
                {d.docType && DOCUMENT_TYPES.includes(d.docType as DocumentType)
                  ? tDoc(d.docType)
                  : t("unknownType")}
              </span>
              <Badge>{tx(`documentStatus.${d.status}`)}</Badge>
              <span className="ml-auto text-xs text-fg-muted tabular-nums">
                {format.dateTime(d.createdAt, dateTime)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export async function AuditSection({ detail }: { detail: ConversationDetail }) {
  const [t, format] = await Promise.all([
    getTranslations("firma.conversation.audit"),
    getFormatter(),
  ]);
  const advisorName = new Map(detail.advisors.map((a) => [a.id, a.name]));
  const entries = [
    ...detail.auditTrail.map((a) => ({
      id: a.id,
      at: a.createdAt,
      actor:
        a.actorType === "advisor"
          ? (advisorName.get(a.actorId ?? "") ?? t("actor.advisor"))
          : t(`actor.${a.actorType}`),
      action: a.action,
      detail: a.data ? compactJson(a.data, 220) : "",
    })),
    ...detail.profileEvents.map((e) => ({
      id: e.id,
      at: e.createdAt,
      actor: t(`source.${e.source}`),
      action: t("profileChange", { path: e.path }),
      detail: compactJson(e.newValue, 160),
    })),
    ...detail.feedback.map((f) => ({
      id: f.id,
      at: f.createdAt,
      actor: t("actor.customer"),
      action: t("feedback", { nps: f.nps }),
      detail: f.comment ?? "",
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <Panel title={t("title")} description={t("description")}>
      {entries.length === 0 ? (
        <p className="text-fg-muted">{t("none")}</p>
      ) : (
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full min-w-[36rem] text-xs">
            <thead className="sticky top-0 bg-surface text-left text-fg-muted">
              <tr>
                <th scope="col" className="py-1.5 pr-3 font-medium">
                  {t("time")}
                </th>
                <th scope="col" className="py-1.5 pr-3 font-medium">
                  {t("actorLabel")}
                </th>
                <th scope="col" className="py-1.5 pr-3 font-medium">
                  {t("action")}
                </th>
                <th scope="col" className="py-1.5 font-medium">
                  {t("details")}
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-t border-gray-2 align-top">
                  <td className="py-1.5 pr-3 whitespace-nowrap tabular-nums text-fg-muted">
                    {format.dateTime(e.at, { ...dateTime, second: "2-digit" })}
                  </td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{e.actor}</td>
                  <td className="py-1.5 pr-3">{e.action}</td>
                  <td className="py-1.5 break-all text-fg-muted">{e.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

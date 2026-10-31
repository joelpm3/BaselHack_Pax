import { getFormatter, getTranslations } from "next-intl/server";
import { HandoverStatusBadge, LeadTypeBadge, PriorityBadge } from "@/components/firma/badges";
import {
  AssignSelect,
  HandoverStatusSelect,
  LeadNoteForm,
  LeadStatusSelect,
} from "@/components/firma/controls";
import { Panel } from "@/components/firma/page-parts";
import type { ScoreBreakdown } from "@/lib/db/schema";
import {
  CONVERSATION_MODES,
  type ConversationMode,
  FUNNEL_STAGES,
  type FunnelStage,
  INTENT_STAGES,
  type IntentStage,
  LEAD_STATUSES,
  LEAD_TYPES,
  type LeadStatus,
  type LeadType,
} from "@/lib/domain/taxonomy";
import type { ConversationDetail } from "@/lib/firma/conversations";
import { SCORE_FACTORS, type ScoreFactor } from "@/lib/leads/scoring";
import { formatChf } from "@/lib/utils";
import { productName } from "./analysis-section";

type Translate = Awaited<ReturnType<typeof getTranslations<"firma">>>;

/** Score breakdown notes are language-neutral values; turn them into readable text. */
async function breakdownNote(b: ScoreBreakdown, locale: string, t: Translate): Promise<string> {
  const [tIntent, tStage] = await Promise.all([
    getTranslations("common.taxonomy.intent"),
    getTranslations("common.taxonomy.stages"),
  ]);
  switch (b.factor) {
    case "intent":
      return INTENT_STAGES.includes(b.note as IntentStage)
        ? tIntent(b.note as IntentStage)
        : b.note;
    case "gap":
      return Number(b.note) > 0
        ? `${formatChf(Number(b.note), locale)} ${t("score.perYear")}`
        : t("score.gapNoAmount");
    case "product": {
      const [code, strength] = b.note.split(":");
      return `${productName(code)} (${t(`taxonomy.strength.${strength as "low" | "medium" | "high"}`)})`;
    }
    case "contact":
      return t(b.note === "client" ? "score.client" : "score.prospect");
    case "stage":
      return FUNNEL_STAGES.includes(b.note as FunnelStage) ? tStage(b.note as FunnelStage) : b.note;
    case "mode":
      return CONVERSATION_MODES.includes(b.note as ConversationMode)
        ? t(`taxonomy.mode.${b.note as ConversationMode}`)
        : b.note;
    case "handover":
      return t(`taxonomy.urgency.${b.note === "high" ? "high" : "normal"}`);
    default:
      return "";
  }
}
export async function LeadsSection({
  detail,
  locale,
}: {
  detail: ConversationDetail;
  locale: string;
}) {
  const [t, tStatus, tType, format] = await Promise.all([
    getTranslations("firma"),
    getTranslations("common.taxonomy.leadStatus"),
    getTranslations("common.taxonomy.leadType"),
    getFormatter(),
  ]);
  const statusLabel = (value: unknown) =>
    LEAD_STATUSES.includes(value as LeadStatus) ? tStatus(value as LeadStatus) : String(value);
  const typeLabel = (value: unknown) =>
    LEAD_TYPES.includes(value as LeadType) ? tType(value as LeadType) : String(value);
  const advisorName = new Map(detail.advisors.map((a) => [a.id, a.name]));

  return (
    <Panel title={t("conversation.leads.title")}>
      {detail.leads.length === 0 ? (
        <p className="text-fg-muted">{t("conversation.leads.none")}</p>
      ) : (
        <ul className="grid gap-5">
          {
            await Promise.all(
              detail.leads.map(async (lead) => {
                const notes = await Promise.all(
                  lead.scoreBreakdown.map((b) => breakdownNote(b, locale, t)),
                );
                const activities = detail.activities.filter((a) => a.leadId === lead.id);
                return (
                  <li
                    key={lead.id}
                    id={`lead-${lead.id}`}
                    className="grid gap-3 border-t border-line pt-4 first:border-t-0 first:pt-0"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <LeadTypeBadge type={lead.type} />
                      <PriorityBadge priority={lead.priority} />
                      <span className="ml-auto text-2xl font-bold">{lead.score}</span>
                    </div>
                    <p className="font-medium">{lead.reasonToCall}</p>
                    {lead.talkingPoints.length > 0 ? (
                      <ul className="grid gap-1">
                        {lead.talkingPoints.map((p) => (
                          <li key={p} className="flex gap-2">
                            <span aria-hidden className="mt-2 size-1.5 shrink-0 bg-pax-purple" />
                            {p}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {lead.estimatedAnnualPremium ? (
                      <p className="text-fg-muted">
                        {t("conversation.leads.premium", {
                          amount: formatChf(lead.estimatedAnnualPremium, locale),
                        })}
                      </p>
                    ) : null}
                    <details className="rounded-m bg-gray-1 px-3 py-2">
                      <summary className="cursor-pointer text-xs font-medium">
                        {t("conversation.leads.breakdown")}
                      </summary>
                      <table className="mt-2 w-full text-xs">
                        <tbody>
                          {lead.scoreBreakdown.map((b, i) => (
                            <tr key={b.factor} className="border-t border-gray-2 first:border-t-0">
                              <th scope="row" className="py-1 pr-2 text-left font-normal">
                                {SCORE_FACTORS.includes(b.factor as ScoreFactor)
                                  ? t(`score.factor.${b.factor as ScoreFactor}`)
                                  : b.factor}
                              </th>
                              <td className="py-1 text-fg-muted">{notes[i]}</td>
                              <td className="py-1 text-right font-medium tabular-nums">
                                +{b.points}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                    <div className="flex flex-wrap items-center gap-2">
                      <LeadStatusSelect leadId={lead.id} status={lead.status} />
                      <AssignSelect
                        kind="lead"
                        id={lead.id}
                        value={lead.assignedAdvisorId}
                        advisors={detail.advisors}
                      />
                    </div>
                    <LeadNoteForm leadId={lead.id} />
                    {activities.length > 0 ? (
                      <ol className="grid gap-2 border-l-2 border-gray-2 pl-3">
                        {activities.map((a) => {
                          const data = (a.data ?? {}) as Record<string, string | number | null>;
                          let text: string;
                          if (a.type === "status_change") {
                            text = t("conversation.activity.statusChange", {
                              from: statusLabel(data.from),
                              to: statusLabel(data.to),
                            });
                          } else if (a.type === "system" && data.event === "created") {
                            text = t("conversation.activity.created", {
                              score: Number(data.score),
                            });
                          } else if (a.type === "system" && data.event === "rescored") {
                            text = t("conversation.activity.rescored", {
                              from: Number(data.fromScore),
                              to: Number(data.score),
                            });
                          } else if (a.type === "system" && data.event === "retyped") {
                            text = t("conversation.activity.retyped", {
                              from: typeLabel(data.fromType),
                              to: typeLabel(data.type),
                            });
                          } else if (a.type === "system" && data.event === "merged") {
                            text = t("conversation.activity.merged");
                          } else if (a.type === "system" && data.event === "assigned") {
                            text = data.to
                              ? t("conversation.activity.assigned", {
                                  name: advisorName.get(String(data.to)) ?? "?",
                                })
                              : t("conversation.activity.unassigned");
                          } else {
                            text = `${t(`conversation.leadNote.${a.type === "call" || a.type === "email" ? a.type : "note"}`)}: ${a.body ?? ""}`;
                          }
                          return (
                            <li key={a.id} className="grid gap-0.5">
                              <span className="text-xs text-fg-muted">
                                {a.advisorName ?? t("conversation.activity.system")} ·{" "}
                                {format.dateTime(a.createdAt, {
                                  day: "numeric",
                                  month: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                              <span className="whitespace-pre-wrap">{text}</span>
                            </li>
                          );
                        })}
                      </ol>
                    ) : null}
                  </li>
                );
              }),
            )
          }
        </ul>
      )}
    </Panel>
  );
}

export async function HandoversSection({ detail }: { detail: ConversationDetail }) {
  const [t, tChannel, format] = await Promise.all([
    getTranslations("firma"),
    getTranslations("firma.taxonomy.channel"),
    getFormatter(),
  ]);
  if (detail.handovers.length === 0) return null;
  return (
    <Panel title={t("conversation.handovers.title")}>
      <ul className="grid gap-4">
        {detail.handovers.map((h) => (
          <li key={h.id} className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <HandoverStatusBadge status={h.status} />
              {h.urgency === "high" ? (
                <span className="text-error-dark">{t("taxonomy.urgency.high")}</span>
              ) : null}
              <span className="ml-auto text-xs text-fg-muted">
                {format.dateTime(h.createdAt, {
                  day: "numeric",
                  month: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <p>{h.reason}</p>
            {h.preferredChannel || h.preferredTime ? (
              <p className="text-fg-muted">
                {[h.preferredChannel ? tChannel(h.preferredChannel) : null, h.preferredTime]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}
            {h.ruleIds.map((id) => (
              <p key={id} className="rounded-m bg-gray-1 px-3 py-2">
                {detail.rules[id]?.text ?? t("conversation.analysis.unknownRule")}
              </p>
            ))}
            <div className="flex flex-wrap gap-2">
              <HandoverStatusSelect handoverId={h.id} status={h.status} />
              <AssignSelect
                kind="handover"
                id={h.id}
                value={h.assignedAdvisorId}
                advisors={detail.advisors}
              />
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

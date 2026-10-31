import type { ImprovementWindow } from "@/lib/domain/learning";
import {
  type ConversationStatus,
  FUNNEL_STAGES,
  type FunnelStage,
  type Sentiment,
  stageIndex,
} from "@/lib/domain/taxonomy";

/**
 * One conversation, reduced to what the improvement analysis needs: how far it got, how it
 * ended, what the classifier and the customer said about it, advisor flags and the transcript.
 */
export interface ConversationDigest {
  id: string;
  stage: FunnelStage;
  status: ConversationStatus;
  mode: string;
  locale: string;
  isSimulated: boolean;
  messageCount: number;
  summary: string | null;
  sentiment: Sentiment | null;
  painPoints: string[];
  handoverRequired: boolean;
  nps: number | null;
  feedbackComment: string | null;
  flags: string[];
  toolErrors: number;
  transcript: string;
}

export const WINDOW_MS: Record<ImprovementWindow, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

export interface ImprovementStats {
  conversations: number;
  simulated: number;
  /** Where conversations stopped, by furthest funnel stage. */
  endedAtStage: Partial<Record<FunnelStage, number>>;
  /** Stopped before a recommendation without a handover or completion. */
  droppedBeforeRecommendation: number;
  negativeSentiment: number;
  npsCount: number;
  npsAverage: number | null;
  detractors: number;
  flagged: number;
  handedOver: number;
  /** Classifier said a handover was needed, but none happened. */
  missedHandovers: number;
  toolErrors: number;
}

const RECOMMENDATION = stageIndex("recommendation_shown");

export function computeStats(digests: ConversationDigest[]): ImprovementStats {
  const endedAtStage: ImprovementStats["endedAtStage"] = {};
  let nps = 0;
  let npsCount = 0;
  const stats: ImprovementStats = {
    conversations: digests.length,
    simulated: 0,
    endedAtStage,
    droppedBeforeRecommendation: 0,
    negativeSentiment: 0,
    npsCount: 0,
    npsAverage: null,
    detractors: 0,
    flagged: 0,
    handedOver: 0,
    missedHandovers: 0,
    toolErrors: 0,
  };
  for (const d of digests) {
    endedAtStage[d.stage] = (endedAtStage[d.stage] ?? 0) + 1;
    if (d.isSimulated) stats.simulated++;
    if (stageIndex(d.stage) < RECOMMENDATION && (d.status === "abandoned" || d.status === "idle"))
      stats.droppedBeforeRecommendation++;
    if (d.sentiment === "negative" || d.sentiment === "mixed") stats.negativeSentiment++;
    if (d.nps !== null) {
      nps += d.nps;
      npsCount++;
      if (d.nps <= 6) stats.detractors++;
    }
    if (d.flags.length > 0) stats.flagged++;
    if (d.status === "handed_over") stats.handedOver++;
    else if (d.handoverRequired) stats.missedHandovers++;
    stats.toolErrors += d.toolErrors;
  }
  stats.npsCount = npsCount;
  stats.npsAverage = npsCount ? Math.round((nps / npsCount) * 10) / 10 : null;
  return stats;
}

/** Stages in funnel order with their counts, for display. */
export function stageCounts(stats: ImprovementStats): Array<{ stage: FunnelStage; count: number }> {
  return FUNNEL_STAGES.map((stage) => ({ stage, count: stats.endedAtStage[stage] ?? 0 }));
}

/**
 * Conversations most worth reading first: flagged by an advisor, unhappy customers, missed
 * handovers and early drop-offs before uneventful ones. Keeps the prompt within budget.
 */
export function prioritise(digests: ConversationDigest[], limit: number): ConversationDigest[] {
  const weight = (d: ConversationDigest) =>
    (d.flags.length > 0 ? 8 : 0) +
    (d.nps !== null && d.nps <= 6 ? 4 : 0) +
    (d.sentiment === "negative" || d.sentiment === "mixed" ? 3 : 0) +
    (d.handoverRequired && d.status !== "handed_over" ? 3 : 0) +
    (d.status === "abandoned" || d.status === "idle" ? 2 : 0) +
    (d.toolErrors > 0 ? 1 : 0);
  return digests
    .map((d, i) => ({ d, i, w: weight(d) }))
    .sort((a, b) => b.w - a.w || a.i - b.i)
    .slice(0, limit)
    .map(({ d }) => d);
}

export function formatDigest(d: ConversationDigest): string {
  const facts = [
    `stage reached: ${d.stage}`,
    `status: ${d.status}`,
    `mode: ${d.mode}`,
    `language: ${d.locale}`,
    `messages: ${d.messageCount}`,
    d.isSimulated ? "simulated customer" : null,
    d.sentiment ? `sentiment: ${d.sentiment}` : null,
    d.nps !== null ? `NPS: ${d.nps}${d.feedbackComment ? ` ("${d.feedbackComment}")` : ""}` : null,
    d.handoverRequired
      ? `classifier: handover required${d.status === "handed_over" ? "" : " but none happened"}`
      : null,
    d.toolErrors ? `tool errors: ${d.toolErrors}` : null,
  ].filter(Boolean);
  return [
    `### Conversation ${d.id}`,
    facts.join("; "),
    d.summary ? `Summary: ${d.summary}` : null,
    d.painPoints.length ? `Pain points: ${d.painPoints.join("; ")}` : null,
    d.flags.length
      ? `ADVISOR FLAGGED AS NOT GOOD: ${d.flags.map((f) => `"${f}"`).join("; ")}`
      : null,
    "Transcript:",
    d.transcript || "(empty)",
  ]
    .filter(Boolean)
    .join("\n");
}

import type { IdentifiedGap, ProductInterest, ScoreBreakdown } from "@/lib/db/schema";
import {
  type ConversationMode,
  type CustomerLifecycle,
  FUNNEL_STAGES,
  type FunnelStage,
  type IntentStage,
  type LeadType,
  type PolicyCategory,
  type Priority,
  stageIndex,
  THIRD_PILLAR_CATEGORIES,
} from "@/lib/domain/taxonomy";

/**
 * Deterministic lead score (0–100) with a breakdown the dashboard can explain. The LLM only
 * classifies the conversation; how much each signal is worth is decided here, in code, so the
 * score is reproducible and auditable.
 *
 * `factor` is a stable key and `note` a language-neutral value (taxonomy key or number); the
 * dashboard translates both.
 */
export const SCORE_FACTORS = [
  "intent",
  "gap",
  "product",
  "contact",
  "stage",
  "mode",
  "external_policy",
  "service",
  "handover",
] as const;
export type ScoreFactor = (typeof SCORE_FACTORS)[number];

export interface LeadScoreInput {
  type: LeadType;
  intentStage: IntentStage;
  gaps: IdentifiedGap[];
  productInterest: ProductInterest[];
  lifecycle: CustomerLifecycle;
  hasContactDetails: boolean;
  stage: FunnelStage;
  mode: ConversationMode;
  handover: { required: boolean; urgency: "normal" | "high" } | null;
}

export interface LeadScore {
  score: number;
  breakdown: ScoreBreakdown[];
}

const INTENT_POINTS: Record<IntentStage, number> = {
  informing: 0,
  exploring: 10,
  comparing: 20,
  ready: 30,
};

const STRENGTH_POINTS: Record<ProductInterest["strength"], number> = {
  low: 5,
  medium: 10,
  high: 15,
};

const MAX_STAGE_POINTS = 15;

/** Annual gap in CHF → points. Gaps without an amount still count a little. */
export function gapPoints(gaps: IdentifiedGap[]): { points: number; total: number } {
  const total = gaps.reduce((sum, g) => sum + Math.max(0, g.amountAnnual ?? 0), 0);
  if (total >= 30_000) return { points: 20, total };
  if (total >= 15_000) return { points: 15, total };
  if (total >= 5_000) return { points: 10, total };
  if (total > 0) return { points: 5, total };
  return { points: Math.min(gaps.length * 4, 8), total };
}

export function scoreLead(input: LeadScoreInput): LeadScore {
  const breakdown: ScoreBreakdown[] = [];
  const add = (factor: ScoreFactor, points: number, note: string) => {
    if (points > 0) breakdown.push({ factor, points, note });
  };

  const isService = input.type === "service";

  add("intent", INTENT_POINTS[input.intentStage], input.intentStage);

  if (!isService) {
    const gap = gapPoints(input.gaps);
    add("gap", gap.points, String(Math.round(gap.total)));

    const strongest = input.productInterest.reduce<ProductInterest | null>(
      (best, p) =>
        !best || STRENGTH_POINTS[p.strength] > STRENGTH_POINTS[best.strength] ? p : best,
      null,
    );
    if (strongest) {
      add(
        "product",
        STRENGTH_POINTS[strongest.strength],
        `${strongest.productCode}:${strongest.strength}`,
      );
    }
  } else {
    add("service", 20, "service");
  }

  if (input.lifecycle === "client") add("contact", 10, "client");
  else if (input.hasContactDetails) add("contact", 10, "prospect");

  const reached = stageIndex(input.stage);
  add("stage", Math.round((reached / (FUNNEL_STAGES.length - 1)) * MAX_STAGE_POINTS), input.stage);

  if (input.mode === "existing_customer") add("mode", 5, input.mode);
  if (input.type === "switch_opportunity") add("external_policy", 10, "external");
  if (input.handover?.required) add("handover", 5, input.handover.urgency);

  const score = Math.min(
    100,
    breakdown.reduce((sum, b) => sum + b.points, 0),
  );
  return { score, breakdown };
}

/** Priority from the score, raised by an open handover (a person asked for a human). */
export function leadPriority(
  score: number,
  handover: { urgency: "normal" | "high" } | null,
): Priority {
  if (handover?.urgency === "high") return "urgent";
  const fromScore: Priority =
    score >= 75 ? "urgent" : score >= 55 ? "high" : score >= 30 ? "medium" : "low";
  if (handover && (fromScore === "low" || fromScore === "medium")) return "high";
  return fromScore;
}

export interface LeadTypeInput {
  lifecycle: CustomerLifecycle;
  /** Holds at least one (non-external) Pax policy. */
  hasPaxPolicy: boolean;
  /**
   * A 3rd-pillar policy at another insurer (never a pension fund): talked about in this
   * conversation, only on file in the cockpit, or none.
   */
  externalPolicy: "discussed" | "on_file" | "none";
  intentStage: IntentStage;
  gaps: IdentifiedGap[];
  productInterest: ProductInterest[];
  /** Pure service concern (change of beneficiary, payment, policy question), if any. */
  serviceRequest: string | null;
}

/**
 * Whether a switch is possible at all: only a 3rd-pillar policy at another insurer counts. A
 * pension fund (e.g. an uploaded pension certificate) cannot be switched, and Pax does not
 * replace non-life contracts.
 */
export function externalPolicyState(
  policies: Array<{ isExternal: boolean; category: PolicyCategory; status: string }>,
  discussed: { category: PolicyCategory } | null,
): LeadTypeInput["externalPolicy"] {
  if (discussed && THIRD_PILLAR_CATEGORIES.includes(discussed.category)) return "discussed";
  const onFile = policies.some(
    (p) => p.status === "active" && p.isExternal && THIRD_PILLAR_CATEGORIES.includes(p.category),
  );
  return onFile ? "on_file" : "none";
}

/** Sales potential: a concrete gap, a product of interest, or someone actively comparing. */
export function hasSalesPotential(
  input: Pick<LeadTypeInput, "intentStage" | "gaps" | "productInterest">,
): boolean {
  return (
    input.gaps.length > 0 ||
    input.productInterest.length > 0 ||
    input.intentStage === "comparing" ||
    input.intentStage === "ready"
  );
}

/**
 * The one lead a conversation produces, or null. A conversation can touch several things (a new
 * need and an external policy); the advisor gets a single lead with the most specific reason:
 * an external policy the customer talked about makes it a switch, otherwise the sales need
 * decides, and a policy that is only on file is a switch reason without any other need.
 */
export function determineLeadType(input: LeadTypeInput): LeadType | null {
  const sales = hasSalesPotential(input);
  const engaged = sales || input.intentStage !== "informing";
  const isClient = input.lifecycle === "client" || input.hasPaxPolicy;
  if (input.externalPolicy === "discussed" && engaged) return "switch_opportunity";
  if (sales) return isClient ? "existing_upsell" : "new_business";
  if (input.externalPolicy === "on_file" && engaged) return "switch_opportunity";
  if (input.serviceRequest) return "service";
  return null;
}

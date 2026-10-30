/**
 * Shared vocabulary for the advisor, the classifier and the company dashboard.
 * Values are stable, language-neutral keys; labels live in `messages/<locale>/common.json`
 * under `taxonomy.<group>.<key>`.
 */

export const LOCALES = ["de", "fr", "it", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const TOPICS = [
  "retirement",
  "pillar3a",
  "death_cover",
  "disability_cover",
  "home_ownership",
  "family_children",
  "taxes",
  "payout_retirement",
  "care",
  "pension_fund",
  "existing_contract",
  "general",
] as const;
export type Topic = (typeof TOPICS)[number];

export const LIFE_EVENTS = [
  "first_job",
  "marriage",
  "child_birth",
  "home_purchase",
  "job_change",
  "self_employment",
  "divorce",
  "early_retirement",
  "retirement",
  "inheritance",
  "illness",
  "relocation",
] as const;
export type LifeEvent = (typeof LIFE_EVENTS)[number];

/** Ordered: index = how far a conversation progressed. Used for funnel/drop-off analytics. */
export const FUNNEL_STAGES = [
  "started",
  "getting_to_know",
  "situation_captured",
  "analysis_shown",
  "scenario_explored",
  "recommendation_shown",
  "offer_viewed",
  "application_started",
  "signed",
] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export function stageIndex(stage: FunnelStage): number {
  return FUNNEL_STAGES.indexOf(stage);
}

/** Only ever moves forward. */
export function advanceStage(current: FunnelStage, next: FunnelStage): FunnelStage {
  return stageIndex(next) > stageIndex(current) ? next : current;
}

export const INTENT_STAGES = ["informing", "exploring", "comparing", "ready"] as const;
export type IntentStage = (typeof INTENT_STAGES)[number];

export const SENTIMENTS = ["positive", "neutral", "negative", "mixed"] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

export const CONVERSATION_MODES = ["new_business", "existing_customer"] as const;
export type ConversationMode = (typeof CONVERSATION_MODES)[number];

export const CONVERSATION_STATUSES = [
  "active",
  "idle",
  "completed",
  "abandoned",
  "handed_over",
] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export const CUSTOMER_LIFECYCLES = ["anonymous", "prospect", "client"] as const;
export type CustomerLifecycle = (typeof CUSTOMER_LIFECYCLES)[number];

export const LEAD_TYPES = [
  "new_business",
  "existing_upsell",
  "switch_opportunity",
  "service",
] as const;
export type LeadType = (typeof LEAD_TYPES)[number];

export const LEAD_STATUSES = ["new", "contacted", "meeting", "offer", "won", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

/** The kind of pension gap a recommendation or hint addresses. */
export const GAP_TYPES = [
  "death",
  "disability",
  "retirement",
  "tax",
  "child",
  "payout",
  "care",
] as const;
export type GapType = (typeof GAP_TYPES)[number];

export const RULE_ACTIONS = ["handover", "flag", "block_product"] as const;
export type RuleAction = (typeof RULE_ACTIONS)[number];

export const HANDOVER_STATUSES = ["open", "scheduled", "done", "cancelled"] as const;
export type HandoverStatus = (typeof HANDOVER_STATUSES)[number];

export const CONTACT_CHANNELS = ["phone", "video", "branch", "email"] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

export const DOCUMENT_TYPES = [
  "pension_certificate",
  "insurance_policy",
  "salary_certificate",
  "other",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_STATUSES = [
  "uploaded",
  "extracting",
  "extracted",
  "confirmed",
  "failed",
  "deleted",
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const POLICY_CATEGORIES = [
  "pillar3a",
  "savings_3b",
  "risk_death",
  "risk_disability",
  "payout_plan",
  "child",
  "care",
  "pension_fund",
  "nonlife_household",
  "nonlife_liability",
  "nonlife_motor",
  "health",
  "other",
] as const;
export type PolicyCategory = (typeof POLICY_CATEGORIES)[number];

/** Categories the advisor analyses and recommends on. Everything else is only listed in the cockpit. */
export const LIFE_AND_PENSION_CATEGORIES: readonly PolicyCategory[] = [
  "pillar3a",
  "savings_3b",
  "risk_death",
  "risk_disability",
  "payout_plan",
  "child",
  "care",
  "pension_fund",
];

export const POLICY_STATUSES = ["offer", "active", "ended", "cancelled"] as const;
export type PolicyStatus = (typeof POLICY_STATUSES)[number];

export const HINT_TYPES = [
  "cheaper_equivalent",
  "coverage_mismatch",
  "double_cover",
  "pillar3a_not_maxed",
  "pension_buyin",
  "contract_ending",
] as const;
export type HintType = (typeof HINT_TYPES)[number];

export const HINT_SEVERITIES = ["info", "warning", "opportunity"] as const;
export type HintSeverity = (typeof HINT_SEVERITIES)[number];

export const HINT_STATUSES = ["new", "seen", "dismissed", "acted"] as const;
export type HintStatus = (typeof HINT_STATUSES)[number];

export const DATA_SOURCES = ["chat", "form", "document", "crm", "advisor"] as const;
export type DataSource = (typeof DATA_SOURCES)[number];

export const ACTOR_TYPES = ["customer", "ai", "advisor", "system"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

/**
 * Enums for the company's product knowledge library and the learning loop (improvement
 * proposals from past conversations). Kept free of server imports so client components can use
 * them for labels and selects.
 */

export const KNOWLEDGE_KINDS = ["product_sheet", "terms", "tariff", "other"] as const;
export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number];

export const KNOWLEDGE_STATUSES = [
  "processing",
  "active",
  "superseded",
  "failed",
  "deleted",
] as const;
export type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[number];

export interface KnowledgeSection {
  heading: string;
  page: number | null;
  text: string;
}

export const IMPROVEMENT_WINDOWS = ["24h", "7d"] as const;
export type ImprovementWindow = (typeof IMPROVEMENT_WINDOWS)[number];

export const IMPROVEMENT_CATEGORIES = [
  "unanswered_question",
  "drop_off",
  "wrong_numbers",
  "confusing_reply",
  "missed_handover",
  "other",
] as const;
export type ImprovementCategory = (typeof IMPROVEMENT_CATEGORIES)[number];

/** What accepting a proposal changes: a company rule, the product knowledge, or the prompt. */
export const IMPROVEMENT_KINDS = ["rule", "knowledge", "prompt"] as const;
export type ImprovementKind = (typeof IMPROVEMENT_KINDS)[number];

/** `accepted` rule proposals wait in the rule editor; `applied` once a saved version has them. */
export const PROPOSAL_STATUSES = ["open", "accepted", "applied", "dismissed"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const CONVERSATION_FLAG_STATUSES = ["open", "resolved"] as const;

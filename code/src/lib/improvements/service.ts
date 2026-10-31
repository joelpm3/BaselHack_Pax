import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { audit } from "@/lib/audit";
import type { Advisor } from "@/lib/auth/advisor";
import { db, schema } from "@/lib/db";
import type { ProposalStatus } from "@/lib/domain/learning";

export type ImprovementRun = typeof schema.improvementRuns.$inferSelect;
export type ImprovementProposal = typeof schema.improvementProposals.$inferSelect;
export type ConversationFlag = typeof schema.conversationFlags.$inferSelect;

const p = schema.improvementProposals;
const f = schema.conversationFlags;

// ─── Reads ──────────────────────────────────────────────────────────────────

export function listRuns(limit = 8): ImprovementRun[] {
  return db
    .select()
    .from(schema.improvementRuns)
    .orderBy(desc(schema.improvementRuns.startedAt))
    .limit(limit)
    .all();
}

export function listProposals(statuses: ProposalStatus[]): ImprovementProposal[] {
  return db
    .select()
    .from(p)
    .where(inArray(p.status, statuses))
    .orderBy(desc(p.createdAt), desc(p.occurrences))
    .limit(100)
    .all();
}

export function getProposal(id: string): ImprovementProposal | undefined {
  return db.select().from(p).where(eq(p.id, id)).get();
}

/** Short labels for evidence links: conversation id → title. */
export function conversationTitles(ids: string[]): Map<string, string | null> {
  if (ids.length === 0) return new Map();
  return new Map(
    db
      .select({ id: schema.conversations.id, title: schema.conversations.title })
      .from(schema.conversations)
      .where(inArray(schema.conversations.id, [...new Set(ids)]))
      .all()
      .map((c) => [c.id, c.title]),
  );
}

export function listOpenFlags() {
  return db
    .select({
      id: f.id,
      conversationId: f.conversationId,
      note: f.note,
      createdAt: f.createdAt,
      advisorName: schema.advisors.name,
      conversationTitle: schema.conversations.title,
    })
    .from(f)
    .innerJoin(schema.conversations, eq(schema.conversations.id, f.conversationId))
    .leftJoin(schema.advisors, eq(schema.advisors.id, f.advisorId))
    .where(eq(f.status, "open"))
    .orderBy(desc(f.createdAt))
    .all();
}

export function listConversationFlags(conversationId: string) {
  return db
    .select({
      id: f.id,
      note: f.note,
      status: f.status,
      createdAt: f.createdAt,
      advisorName: schema.advisors.name,
    })
    .from(f)
    .leftJoin(schema.advisors, eq(schema.advisors.id, f.advisorId))
    .where(eq(f.conversationId, conversationId))
    .orderBy(desc(f.createdAt))
    .all();
}

// ─── Decisions ──────────────────────────────────────────────────────────────

/**
 * Accepting never changes the active rules: a rule proposal waits as a draft in the rule
 * editor until a person saves a new rule-set version with it.
 */
export function decideProposal(
  advisor: Advisor,
  proposalId: string,
  decision: "accepted" | "dismissed" | "open",
): ImprovementProposal | null {
  const proposal = getProposal(proposalId);
  if (!proposal || proposal.status === "applied") return null;
  const updated = db
    .update(p)
    .set({
      status: decision,
      decidedByAdvisorId: decision === "open" ? null : advisor.id,
      decidedAt: decision === "open" ? null : new Date(),
    })
    .where(eq(p.id, proposalId))
    .returning()
    .get();
  audit({
    actorType: "advisor",
    actorId: advisor.id,
    action: `improvement.${decision === "open" ? "reopened" : decision}`,
    entityType: "improvement_proposal",
    entityId: proposalId,
    data: { kind: proposal.kind, title: proposal.title },
  });
  return updated;
}

/** Called after a rule-set version containing the accepted rule was saved. */
export function markProposalApplied(advisor: Advisor, proposalId: string, version: number): void {
  const updated = db
    .update(p)
    .set({ status: "applied", appliedRuleSetVersion: version })
    .where(and(eq(p.id, proposalId), eq(p.status, "accepted")))
    .returning({ id: p.id })
    .get();
  if (!updated) return;
  audit({
    actorType: "advisor",
    actorId: advisor.id,
    action: "improvement.applied",
    entityType: "improvement_proposal",
    entityId: proposalId,
    data: { ruleSetVersion: version },
  });
}

// ─── Advisor flags ──────────────────────────────────────────────────────────

export function flagConversation(advisor: Advisor, conversationId: string, note: string): boolean {
  const conversation = db
    .select({ id: schema.conversations.id })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, conversationId))
    .get();
  if (!conversation) return false;
  const flag = db
    .insert(f)
    .values({ conversationId, advisorId: advisor.id, note })
    .returning({ id: f.id })
    .get();
  audit({
    actorType: "advisor",
    actorId: advisor.id,
    action: "conversation.flagged",
    entityType: "conversation",
    entityId: conversationId,
    data: { flagId: flag.id, note },
  });
  return true;
}

export function resolveFlag(advisor: Advisor, flagId: string): void {
  const flag = db
    .update(f)
    .set({ status: "resolved", resolvedAt: new Date() })
    .where(and(eq(f.id, flagId), eq(f.status, "open")))
    .returning()
    .get();
  if (!flag) return;
  audit({
    actorType: "advisor",
    actorId: advisor.id,
    action: "conversation.flag_resolved",
    entityType: "conversation",
    entityId: flag.conversationId,
    data: { flagId },
  });
}

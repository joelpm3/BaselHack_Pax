"use server";

import { refresh } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { IMPROVEMENT_WINDOWS } from "@/lib/domain/learning";
import { PRODUCT_CODES } from "@/lib/domain/products";
import { LOCALES, type Locale } from "@/lib/domain/taxonomy";
import { advisorOrThrow } from "@/lib/firma/auth";
import * as mutations from "@/lib/firma/mutations";
import { ruleSetDraftSchema } from "@/lib/firma/rule-sets";
import { startImprovementRun } from "@/lib/improvements/analyze";
import {
  decideProposal,
  flagConversation,
  getProposal,
  markProposalApplied,
  resolveFlag,
} from "@/lib/improvements/service";
import {
  deleteKnowledgeEntry,
  type KnowledgeLookup,
  lookupKnowledge,
} from "@/lib/knowledge/service";
import type { SaveRulesResult } from "./actions";

/** Server actions of the product knowledge library and the learning loop. */

const id = z.string().min(1).max(64);

export async function deleteKnowledge(entryId: string): Promise<void> {
  const advisor = await advisorOrThrow();
  await deleteKnowledgeEntry(id.parse(entryId), advisor.id);
  refresh();
}

/** What the advisor's lookupProductInfo would return, to test a document after upload. */
export async function previewKnowledge(
  productCode: string,
  question: string,
): Promise<KnowledgeLookup> {
  await advisorOrThrow();
  return lookupKnowledge(
    z.enum(PRODUCT_CODES).parse(productCode),
    z.string().trim().min(2).max(300).parse(question),
  );
}

export async function startImprovementAnalysis(window: string): Promise<void> {
  const advisor = await advisorOrThrow();
  const locale = await getLocale();
  startImprovementRun({
    window: z.enum(IMPROVEMENT_WINDOWS).parse(window),
    advisorId: advisor.id,
    locale: (LOCALES as readonly string[]).includes(locale) ? (locale as Locale) : "de",
  });
  refresh();
}

export async function decideImprovement(
  proposalId: string,
  decision: string,
): Promise<{ ok: boolean }> {
  const advisor = await advisorOrThrow();
  const updated = decideProposal(
    advisor,
    id.parse(proposalId),
    z.enum(["accepted", "dismissed", "open"]).parse(decision),
  );
  refresh();
  return { ok: updated !== null };
}

/**
 * Saves the rule editor's draft as a new version (exactly like the regular save) and, when the
 * draft still contains the rule from an accepted proposal, records the proposal as applied.
 */
export async function saveRuleSetWithProposal(
  draft: unknown,
  proposalId: string,
): Promise<SaveRulesResult> {
  const advisor = await advisorOrThrow();
  const parsed = ruleSetDraftSchema.safeParse(draft);
  if (!parsed.success) {
    return { status: "invalid", issues: parsed.error.issues.map((i) => i.path.join(".")) };
  }
  const proposal = getProposal(id.parse(proposalId));
  const result = mutations.saveRuleSet(advisor, parsed.data);
  if (result.status === "created" && proposal?.status === "accepted")
    markProposalApplied(advisor, proposal.id, result.version);
  refresh();
  return result;
}

const flagSchema = z.object({
  conversationId: id,
  note: z.string().trim().min(3).max(2000),
});

export async function flagConversationAction(
  _prev: { ok: boolean; error: boolean },
  formData: FormData,
): Promise<{ ok: boolean; error: boolean }> {
  const advisor = await advisorOrThrow();
  const parsed = flagSchema.safeParse({
    conversationId: formData.get("conversationId"),
    note: formData.get("note"),
  });
  if (!parsed.success) return { ok: false, error: true };
  const ok = flagConversation(advisor, parsed.data.conversationId, parsed.data.note);
  refresh();
  return { ok, error: !ok };
}

export async function resolveFlagAction(flagId: string): Promise<void> {
  const advisor = await advisorOrThrow();
  resolveFlag(advisor, id.parse(flagId));
  refresh();
}

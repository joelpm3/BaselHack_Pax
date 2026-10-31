import "server-only";
import { generateText, Output } from "ai";
import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { z } from "zod";
import { getModel, modelName } from "@/lib/ai/models";
import { audit } from "@/lib/audit";
import { db, schema } from "@/lib/db";
import {
  IMPROVEMENT_CATEGORIES,
  IMPROVEMENT_KINDS,
  type ImprovementWindow,
} from "@/lib/domain/learning";
import { PRODUCT_CODES, PRODUCTS } from "@/lib/domain/products";
import { type Locale, RULE_ACTIONS } from "@/lib/domain/taxonomy";
import { messageItems, transcriptForModel } from "@/lib/insights/transcript";
import { productsWithKnowledge } from "@/lib/knowledge/service";
import { formatRulesForPrompt, getActiveRuleSet } from "@/lib/rules/active";
import {
  type ConversationDigest,
  computeStats,
  formatDigest,
  prioritise,
  WINDOW_MS,
} from "./digest";

/**
 * The learning loop: reads the conversations of a time window (transcripts, classifier
 * analyses, NPS, advisor flags), lets the analysis model find recurring problems and stores
 * concrete proposals. Nothing changes on its own: a person accepts or dismisses every proposal,
 * and accepted rules still go through the versioned rule editor.
 */

const MAX_CONVERSATIONS = 40;
const TRANSCRIPT_CHARS = 4_000;
const TIMEOUT_MS = 240_000;
/** A run older than this is treated as crashed (e.g. server restarted mid-run). */
const STALE_RUN_MS = 10 * 60 * 1000;

const LANGUAGE: Record<Locale, string> = {
  de: "German (Swiss standard German, ss instead of ß)",
  fr: "French",
  it: "Italian",
  en: "English",
};

const proposalSchema = z.object({
  summary: z
    .string()
    .describe("Two or three sentences: the overall picture of these conversations"),
  proposals: z.array(
    z.object({
      category: z.enum(IMPROVEMENT_CATEGORIES),
      kind: z.enum(IMPROVEMENT_KINDS),
      title: z.string().describe("Short name of the problem, max. 80 characters"),
      problem: z.string().describe("What goes wrong and how often, citing what customers said"),
      proposal: z.string().describe("The concrete change you propose"),
      ruleText: z
        .string()
        .describe(
          "Only for kind=rule: the company rule as one natural-language sentence; else empty",
        ),
      ruleAction: z.enum([...RULE_ACTIONS, "none"]),
      ruleProductCode: z.enum([...PRODUCT_CODES, "none"]),
      evidence: z.array(
        z.object({
          conversationId: z.string(),
          note: z.string().describe("What happened in this conversation, one sentence"),
        }),
      ),
    }),
  ),
});

const INSTRUCTIONS = `You review conversations between Pax's digital pension advisor (an AI) and customers, to help the Pax team improve it. Find recurring problems and propose concrete, small improvements.
Look for:
- unanswered_question: the customer asked something the advisor could not or did not answer (often product details or general pension questions).
- drop_off: where customers stop (stage reached, status abandoned/idle) and what happened right before.
- wrong_numbers: figures that contradict a tool result, invented or premature numbers (amounts, premiums or products before the situation was understood).
- confusing_reply: long, jargon-heavy, repetitive or multi-question replies; replies in the wrong language.
- missed_handover: a person should have taken over (company rule, distress, complex case, explicit wish) but did not, or a handover came too late.
Each proposal changes exactly one thing:
- kind "rule": a new or changed company rule (natural language, like the active rules below). Actions: handover (hand to a human advisor when the condition applies), flag (keep advising but mark it), block_product (never offer a product while the condition applies; set ruleProductCode).
- kind "knowledge": missing product facts or FAQ answers Pax should add to its product documents.
- kind "prompt": the advisor's conversation behaviour (instructions) needs to change.
Rules for you:
- Advisor flags ("ADVISOR FLAGGED AS NOT GOOD") come from Pax staff: always address them.
- Every proposal needs evidence: the ids of the conversations where it happened (exactly as given) and one sentence each. Prefer problems seen in several conversations; a single conversation is enough only for an advisor flag or a serious error.
- Do not propose a rule that an active rule already covers. Do not repeat proposals listed as already decided.
- Be specific and factual. Never invent product facts, figures or legal statements.
- At most 6 proposals, most important first. If nothing needs to change, return none.`;

function loadDigests(since: Date): ConversationDigest[] {
  const c = schema.conversations;
  const conversations = db
    .select()
    .from(c)
    .where(gte(c.lastMessageAt, since))
    .orderBy(desc(c.lastMessageAt))
    .all()
    .filter((row) => row.messageCount > 0);
  if (conversations.length === 0) return [];
  const ids = conversations.map((row) => row.id);

  const analyses = new Map(
    db
      .select()
      .from(schema.analyses)
      .where(inArray(schema.analyses.conversationId, ids))
      .all()
      .map((a) => [a.conversationId, a]),
  );
  const feedback = new Map(
    db
      .select()
      .from(schema.feedback)
      .where(inArray(schema.feedback.conversationId, ids))
      .orderBy(asc(schema.feedback.createdAt))
      .all()
      .map((f) => [f.conversationId, f]),
  );
  const flags = new Map<string, string[]>();
  for (const flag of db
    .select()
    .from(schema.conversationFlags)
    .where(
      and(
        inArray(schema.conversationFlags.conversationId, ids),
        eq(schema.conversationFlags.status, "open"),
      ),
    )
    .all())
    flags.set(flag.conversationId, [...(flags.get(flag.conversationId) ?? []), flag.note]);

  const messagesByConversation = new Map<
    string,
    Array<{ role: "user" | "assistant" | "system"; parts: unknown[] }>
  >();
  for (const m of db
    .select({
      conversationId: schema.messages.conversationId,
      role: schema.messages.role,
      parts: schema.messages.parts,
    })
    .from(schema.messages)
    .where(inArray(schema.messages.conversationId, ids))
    .orderBy(asc(schema.messages.createdAt))
    .all())
    messagesByConversation.set(m.conversationId, [
      ...(messagesByConversation.get(m.conversationId) ?? []),
      m,
    ]);

  return conversations.map((row) => {
    const analysis = analyses.get(row.id);
    const fb = feedback.get(row.id);
    const messages = messagesByConversation.get(row.id) ?? [];
    const toolErrors = messages
      .flatMap((m) => messageItems(m.parts))
      .filter(
        (i) => i.kind === "tool" && (i.tool.errorText || i.tool.state === "output-error"),
      ).length;
    return {
      id: row.id,
      stage: row.stage,
      status: row.status,
      mode: row.mode,
      locale: row.locale,
      isSimulated: row.isSimulated,
      messageCount: row.messageCount,
      summary: analysis?.summary ?? null,
      sentiment: analysis?.sentiment ?? null,
      painPoints: analysis?.painPoints ?? [],
      handoverRequired: analysis?.handover.required ?? false,
      nps: fb?.nps ?? null,
      feedbackComment: fb?.comment ?? null,
      flags: flags.get(row.id) ?? [],
      toolErrors,
      transcript: transcriptForModel(messages, TRANSCRIPT_CHARS),
    };
  });
}

function decidedProposals(): string {
  const rows = db
    .select({
      title: schema.improvementProposals.title,
      status: schema.improvementProposals.status,
    })
    .from(schema.improvementProposals)
    .where(inArray(schema.improvementProposals.status, ["accepted", "applied", "dismissed"]))
    .orderBy(desc(schema.improvementProposals.createdAt))
    .limit(30)
    .all();
  return rows.length ? rows.map((r) => `- [${r.status}] ${r.title}`).join("\n") : "(none)";
}

async function executeRun(
  runId: string,
  window: ImprovementWindow,
  locale: Locale,
  now: Date,
): Promise<void> {
  try {
    const digests = loadDigests(new Date(now.getTime() - WINDOW_MS[window]));
    const stats = computeStats(digests);
    db.update(schema.improvementRuns)
      .set({ conversationCount: digests.length, stats: { ...stats } })
      .where(eq(schema.improvementRuns.id, runId))
      .run();
    if (digests.length === 0) {
      db.update(schema.improvementRuns)
        .set({ status: "completed", finishedAt: new Date() })
        .where(eq(schema.improvementRuns.id, runId))
        .run();
      return;
    }

    const selected = prioritise(digests, MAX_CONVERSATIONS);
    const knowledge = productsWithKnowledge();
    const prompt = [
      `Write titles, problems, proposals, rule texts and evidence notes in ${LANGUAGE[locale]}.`,
      "",
      "## Active company rules",
      formatRulesForPrompt(getActiveRuleSet()),
      "",
      "## Products and their uploaded product documents",
      PRODUCT_CODES.map((code) => {
        const docs = knowledge.find((k) => k.productCode === code)?.titles ?? [];
        return `- ${code}: ${PRODUCTS[code].name}; documents: ${docs.length ? docs.join(", ") : "none"}`;
      }).join("\n"),
      "",
      "## Proposals already decided by the team",
      decidedProposals(),
      "",
      `## Facts over all ${digests.length} conversations of the last ${window}`,
      JSON.stringify(stats),
      "",
      `## Conversations (${selected.length} of ${digests.length}, most problematic first)`,
      selected.map(formatDigest).join("\n\n"),
    ].join("\n");

    const { output } = await generateText({
      model: getModel("analysis"),
      instructions: INSTRUCTIONS,
      prompt,
      output: Output.object({ name: "improvement_proposals", schema: proposalSchema }),
      maxOutputTokens: 8_000,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const known = new Set(selected.map((d) => d.id));
    const rows = output.proposals.flatMap((p) => {
      const evidence = p.evidence.filter(
        (e, i, all) =>
          known.has(e.conversationId) &&
          all.findIndex((x) => x.conversationId === e.conversationId) === i,
      );
      if (evidence.length === 0) return [];
      const isRule = p.kind === "rule" && p.ruleText.trim().length >= 3 && p.ruleAction !== "none";
      const productCode = p.ruleProductCode === "none" ? null : p.ruleProductCode;
      if (isRule && p.ruleAction === "block_product" && !productCode) return [];
      return [
        {
          runId,
          category: p.category,
          kind: isRule ? ("rule" as const) : p.kind === "rule" ? ("prompt" as const) : p.kind,
          title: p.title.slice(0, 160),
          problem: p.problem,
          proposal: p.proposal,
          rule:
            isRule && p.ruleAction !== "none"
              ? {
                  text: p.ruleText.trim().slice(0, 1000),
                  action: p.ruleAction,
                  productCode: p.ruleAction === "block_product" ? productCode : null,
                }
              : null,
          evidence: evidence.map((e) => ({ conversationId: e.conversationId, note: e.note })),
          occurrences: evidence.length,
        },
      ];
    });

    db.transaction((tx) => {
      if (rows.length) tx.insert(schema.improvementProposals).values(rows).run();
      tx.update(schema.improvementRuns)
        .set({
          status: "completed",
          summary: output.summary,
          model: modelName("analysis"),
          finishedAt: new Date(),
        })
        .where(eq(schema.improvementRuns.id, runId))
        .run();
    });
  } catch (error) {
    console.error(`[improvements] run ${runId} failed`, error);
    db.update(schema.improvementRuns)
      .set({
        status: "failed",
        error: error instanceof Error ? error.message.slice(0, 500) : "failed",
        finishedAt: new Date(),
      })
      .where(eq(schema.improvementRuns.id, runId))
      .run();
  }
}

/** Starts an analysis in the background; returns the running one if there already is one. */
export function startImprovementRun(input: {
  window: ImprovementWindow;
  advisorId: string;
  locale: Locale;
}): string {
  const now = new Date();
  const running = db
    .select()
    .from(schema.improvementRuns)
    .where(eq(schema.improvementRuns.status, "running"))
    .all();
  for (const run of running) {
    if (now.getTime() - run.startedAt.getTime() < STALE_RUN_MS) return run.id;
    db.update(schema.improvementRuns)
      .set({ status: "failed", error: "Interrupted", finishedAt: now })
      .where(eq(schema.improvementRuns.id, run.id))
      .run();
  }
  const run = db
    .insert(schema.improvementRuns)
    .values({ window: input.window, startedByAdvisorId: input.advisorId })
    .returning({ id: schema.improvementRuns.id })
    .get();
  audit({
    actorType: "advisor",
    actorId: input.advisorId,
    action: "improvements.started",
    entityType: "improvement_run",
    entityId: run.id,
    data: { window: input.window },
  });
  void executeRun(run.id, input.window, input.locale, now);
  return run.id;
}

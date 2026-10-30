import "server-only";
import { generateText, Output } from "ai";
import { asc, desc, eq, sql } from "drizzle-orm";
import { getModel, modelName } from "@/lib/ai/models";
import { audit } from "@/lib/audit";
import { db, schema } from "@/lib/db";
import type { HandoverVerdict } from "@/lib/db/schema";
import { publish } from "@/lib/events/bus";
import { upsertLeadsForConversation } from "@/lib/leads/upsert";
import { getProfile } from "@/lib/profile/service";
import { formatRulesForPrompt, getActiveRuleSet } from "@/lib/rules/active";
import {
  CLASSIFIER_INSTRUCTIONS,
  type Classification,
  classificationSchema,
  FAQ_INSTRUCTIONS,
  type FaqExtraction,
  faqSchema,
  normaliseFaqKey,
} from "./prompts";
import { messageText, transcriptForModel } from "./transcript";

const FAQ_CONTEXT_LIMIT = 200;

export type AnalysisOutcome = "done" | "skipped";

function loadContext(conversationId: string) {
  const conversation = db.query.conversations
    .findFirst({ where: eq(schema.conversations.id, conversationId) })
    .sync();
  if (!conversation) return null;
  const customer = db.query.customers
    .findFirst({ where: eq(schema.customers.id, conversation.customerId) })
    .sync();
  if (!customer) return null;
  const messages = db
    .select({ role: schema.messages.role, parts: schema.messages.parts })
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .orderBy(asc(schema.messages.createdAt))
    .all();
  const previous = db.query.analyses
    .findFirst({ where: eq(schema.analyses.conversationId, conversationId) })
    .sync();
  return { conversation, customer, messages, previous };
}

function customerFacts(customerId: string): string {
  const profile = getProfile(customerId);
  const policies = db
    .select({
      insurer: schema.policies.insurer,
      isExternal: schema.policies.isExternal,
      category: schema.policies.category,
      productName: schema.policies.productName,
      premiumAnnual: schema.policies.premiumAnnual,
      sumInsured: schema.policies.sumInsured,
      status: schema.policies.status,
      endDate: schema.policies.endDate,
    })
    .from(schema.policies)
    .where(eq(schema.policies.customerId, customerId))
    .all();
  return [
    `Profile (JSON): ${JSON.stringify(profile)}`,
    `Policies (JSON): ${policies.length ? JSON.stringify(policies) : "none"}`,
  ].join("\n");
}

function recommendationFacts(conversationId: string): string {
  const rows = db
    .select({
      productCode: schema.recommendations.productCode,
      gap: schema.recommendations.gap,
      headline: schema.recommendations.headline,
      premiumAnnual: schema.recommendations.premiumAnnual,
      status: schema.recommendations.status,
    })
    .from(schema.recommendations)
    .where(eq(schema.recommendations.conversationId, conversationId))
    .all();
  return rows.length ? JSON.stringify(rows) : "none";
}

async function classify(
  ctx: NonNullable<ReturnType<typeof loadContext>>,
  rulesText: string,
  leadHints: string,
): Promise<Classification> {
  const { conversation, customer } = ctx;
  const prompt = [
    "## Active company rules (id, action, text)",
    rulesText,
    "",
    "## Company lead hints (what makes a good lead for Pax)",
    leadHints || "(none)",
    "",
    "## Customer",
    `Lifecycle: ${customer.lifecycle}; contact details given: ${Boolean(customer.email || customer.phone)}; language: ${conversation.locale}; conversation mode: ${conversation.mode}; funnel stage reached: ${conversation.stage}`,
    customerFacts(customer.id),
    "",
    "## Recommendations shown in this conversation",
    recommendationFacts(conversation.id),
    "",
    "## Transcript",
    transcriptForModel(ctx.messages),
  ].join("\n");

  const { output } = await generateText({
    model: getModel("analysis"),
    instructions: CLASSIFIER_INSTRUCTIONS,
    prompt,
    output: Output.object({ schema: classificationSchema, name: "conversation_analysis" }),
    maxRetries: 2,
  });
  return output;
}

async function extractFaqs(newUserTexts: string[]): Promise<FaqExtraction | null> {
  if (newUserTexts.length === 0) return null;
  const existing = db
    .select({
      key: schema.faqQuestions.key,
      text: schema.faqQuestions.canonicalText,
      topic: schema.faqQuestions.topic,
      uses: sql<number>`count(${schema.conversationFaqs.conversationId})`,
    })
    .from(schema.faqQuestions)
    .leftJoin(schema.conversationFaqs, eq(schema.conversationFaqs.faqId, schema.faqQuestions.id))
    .groupBy(schema.faqQuestions.id)
    .orderBy(desc(sql`count(${schema.conversationFaqs.conversationId})`))
    .limit(FAQ_CONTEXT_LIMIT)
    .all();
  const prompt = [
    "## Existing FAQ (key | question | topic)",
    existing.length
      ? existing.map((f) => `${f.key} | ${f.text} | ${f.topic}`).join("\n")
      : "(empty)",
    "",
    "## New customer messages",
    newUserTexts.map((t, i) => `${i + 1}. ${t}`).join("\n"),
  ].join("\n");
  const { output } = await generateText({
    model: getModel("analysis"),
    instructions: FAQ_INSTRUCTIONS,
    prompt,
    output: Output.object({ schema: faqSchema, name: "faq_questions" }),
    maxRetries: 2,
  });
  return output;
}

function storeFaqs(conversationId: string, extraction: FaqExtraction): void {
  db.transaction((tx) => {
    for (const q of extraction.questions) {
      let faqId: string | undefined;
      if (q.existingKey) {
        faqId = tx
          .select({ id: schema.faqQuestions.id })
          .from(schema.faqQuestions)
          .where(eq(schema.faqQuestions.key, q.existingKey))
          .get()?.id;
      }
      if (!faqId && q.proposed) {
        const key = normaliseFaqKey(q.proposed.key);
        if (!key) continue;
        const found = tx
          .select({ id: schema.faqQuestions.id })
          .from(schema.faqQuestions)
          .where(eq(schema.faqQuestions.key, key))
          .get();
        faqId =
          found?.id ??
          tx
            .insert(schema.faqQuestions)
            .values({
              key,
              canonicalText: q.proposed.canonicalText,
              translations: q.proposed.translations,
              topic: q.proposed.topic,
            })
            .returning({ id: schema.faqQuestions.id })
            .get().id;
      }
      if (!faqId) continue;
      tx.insert(schema.conversationFaqs)
        .values({ conversationId, faqId, askedText: q.askedText.slice(0, 500) })
        .onConflictDoNothing()
        .run();
    }
  });
}

/** Creates a handover when the classifier finds a handover rule met and none exists yet. */
function ensureHandover(
  conversation: { id: string; customerId: string },
  classification: Classification,
  handoverRuleIds: string[],
): void {
  if (!classification.handover.required) return;
  const existing = db
    .select({ id: schema.handovers.id })
    .from(schema.handovers)
    .where(eq(schema.handovers.conversationId, conversation.id))
    .get();
  if (existing) return;
  const [handover] = db
    .insert(schema.handovers)
    .values({
      conversationId: conversation.id,
      customerId: conversation.customerId,
      reason: classification.handover.reason ?? classification.summary,
      ruleIds: handoverRuleIds,
      urgency: classification.handover.urgency,
    })
    .returning()
    .all();
  audit({
    actorType: "ai",
    action: "handover.created",
    entityType: "handover",
    entityId: handover.id,
    data: { conversationId: conversation.id, ruleIds: handoverRuleIds, source: "classifier" },
  });
  publish({ type: "handover.created", handoverId: handover.id, conversationId: conversation.id });
}

// Scheduled runs and manual re-runs from the dashboard share one queue per conversation, so an
// older run can never finish after a newer one and overwrite its analysis and leads.
const globalForLocks = globalThis as unknown as {
  paxAnalysisLocks?: Map<string, Promise<unknown>>;
};
globalForLocks.paxAnalysisLocks ??= new Map();
const locks = globalForLocks.paxAnalysisLocks;

/**
 * Classifies a conversation, extracts FAQ, creates handovers and upserts scored leads.
 * Skips when nothing changed since the last run (unless forced).
 */
export function analyzeConversation(
  conversationId: string,
  options: { force?: boolean } = {},
): Promise<AnalysisOutcome> {
  const run = (locks.get(conversationId) ?? Promise.resolve()).then(() =>
    analyzeUnlocked(conversationId, options),
  );
  const settled = run.catch(() => undefined);
  locks.set(conversationId, settled);
  void settled.then(() => {
    if (locks.get(conversationId) === settled) locks.delete(conversationId);
  });
  return run;
}

async function analyzeUnlocked(
  conversationId: string,
  options: { force?: boolean },
): Promise<AnalysisOutcome> {
  const ctx = loadContext(conversationId);
  if (!ctx) return "skipped";
  const { conversation, customer, messages, previous } = ctx;
  if (!messages.some((m) => m.role === "user")) return "skipped";
  if (!options.force && previous?.messageCountAnalyzed === messages.length) return "skipped";

  const ruleSet = getActiveRuleSet();
  const activeRules = ruleSet.rules.filter((r) => r.active);
  const newUserTexts = messages
    .slice(previous?.messageCountAnalyzed ?? 0)
    .filter((m) => m.role === "user")
    .map((m) => messageText(m.parts))
    .filter(Boolean);

  const [classified, faqs] = await Promise.allSettled([
    classify(ctx, formatRulesForPrompt(ruleSet), ruleSet.leadHints),
    extractFaqs(newUserTexts),
  ]);
  if (faqs.status === "fulfilled" && faqs.value) storeFaqs(conversationId, faqs.value);
  else if (faqs.status === "rejected")
    console.error("[insights] FAQ extraction failed", faqs.reason);
  if (classified.status === "rejected") throw classified.reason;
  const c = classified.value;

  const ruleById = new Map(activeRules.map((r) => [r.id, r]));
  const triggered = [...new Set(c.triggeredRuleIds)].filter((id) => ruleById.has(id));
  const handoverRuleIds = triggered.filter((id) => ruleById.get(id)?.action === "handover");
  const verdict: HandoverVerdict = {
    required: c.handover.required,
    ruleIds: triggered,
    reason: c.handover.reason,
  };

  const values = {
    topics: [...new Set(c.topics)],
    lifeEvents: [...new Set(c.lifeEvents)],
    productInterest: c.productInterest,
    intentStage: c.intentStage,
    sentiment: c.sentiment,
    painPoints: c.painPoints.slice(0, 8),
    gaps: c.gaps,
    handover: verdict,
    summary: c.summary,
    nextBestAction: c.nextBestAction,
    model: modelName("analysis"),
    ruleSetId: ruleSet.id,
    messageCountAnalyzed: messages.length,
  };
  db.insert(schema.analyses)
    .values({ conversationId, ...values })
    .onConflictDoUpdate({ target: schema.analyses.conversationId, set: values })
    .run();
  if (!conversation.title && c.title) {
    db.update(schema.conversations)
      .set({ title: c.title.slice(0, 80) })
      .where(eq(schema.conversations.id, conversationId))
      .run();
  }

  ensureHandover(conversation, c, handoverRuleIds);
  const openHandover = db
    .select({ urgency: schema.handovers.urgency })
    .from(schema.handovers)
    .where(eq(schema.handovers.conversationId, conversationId))
    .all()
    .find(Boolean);

  // Re-read: the advisor may have advanced the stage while the model was thinking.
  const fresh =
    db.query.conversations
      .findFirst({ where: eq(schema.conversations.id, conversationId) })
      .sync() ?? conversation;
  const leadIds = upsertLeadsForConversation(fresh, customer, {
    intentStage: c.intentStage,
    gaps: c.gaps,
    productInterest: c.productInterest,
    serviceRequest: c.serviceRequest,
    externalPolicy: c.externalPolicy,
    reasonToCall: c.reasonToCall,
    talkingPoints: c.talkingPoints.slice(0, 5),
    handover: openHandover ?? null,
    handoverRequired: c.handover.required,
  });

  publish({ type: "analysis.updated", conversationId });
  for (const leadId of leadIds) publish({ type: "lead.upserted", leadId, conversationId });
  return "done";
}

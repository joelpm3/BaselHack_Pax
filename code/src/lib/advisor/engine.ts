import "server-only";
import {
  convertToModelMessages,
  generateText,
  getToolName,
  InvalidToolInputError,
  isStepCount,
  isToolUIPart,
  NoSuchToolError,
  type StopCondition,
  streamText,
  type ToolSet,
  toUIMessageStream,
  type UIMessageChunk,
} from "ai";
import { asc, eq } from "drizzle-orm";
import { getModel, modelName } from "@/lib/ai/models";
import { db, schema } from "@/lib/db";
import { documentNotesForAdvisor } from "@/lib/documents";
import { profileCompleteness } from "@/lib/domain/profile";
import { LIFE_AND_PENSION_CATEGORIES } from "@/lib/domain/taxonomy";
import { publish } from "@/lib/events/bus";
import { listHints } from "@/lib/hints/service";
import { scheduleAnalysis } from "@/lib/insights";
import { getProfile } from "@/lib/profile/service";
import { getActiveRuleSet } from "@/lib/rules/active";
import { applicationStates } from "@/lib/sales/status";
import {
  type AdvisorUIMessage,
  type Conversation,
  countMessages,
  deleteAnswersAfterLastUserMessage,
  followCustomerLanguage,
  getConversation,
  loadMessages,
  messageText,
  saveAssistantMessage,
  saveUserMessage,
} from "./conversations";
import { buildInstructions } from "./prompt";
import { readyToWait, replyNudgeFor, withReplyNudge } from "./reply-nudge";
import { stageAfterTurn } from "./stage";
import { createAdvisorTools, WAITS_FOR_CUSTOMER } from "./tools";
import type { ToolContext } from "./tools/context";
import { readinessFor } from "./tools/profile";
import { widgetChangeNote } from "./widget-inputs";
import { takeWidgetChanges } from "./widget-inputs-store";

/**
 * One advisor turn, shared by /api/chat (streamed to the browser) and runAdvisorTurn
 * (simulation, consumed on the server). Persists the user message first and the assistant
 * message when the stream ends, then updates the conversation and triggers the analysis.
 */

/** Error text sent to the client; the chat maps it to a localized message. */
export const ADVISOR_UNAVAILABLE = "advisor_unavailable";
/** Error text of a tool call the model sent with invalid input (hidden in the chat). */
export const INVALID_TOOL_CALL = "invalid_tool_call";
const MAX_STEPS = 8;

export interface TurnInput {
  conversation: Conversation;
  message: AdvisorUIMessage;
  trigger: "submit-message" | "regenerate-message";
}

export interface TurnResult {
  message: AdvisorUIMessage | null;
  error: string | null;
}

const waitsForCustomer: StopCondition<ToolSet> = ({ steps }) =>
  readyToWait(steps, WAITS_FOR_CUSTOMER);

/**
 * Prepares the stored transcript for the model: drops the greeting (it is in the instructions)
 * and old reasoning (its signature is bound to the previous, different system prompt), and adds
 * context the model needs but the customer should not see. After the review card, the note
 * states what the server already did with each document (values applied, discarded); after the
 * customer moved a widget's sliders, what they set there.
 */
function forModel(messages: AdvisorUIMessage[], customerId: string): AdvisorUIMessage[] {
  return messages
    .filter((m) => m.metadata?.kind !== "greeting")
    .map((m) => {
      if (m.role === "assistant") return { ...m, parts: m.parts.filter(isTranscriptPart) };
      if (m.role !== "user") return m;
      const notes: string[] = [];
      const documentIds = m.metadata?.documentIds ?? [];
      if (documentIds.length > 0 && m.metadata?.inputMode === "upload")
        notes.push(`[Uploaded document ids: ${documentIds.join(", ")}]`);
      else if (documentIds.length > 0)
        notes.push(...documentNotesForAdvisor(customerId, documentIds));
      if (m.metadata?.inputMode === "voice")
        notes.push("[Dictated by voice: the transcript may contain recognition errors]");
      for (const change of m.metadata?.widgetChanges ?? []) notes.push(widgetChangeNote(change));
      return notes.length
        ? { ...m, parts: [...m.parts, { type: "text" as const, text: notes.join("\n") }] }
        : m;
    });
}

/** Reasoning and provider bookkeeping (`custom`) are neither stored nor replayed. */
function isTranscriptPart(part: AdvisorUIMessage["parts"][number]): boolean {
  return part.type !== "reasoning" && part.type !== "custom";
}

function completedTools(message: AdvisorUIMessage): string[] {
  return message.parts
    .filter(isToolUIPart)
    .filter((part) => part.state === "output-available")
    .map((part) => getToolName(part));
}

function hasContent(message: AdvisorUIMessage): boolean {
  return message.parts.some(
    (part) => (part.type === "text" && part.text.trim().length > 0) || isToolUIPart(part),
  );
}

async function generateTitle(conversation: Conversation, history: AdvisorUIMessage[]) {
  const transcript = history
    .filter((m) => m.metadata?.kind !== "greeting")
    .slice(0, 4)
    .map((m) => `${m.role}: ${messageText(m).slice(0, 400)}`)
    .join("\n");
  const { text } = await generateText({
    model: getModel("analysis"),
    instructions:
      "Write a short title (2 to 6 words) for this pension advice conversation, in the language " +
      "the customer writes in. Name the topic, not the person. No quotes, no final period.",
    prompt: transcript,
    maxOutputTokens: 30,
  });
  const title = text
    .trim()
    .replace(/^["'«]|["'»]$/g, "")
    .slice(0, 80);
  if (!title) return;
  db.update(schema.conversations)
    .set({ title })
    .where(eq(schema.conversations.id, conversation.id))
    .run();
  publish({ type: "conversation.updated", conversationId: conversation.id });
}

function finishTurn(
  conversation: Conversation,
  response: AdvisorUIMessage,
  details: { ruleSetId: string; inputTokens?: number; outputTokens?: number },
): boolean {
  const saved = hasContent(response);
  if (saved) {
    const transcript = { ...response, parts: response.parts.filter(isTranscriptPart) };
    saveAssistantMessage(conversation.id, transcript, {
      model: modelName("chat"),
      ruleSetId: details.ruleSetId,
      inputTokens: details.inputTokens,
      outputTokens: details.outputTokens,
    });
    publish({
      type: "conversation.message",
      conversationId: conversation.id,
      role: "assistant",
      preview: messageText(response).slice(0, 160),
    });
  }
  const fresh = getConversation(conversation.id) ?? conversation;
  const completeness = profileCompleteness(getProfile(conversation.customerId));
  db.update(schema.conversations)
    .set({
      stage: stageAfterTurn(fresh.stage, {
        completedTools: completedTools(response),
        completeness,
        hasUserMessage: true,
      }),
      status: fresh.status === "handed_over" ? "handed_over" : "active",
      ruleSetId: details.ruleSetId,
      messageCount: countMessages(conversation.id),
      lastMessageAt: new Date(),
    })
    .where(eq(schema.conversations.id, conversation.id))
    .run();
  publish({ type: "conversation.updated", conversationId: conversation.id });
  scheduleAnalysis(conversation.id);
  return saved;
}

export async function streamAdvisorTurn(
  input: TurnInput,
  onSettled?: (result: TurnResult) => void,
): Promise<ReadableStream<UIMessageChunk>> {
  const { message } = input;
  const conversation = followCustomerLanguage(input.conversation, message);
  if (input.trigger === "regenerate-message") deleteAnswersAfterLastUserMessage(conversation.id);
  const inputMode = message.metadata?.inputMode ?? "text";
  if (saveUserMessage(conversation.id, message, inputMode)) {
    publish({
      type: "conversation.message",
      conversationId: conversation.id,
      role: "user",
      preview: messageText(message).slice(0, 160),
    });
  }

  // Before the history is loaded: the note is stored on this message and replayed from there.
  takeWidgetChanges(conversation.id, conversation.customerId, message.id);

  const ruleSet = getActiveRuleSet();
  const history = loadMessages(conversation.id);
  const profile = getProfile(conversation.customerId);
  const customer = db.query.customers
    .findFirst({ where: eq(schema.customers.id, conversation.customerId) })
    .sync();
  if (!customer) throw new Error(`Customer of conversation ${conversation.id} not found`);
  const policies = db
    .select()
    .from(schema.policies)
    .where(eq(schema.policies.customerId, conversation.customerId))
    .orderBy(asc(schema.policies.createdAt))
    .all()
    .filter((p) => LIFE_AND_PENSION_CATEGORIES.includes(p.category) || !p.isExternal);
  const greeting = history.find((m) => m.metadata?.kind === "greeting");

  const assistantMessageId = crypto.randomUUID();
  const toolContext: ToolContext = {
    conversationId: conversation.id,
    customerId: conversation.customerId,
    locale: conversation.locale,
    mode: conversation.mode,
    ruleSet,
    assistantMessageId,
  };
  const tools = createAdvisorTools(toolContext);
  const readiness = readinessFor(conversation.customerId, profile);

  const instructions = buildInstructions({
    mode: conversation.mode,
    locale: conversation.locale,
    today: new Date(),
    stage: conversation.stage,
    customer,
    profile,
    completeness: profileCompleteness(profile),
    missingForAnalysis: readiness.missing,
    askBeforeAnalysis: readiness.askFirst,
    policies,
    ruleSet,
    greeting: greeting ? messageText(greeting) : null,
    uploadHint: greeting?.metadata?.variant === "upload",
    hints: listHints(conversation.customerId)
      .filter((h) => h.status !== "dismissed")
      .slice(0, 8),
    topicHintId: greeting?.metadata?.hintId ?? null,
    applications: applicationStates(conversation.id),
  });
  const result = streamText({
    model: getModel("chat"),
    instructions,
    messages: await convertToModelMessages(forModel(history, conversation.customerId), {
      tools,
      ignoreIncompleteToolCalls: true,
    }),
    tools,
    stopWhen: [isStepCount(MAX_STEPS), waitsForCustomer],
    prepareStep: ({ steps, messages }) => {
      const nudge = replyNudgeFor(steps, WAITS_FOR_CUSTOMER);
      return nudge ? { messages: withReplyNudge(messages, nudge) } : undefined;
    },
    temperature: 0.4,
    // A failed step ends the turn without text and without a stream error: log it.
    onStepError: ({ error }) => console.error(`[advisor] step failed in ${conversation.id}`, error),
  });

  let usage: { inputTokens?: number; outputTokens?: number } = {};
  let streamError: string | null = null;
  const isFirstExchange = !history.some((m) => m.role === "assistant" && !m.metadata?.kind);

  return toUIMessageStream<ToolSet, AdvisorUIMessage>({
    stream: result.stream,
    originalMessages: history,
    generateMessageId: () => assistantMessageId,
    sendReasoning: false,
    messageMetadata: ({ part }) => {
      if (part.type === "start") return { createdAt: Date.now(), model: modelName("chat") };
      if (part.type === "finish") {
        usage = {
          inputTokens: part.totalUsage.inputTokens,
          outputTokens: part.totalUsage.outputTokens,
        };
      }
      return undefined;
    },
    onError: (error) => {
      // A malformed tool call is repaired by the model in its next step; the UI hides it.
      if (InvalidToolInputError.isInstance(error) || NoSuchToolError.isInstance(error))
        return INVALID_TOOL_CALL;
      console.error(`[advisor] stream error in ${conversation.id}`, error);
      streamError = error instanceof Error ? error.message : String(error);
      return ADVISOR_UNAVAILABLE;
    },
    onEnd: ({ responseMessage }) => {
      try {
        const saved = finishTurn(conversation, responseMessage, {
          ruleSetId: ruleSet.id,
          ...usage,
        });
        if (saved && isFirstExchange && !conversation.title) {
          void generateTitle(conversation, [...history, responseMessage]).catch((error) =>
            console.error(`[advisor] title failed for ${conversation.id}`, error),
          );
        }
        onSettled?.({ message: saved ? responseMessage : null, error: streamError });
      } catch (error) {
        console.error(`[advisor] persisting turn failed for ${conversation.id}`, error);
        onSettled?.({ message: null, error: String(error) });
      }
    },
  });
}

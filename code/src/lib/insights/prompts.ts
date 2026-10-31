import { z } from "zod";
import { PRODUCT_CODES, PRODUCTS } from "@/lib/domain/products";
import {
  GAP_TYPES,
  INTENT_STAGES,
  LIFE_EVENTS,
  POLICY_CATEGORIES,
  SENTIMENTS,
  TOPICS,
} from "@/lib/domain/taxonomy";

/** Structured output of the conversation classifier (one call per debounced run). */
export const classificationSchema = z.object({
  title: z.string().describe("Short German title of the conversation, at most 6 words."),
  summary: z
    .string()
    .describe("2–3 neutral German sentences: who the customer is, what they want, where it ended."),
  topics: z.array(z.enum(TOPICS)).describe("All topics the conversation covers."),
  lifeEvents: z
    .array(z.enum(LIFE_EVENTS))
    .describe("Past, current or planned life events the customer mentioned."),
  productInterest: z
    .array(
      z.object({
        productCode: z.enum(PRODUCT_CODES),
        strength: z
          .enum(["low", "medium", "high"])
          .describe(
            "high: asked for an offer, price or to apply; medium: asked follow-up questions; low: only shown or mentioned.",
          ),
      }),
    )
    .describe("Pax products the customer engaged with."),
  intentStage: z
    .enum(INTENT_STAGES)
    .describe(
      "informing: general questions without a personal situation; exploring: shares their situation, looks at own gaps; comparing: weighs options, products or prices; ready: wants an offer, to apply or to sign.",
    ),
  sentiment: z.enum(SENTIMENTS).describe("The customer's overall mood towards the advice."),
  painPoints: z
    .array(z.string())
    .describe(
      "Customer frustrations, confusions, worries or objections, each a short German phrase (max 8 words). Empty if none.",
    ),
  gaps: z
    .array(
      z.object({
        gap: z.enum(GAP_TYPES),
        amountAnnual: z
          .number()
          .nullable()
          .describe("Gap in CHF per year if a calculation or the advisor stated it, else null."),
        note: z.string().describe("Short German note on the gap."),
      }),
    )
    .describe("Pension gaps identified in the conversation."),
  triggeredRuleIds: z
    .array(z.string())
    .describe("Ids of the company rules whose condition this conversation meets (any action)."),
  handover: z.object({
    required: z
      .boolean()
      .describe(
        "True if a rule with action `handover` is met or the customer asks for a human advisor.",
      ),
    reason: z.string().nullable().describe("Short German reason for the handover, or null."),
    urgency: z
      .enum(["normal", "high"])
      .describe(
        "high if the customer explicitly asks for a person or the matter is time-sensitive.",
      ),
  }),
  serviceRequest: z
    .string()
    .nullable()
    .describe(
      "A pure service concern without sales potential (e.g. change of beneficiary, payment, policy status), in German; else null.",
    ),
  externalPolicy: z
    .object({
      insurer: z.string(),
      category: z.enum(POLICY_CATEGORIES),
      note: z
        .string()
        .describe("German: what the customer said about it (price, cover, dissatisfaction)."),
    })
    .nullable()
    .describe(
      "A private life or 3rd-pillar policy the customer holds at another insurer, if mentioned. Never the pension fund (2nd pillar, e.g. an uploaded pension certificate): that cannot be switched.",
    ),
  reasonToCall: z
    .string()
    .describe(
      "One German sentence: why a Pax advisor should call this person now, using the company's lead hints. If there is no good reason, say so briefly.",
    ),
  talkingPoints: z
    .array(z.string())
    .describe("2–4 concrete German talking points for that call, grounded in the conversation."),
  nextBestAction: z.string().nullable().describe("What Pax should do next, one German sentence."),
});
export type Classification = z.infer<typeof classificationSchema>;

const productList = PRODUCT_CODES.map(
  (code) => `- ${code}: ${PRODUCTS[code].name} (closes: ${PRODUCTS[code].closes.join(", ")})`,
).join("\n");

export const CLASSIFIER_INSTRUCTIONS = `You are the conversation analyst of Pax, a Swiss life insurer (pension provision, pillar 3a/3b).
You read one conversation between a customer and Clara, Pax's digital pension advisor (an AI), and classify it for Pax's sales and product teams.

Rules:
- Only state what the conversation supports. Do not invent amounts, products or events.
- Gap amounts come from tool results (calculations) or explicit statements; otherwise amountAnnual is null.
- intentStage and productInterest are about taking out new cover. A customer who only needs a service on a contract they already hold (beneficiary change, address, payment, policy question) is "informing" with no product interest, and the concern goes into serviceRequest.
- Evaluate every active company rule against the conversation and the customer data; company rules may be written in German, French, Italian or English.
- Write every free-text field in German (Swiss spelling: "ss" instead of "ß"), short and neutral, no greetings.
- The customer may write in any language; that does not change the output language.

Pax products (use these codes):
${productList}`;

export const FAQ_INSTRUCTIONS = `You maintain Pax's list of frequently asked customer questions about pension provision and life insurance.
Given new customer messages from one conversation and the existing FAQ list:
- Extract only real questions the customer asked about insurance, pensions, taxes, products or Pax's process. Ignore small talk and answers to the advisor's questions.
- Generalise each into a question many customers could ask: remove names, personal amounts and dates.
- If it matches an existing FAQ (same meaning), return that key in existingKey and proposed = null.
- Otherwise return existingKey = null and propose a new entry: key in snake_case English (max 6 words), canonicalText as an English question, translations (de: Swiss High German with "ss", fr, it, en), and the topic.
- Return an empty list if the customer asked no such question.`;

export const faqSchema = z.object({
  questions: z.array(
    z.object({
      askedText: z.string().describe("The customer's question as asked (original language)."),
      existingKey: z.string().nullable(),
      proposed: z
        .object({
          key: z.string(),
          canonicalText: z.string(),
          topic: z.enum(TOPICS),
          translations: z.object({
            de: z.string(),
            fr: z.string(),
            it: z.string(),
            en: z.string(),
          }),
        })
        .nullable(),
    }),
  ),
});
export type FaqExtraction = z.infer<typeof faqSchema>;

/** Model output → a safe snake_case key. */
export function normaliseFaqKey(key: string): string {
  return key
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

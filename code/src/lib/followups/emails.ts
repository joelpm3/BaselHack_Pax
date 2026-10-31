import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { getModel } from "@/lib/ai/models";
import { formatSwissDate } from "@/lib/documents/dates";
import type { Locale } from "@/lib/domain/taxonomy";
import type { DatePrecision, FutureEventKind } from "./taxonomy";

/**
 * Personalised follow-up and check-in emails, written by the analysis model. Nothing is sent: the
 * text goes into the mocked outbox.
 */

const LANGUAGE: Record<Locale, string> = {
  de: "Swiss High German (use “ss”, never “ß”), formal “Sie”",
  fr: "French, formal “vous”",
  it: "Italian, formal “Lei”",
  en: "English",
};

const SHARED_RULES = `Rules:
- Plain text, no markdown, no placeholders like [Name]. Greeting with the customer's name if known, otherwise a neutral greeting.
- Short: at most 120 words in the body. Warm, personal, never pushy.
- Sign off as "Ihr Pax-Beratungsteam" (translated into the email's language). No advisor names, phone numbers or URLs.
- Never invent products, prices, premiums, legal figures or promises. Do not recommend a product.
- Invite the customer to reply to this email, or to continue in their Pax Vorsorge-Cockpit / with the digital advisor.`;

const emailSchema = z.object({
  subject: z.string().describe("Email subject, at most 70 characters."),
  body: z.string().describe("Email body as plain text with line breaks."),
});
export type EmailText = z.infer<typeof emailSchema>;

const callSchema = emailSchema.extend({
  reasonToCall: z
    .string()
    .describe("One German sentence for the Pax advisor: why to call this customer now."),
  talkingPoints: z
    .array(z.string())
    .describe("2–4 German talking points for that call, grounded in the original conversation."),
});
export type FollowUpText = z.infer<typeof callSchema>;

export interface FollowUpInput {
  locale: Locale;
  firstName: string | null;
  lastName: string | null;
  kind: FutureEventKind;
  kindLabel: string;
  subject: string | null;
  expectedDate: string;
  precision: DatePrecision;
  sourceQuote: string;
  note: string | null;
  /** ISO date of the original conversation. */
  conversationDate: string | null;
  conversationSummary: string | null;
  /** 1 = first email, 2 = reminder. */
  sequence: number;
  /** ISO date the email goes out. */
  today: string;
}

function facts(input: FollowUpInput): string {
  return [
    `Customer: ${[input.firstName, input.lastName].filter(Boolean).join(" ") || "(name unknown)"}`,
    `Email date: ${formatSwissDate(input.today)}`,
    `Original conversation: ${input.conversationDate ? formatSwissDate(input.conversationDate) : "unknown date"}`,
    `What the customer said: "${input.sourceQuote}"`,
    `Event: ${input.kindLabel}${input.subject ? ` (concerns: ${input.subject})` : ""}`,
    `Expected around: ${formatSwissDate(input.expectedDate)} (precision: ${input.precision})`,
    input.note ? `Note: ${input.note}` : null,
    input.conversationSummary ? `Conversation summary: ${input.conversationSummary}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** The first follow-up email plus the advisor's reason to call and talking points. */
export async function writeFollowUp(input: FollowUpInput): Promise<FollowUpText> {
  const { output } = await generateText({
    model: getModel("analysis"),
    instructions: `You write a personal follow-up email for Pax, a Swiss life insurer, in ${LANGUAGE[input.locale]}.
The customer talked to Pax's digital pension advisor and mentioned a future life event. Its time has come now.
Structure: "On <date> we talked about <topic>; you mentioned <plan> around <time>. Is that now the case?" Then one sentence on why a short review of their pension provision makes sense at this moment (in general terms), and the invitation.
Refer to the expected time as loosely as the customer did (a season or month, not an exact day, unless the precision is "day").
${SHARED_RULES}
Also write, in German, a reason to call and talking points for the Pax advisor who follows up by phone.`,
    prompt: facts(input),
    output: Output.object({ schema: callSchema, name: "follow_up" }),
    maxRetries: 2,
  });
  return output;
}

/** The reminder after the first email went unanswered. */
export async function writeReminder(input: FollowUpInput): Promise<EmailText> {
  const { output } = await generateText({
    model: getModel("analysis"),
    instructions: `You write a short, friendly reminder email for Pax, a Swiss life insurer, in ${LANGUAGE[input.locale]}.
Two weeks ago Pax wrote to the customer about a life event they had mentioned in a conversation with the digital pension advisor and got no answer. Mention that briefly, ask again in one sentence whether the event has happened or is still planned, and make clear that a reply is enough. At most 70 words.
${SHARED_RULES}`,
    prompt: facts(input),
    output: Output.object({ schema: emailSchema, name: "reminder" }),
    maxRetries: 2,
  });
  return output;
}

export interface CheckinInput {
  locale: Locale;
  firstName: string | null;
  lastName: string | null;
  today: string;
  /** Short facts from the profile the email may refer to (family, job, home). */
  profileFacts: string;
}

/** The yearly "has anything changed?" check-in. */
export async function writeCheckin(input: CheckinInput): Promise<EmailText> {
  const { output } = await generateText({
    model: getModel("analysis"),
    instructions: `You write the yearly check-in email of Pax, a Swiss life insurer, in ${LANGUAGE[input.locale]}.
Once a year Pax asks its customers whether anything changed that matters for their pension provision: family (marriage, children, separation), job (new job, workload, self-employment), home (move, home purchase) or income. Ask that in a short, friendly way and refer to one or two facts Pax knows about the customer so it feels personal. Close by saying the customer can switch off this yearly email at any time in their Vorsorge-Cockpit.
${SHARED_RULES}`,
    prompt: [
      `Customer: ${[input.firstName, input.lastName].filter(Boolean).join(" ") || "(name unknown)"}`,
      `Email date: ${formatSwissDate(input.today)}`,
      `What Pax knows: ${input.profileFacts}`,
    ].join("\n"),
    output: Output.object({ schema: emailSchema, name: "checkin" }),
    maxRetries: 2,
  });
  return output;
}

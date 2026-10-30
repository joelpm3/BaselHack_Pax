import { z } from "zod";
import type { Locale } from "@/lib/domain/taxonomy";
import { type Concern, personaEmail, type SimPersona, type Style } from "./personas";

/** What the simulated customer decides each turn. */
export const customerTurnSchema = z.object({
  action: z
    .enum(["continue", "end", "drop_off"])
    .describe(
      "continue: send a message and keep talking; end: send a last message (thanks/goodbye) and leave; drop_off: leave silently without a message.",
    ),
  message: z.string().describe("Your next chat message. Empty for drop_off."),
  nps: z
    .number()
    .nullable()
    .describe(
      "Only for action end: how likely (0–10) you would recommend this advisor to a friend. Else null.",
    ),
});
export type CustomerTurn = z.infer<typeof customerTurnSchema>;

const LANGUAGE: Record<Locale, string> = {
  de: "German as written in Switzerland (Swiss Standard German, 'ss' instead of 'ß'; an occasional Swiss word is fine)",
  fr: "French as written in Romandie",
  it: "Italian as written in Ticino",
  en: "English (you are an expat living in Switzerland)",
};

const CONCERN_TEXT: Record<Concern, string> = {
  baby_on_the_way:
    "You are expecting a baby (or just had one) and wonder what happens to the family financially if something happens to you or your partner.",
  buying_home:
    "You want to buy a flat or house in the next years and wonder whether you can use your pillar 3a and pension fund money for the down payment, and what that means for your retirement.",
  early_retirement:
    "You would like to stop working a few years before 65 and want to know whether that is affordable and how to prepare.",
  pillar3a_taxes:
    "You heard pillar 3a saves taxes and want to know how much you could save and which 3a solution fits you.",
  disability_worry:
    "A colleague became unable to work after an illness; you worry what would happen to your income in that case.",
  external_policy:
    "You already have a life insurance policy at another insurer and wonder whether it is still good or too expensive.",
  wants_human:
    "You have questions about your pension provision but you prefer to discuss the details with a real person.",
  self_employed:
    "You recently became self-employed, no longer have a pension fund and wonder how to protect yourself and save for retirement.",
  high_wealth:
    "You have considerable savings and want to optimise taxes and retirement provision; your situation is somewhat complex.",
  retirement_payout:
    "Retirement is getting closer and you wonder whether to take your pension fund as a lump sum or as an annuity, and how to plan the payout.",
  first_job:
    "You just started your first proper job and want to know whether you should already do something for your retirement.",
};

const STYLE_TEXT: Record<Style, string> = {
  brief: "You write short messages (one or two sentences), like on a phone.",
  chatty: "You are friendly and talkative and share some context about your life.",
  sceptical:
    "You are sceptical of insurers and sales; you ask what it costs and whether you really need it.",
  precise: "You are precise and ask for concrete numbers and explanations.",
};

const chf = (n: number) => `CHF ${n.toLocaleString("de-CH")}`;

export function personaFacts(p: SimPersona, currentYear: number): string {
  const lines = [
    `Name: ${p.firstName} ${p.lastName}, ${p.sex}, born ${p.birthYear} (age ${currentYear - p.birthYear})`,
    `Lives in ${p.city} (${p.zip}, canton ${p.canton})`,
    `Marital status: ${p.maritalStatus}`,
    p.employment === "homemaker"
      ? "Does not work outside the home"
      : `${p.employment === "self_employed" ? "Self-employed" : "Employed"} at ${p.workloadPercent}%, gross income ${chf(p.grossIncome)} per year`,
    p.partner
      ? `Partner: ${p.partner.firstName}, born ${p.partner.birthYear}, gross income ${chf(p.partner.grossIncome)} per year`
      : "No partner",
    p.childrenBirthYears.length
      ? `Children born: ${p.childrenBirthYears.join(", ")}`
      : "No children",
    `Savings and assets: about ${chf(p.assets)}`,
    p.employment === "self_employed"
      ? "No pension fund (2nd pillar) since becoming self-employed"
      : p.employment === "employed"
        ? "Has a pension fund through the employer but does not know the exact figures"
        : "No own pension fund",
    p.pillar3aBalance
      ? `Pillar 3a balance: about ${chf(p.pillar3aBalance)}`
      : "No pillar 3a account yet",
  ];
  if (p.externalPolicy) {
    lines.push(
      `Holds a ${p.externalPolicy.productName} at ${p.externalPolicy.insurer}, premium ${chf(p.externalPolicy.premiumAnnual)} per year`,
    );
  }
  return lines.map((l) => `- ${l}`).join("\n");
}

export function customerInstructions(p: SimPersona, currentYear: number): string {
  const rules = [
    "Reveal facts only when asked or when it comes up naturally; never list everything at once.",
    "You do not know exact pension fund figures. If asked to upload documents, say you do not have them at hand and give rough numbers instead.",
    "When the advisor shows calculations, cards or offers, react to their content in your own words.",
    "Never write like an assistant, never use bullet lists or headings, never mention that you are simulated.",
    "When your question is answered or you have decided (go ahead with an offer, or think about it), say goodbye with action end.",
    "Be realistic: most people end such a chat after 4 to 8 of their own messages, once they have an answer, a recommendation or a clear next step.",
    p.sharesContact
      ? `If the advisor asks for contact details, give them: ${p.firstName} ${p.lastName}, ${personaEmail(p)}, +41 79 ${String(100 + (p.birthYear % 900)).padStart(3, "0")} 12 34.`
      : "If the advisor asks for contact details, politely decline for now.",
    p.wantsHuman
      ? "After a few messages, ask to talk to a real person (a callback)."
      : "You are fine talking to the digital advisor.",
    p.mode === "existing_customer"
      ? "You are already a Pax customer and logged in, so Pax knows your policies."
      : "You are new to Pax.",
  ];
  return `You role-play a private customer chatting with the digital pension advisor on the website of Pax, a Swiss life insurer. You are the customer, not an assistant. Stay in character.

## Who you are
${personaFacts(p, currentYear)}

## What is on your mind
${CONCERN_TEXT[p.concern]}

## How you write
Write only in ${LANGUAGE[p.locale]}. ${STYLE_TEXT[p.style]}

## Rules
${rules.map((r) => `- ${r}`).join("\n")}`;
}

export interface SimTurn {
  role: "customer" | "advisor";
  text: string;
}

export function conversationSoFar(turns: SimTurn[]): string {
  if (turns.length === 0) {
    return "The chat window just opened. Write your first message to the advisor.";
  }
  return [
    "Conversation so far:",
    ...turns.map((t) => `${t.role === "customer" ? "YOU" : "ADVISOR"}: ${t.text}`),
    "",
    "Write your next message (or end / drop off).",
  ].join("\n");
}

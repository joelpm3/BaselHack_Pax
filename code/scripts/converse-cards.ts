/**
 * Acts in the sales cards for the converse harness, as a customer would in the chat: completes
 * the suitability check (Angemessenheitsprüfung) and fills in the offer form and signs it, then
 * returns the message the card sends to the advisor. Uses the same server functions as the card
 * actions (src/lib/sales/actions.ts), without the cookie check.
 */
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import {
  type ContactInput,
  ownedApplication,
  saveContact,
  saveSuitability,
  signApplication,
  updateOfferDetails,
} from "@/lib/sales/application";
import type { SuitabilityAnswers } from "@/lib/sales/suitability";
import type { ToolCall } from "./converse-checks";

export interface CardCustomer {
  contact: ContactInput;
  smoker: boolean;
  suitability: SuitabilityAnswers;
}

/** A balanced investor who can afford the 3a maximum. */
export const DEFAULT_SUITABILITY: SuitabilityAnswers = {
  annualPremium: 7258,
  singlePremium: null,
  netIncome: "75k_150k",
  netAssets: "10k_50k",
  savingCapacity: "gt7k",
  oneOffCapacity: "10k_50k",
  goal: "moderate_gains",
  horizon: "gt15",
  knowledge: "knowledge_only",
  drawdown: "hold",
  guaranteedSharePercent: 0,
};

interface Output {
  status?: string;
  applicationId?: string | null;
  productName?: string;
  offer?: { productName?: string } | null;
}

/** The card the advisor just showed that the customer acts in next, if any. */
export function pendingCard(
  tools: ToolCall[],
): { kind: "suitability" | "offer"; output: Output } | null {
  for (const tool of [...tools].reverse()) {
    const output = (tool.output ?? {}) as Output;
    if (output.status !== "ok" || !output.applicationId) continue;
    if (tool.name === "startSuitabilityCheck") return { kind: "suitability", output };
    if (tool.name === "prepareOffer") return { kind: "offer", output };
  }
  return null;
}

/** Acts in the card; returns the card's message to the advisor and a note for the transcript. */
export async function actInCard(
  card: NonNullable<ReturnType<typeof pendingCard>>,
  customerId: string,
  conversationId: string,
  who: CardCustomer,
): Promise<{ message: string; note: string } | null> {
  const app = ownedApplication(conversationId, card.output.applicationId as string);
  if (!app) return null;
  if (card.kind === "suitability") {
    const record = saveSuitability(customerId, app, who.suitability, "");
    if (!record) return null;
    const { result } = record;
    const product = card.output.productName ?? app.productCode;
    return {
      message: result.suitable
        ? `Ich habe die Angemessenheitsprüfung für ${product} abgeschlossen: ${result.total} Punkte, Profil ${result.profile}, Fonds ${record.fund}.`
        : `Ich habe die Angemessenheitsprüfung für ${product} abgeschlossen: ${result.total} Punkte, Profil ${result.profile}. Laut Prüfung ist der Betrag für mich nicht tragbar.`,
      note: `[card] suitability: ${result.total} points, ${result.profile}, suitable ${result.suitable}`,
    };
  }
  const customer = db.query.customers
    .findFirst({ where: eq(schema.customers.id, customerId) })
    .sync();
  if (!customer) return null;
  saveContact(customer, conversationId, who.contact);
  const fresh = ownedApplication(conversationId, app.id) ?? app;
  const updated = await updateOfferDetails(customerId, conversationId, fresh, who.smoker);
  const signed = signApplication(
    customerId,
    conversationId,
    app.id,
    `${who.contact.firstName} ${who.contact.lastName}`,
  );
  const product = card.output.offer?.productName ?? app.productCode;
  if (!signed.ok)
    return {
      message: `Die Unterschrift für ${product} hat nicht geklappt.`,
      note: `[card] sign failed: ${signed.error}${updated?.repriced ? " (offer re-priced)" : ""}`,
    };
  return {
    message: `Ich habe die Offerte für ${product} unterschrieben (Police ${signed.signed.policyNumber}).`,
    note: `[card] contact saved${updated?.repriced ? ", offer re-priced" : ""}, signed policy ${signed.signed.policyNumber}`,
  };
}

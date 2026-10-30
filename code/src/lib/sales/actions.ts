"use server";

import { z } from "zod";
import { getOwnedConversation, patchToolOutput } from "@/lib/advisor/conversations";
import { audit } from "@/lib/audit";
import { getCurrentCustomer } from "@/lib/auth/customer";
import { publish } from "@/lib/events/bus";
import {
  type ContactInput,
  consentSchema,
  contactSchema,
  ownedApplication,
  type SignError,
  saveContact,
  saveSuitability,
  signApplication,
} from "./application";
import { declineRecommendation } from "./recommend";
import { type SuitabilityAnswers, suitabilityAnswersSchema } from "./suitability";
import type { SignedInfo, SuitabilityRecord } from "./types";

/**
 * Widget actions of the sales flow. Every action checks that the customer cookie owns the
 * conversation, validates its input with Zod and patches the persisted tool output so the
 * widget shows the new state after a reload (and the advisor sees it on the next turn).
 */

const ids = z.object({
  conversationId: z.string().min(1).max(64),
  toolCallId: z.string().min(1).max(200),
});
type Ids = z.infer<typeof ids>;

async function owner(conversationId: string) {
  const customer = await getCurrentCustomer();
  if (!customer || !getOwnedConversation(conversationId, customer.id)) return null;
  return customer;
}

export async function declineRecommendationAction(input: {
  conversationId: string;
  recommendationId: string;
}): Promise<{ ok: boolean }> {
  const parsed = z
    .object({
      conversationId: z.string().min(1).max(64),
      recommendationId: z.string().min(1).max(64),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false };
  const { conversationId, recommendationId } = parsed.data;
  const customer = await owner(conversationId);
  if (!customer) return { ok: false };
  if (!declineRecommendation(conversationId, recommendationId)) return { ok: false };
  audit({
    actorType: "customer",
    actorId: customer.id,
    action: "recommendation.declined",
    entityType: "recommendation",
    entityId: recommendationId,
    data: { conversationId },
  });
  publish({ type: "conversation.updated", conversationId });
  return { ok: true };
}

export async function submitSuitabilityAction(
  input: Ids & { applicationId: string; answers: SuitabilityAnswers; fund: string },
): Promise<{ ok: true; record: SuitabilityRecord } | { ok: false }> {
  const parsed = ids
    .extend({
      applicationId: z.string().min(1).max(64),
      answers: suitabilityAnswersSchema,
      fund: z.string().max(200),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false };
  const { conversationId, toolCallId, applicationId, answers, fund } = parsed.data;
  const customer = await owner(conversationId);
  const app = customer ? ownedApplication(conversationId, applicationId) : undefined;
  if (!customer || !app) return { ok: false };
  const record = saveSuitability(customer.id, app, answers, fund);
  if (!record) return { ok: false };
  patchToolOutput(conversationId, toolCallId, { record });
  publish({ type: "conversation.updated", conversationId });
  return { ok: true, record };
}

export async function saveContactAction(
  input: Ids & { contact: ContactInput },
): Promise<{ ok: true } | { ok: false; error: "invalid" | "not_found" }> {
  const parsed = ids.extend({ contact: contactSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { conversationId, toolCallId, contact } = parsed.data;
  const customer = await owner(conversationId);
  if (!customer) return { ok: false, error: "not_found" };
  saveContact(customer, conversationId, contact);
  patchToolOutput(conversationId, toolCallId, { contactSaved: true, contact });
  return { ok: true };
}

export async function signApplicationAction(
  input: Ids & {
    applicationId: string;
    signatureName: string;
    consents: { offerRead: boolean; dataCorrect: boolean; demoUnderstood: boolean };
  },
): Promise<{ ok: true; signed: SignedInfo } | { ok: false; error: SignError | "invalid" }> {
  const parsed = ids
    .extend({
      applicationId: z.string().min(1).max(64),
      signatureName: z.string().trim().min(3).max(170),
      consents: consentSchema,
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { conversationId, toolCallId, applicationId, signatureName } = parsed.data;
  const customer = await owner(conversationId);
  if (!customer) return { ok: false, error: "not_found" };
  const result = signApplication(customer.id, conversationId, applicationId, signatureName);
  if (result.ok) patchToolOutput(conversationId, toolCallId, { signed: result.signed });
  return result;
}

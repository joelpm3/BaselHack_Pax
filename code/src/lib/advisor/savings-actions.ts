"use server";

import { z } from "zod";
import { getCurrentCustomer } from "@/lib/auth/customer";
import { getOwnedConversation, patchToolOutput } from "./conversations";
import { runSaving } from "./logismata/checks";
import { normalizeSavingsParams, type SavingsPlanOutput } from "./savings-plan";

const recalculateSchema = z.object({
  conversationId: z.string().min(1).max(64),
  toolCallId: z.string().min(1).max(200),
  params: z.object({
    goal: z.number().finite(),
    years: z.number().finite(),
    startCapital: z.number().finite(),
  }),
});

/**
 * The savings-plan widget's sliders: recalculates with Logismata (logged like the tool call) and
 * stores the new result in the tool output, so a reload and the advisor see the same plan.
 */
export async function recalculateSavingsPlan(
  input: z.infer<typeof recalculateSchema>,
): Promise<SavingsPlanOutput | null> {
  const parsed = recalculateSchema.safeParse(input);
  if (!parsed.success) return null;
  const { conversationId, toolCallId, params } = parsed.data;
  const customer = await getCurrentCustomer();
  if (!customer || !getOwnedConversation(conversationId, customer.id)) return null;
  const result = await runSaving(normalizeSavingsParams(params), {
    customerId: customer.id,
    conversationId,
    toolCallId,
  }).catch(() => null);
  if (result) patchToolOutput(conversationId, toolCallId, { ...result });
  return result;
}

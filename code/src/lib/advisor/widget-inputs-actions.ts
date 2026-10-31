"use server";

import { z } from "zod";
import { getCurrentCustomer } from "@/lib/auth/customer";
import { getOwnedConversation } from "./conversations";
import { clampCompound } from "./explainers/compound-interest";
import { recordWidgetInputs } from "./widget-inputs-store";

const compoundSchema = z.object({
  conversationId: z.string().min(1).max(64),
  toolCallId: z.string().min(1).max(200),
  values: z.object({
    startAmount: z.number().finite(),
    monthlySaving: z.number().finite(),
    ratePercent: z.number().finite(),
    years: z.number().finite(),
  }),
});

/**
 * The compound-interest widget's sliders (calculated in the browser): keeps the latest values in
 * the tool output, so a reload shows them and the advisor hears about them in the next turn.
 * Returns false when the widget's message is not stored yet (the turn is still running).
 */
export async function saveCompoundInputs(input: z.infer<typeof compoundSchema>): Promise<boolean> {
  const parsed = compoundSchema.safeParse(input);
  if (!parsed.success) return false;
  const { conversationId, toolCallId, values } = parsed.data;
  const customer = await getCurrentCustomer();
  if (!customer || !getOwnedConversation(conversationId, customer.id)) return false;
  return recordWidgetInputs(conversationId, toolCallId, "explainCompoundInterest", {
    ...clampCompound(values),
  });
}

"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createConversation,
  getOwnedConversation,
  patchToolOutput,
} from "@/lib/advisor/conversations";
import { resolveResidence } from "@/lib/advisor/location";
import { buildVorsorgebild } from "@/lib/advisor/picture";
import { EDITABLE_FIELDS } from "@/lib/advisor/profile-fields";
import { computeScenario } from "@/lib/advisor/scenarios";
import { scenarioInput } from "@/lib/advisor/tools/scenario";
import type { ResidencePlace, ScenarioOutput, VorsorgebildModel } from "@/lib/advisor/types";
import { audit } from "@/lib/audit";
import { getCurrentCustomer, getOrCreateCustomer, setCustomerCookie } from "@/lib/auth/customer";
import { db, schema } from "@/lib/db";
import { emptyLifeSituation, profileCompleteness } from "@/lib/domain/profile";
import { CONTACT_CHANNELS, LOCALES, type Locale } from "@/lib/domain/taxonomy";
import { publish } from "@/lib/events/bus";
import { applyProfileChanges, getProfile } from "@/lib/profile/service";

const localeSchema = z.enum(LOCALES);

function localeFrom(formData: FormData): Locale {
  return localeSchema.catch("de").parse(formData.get("locale"));
}

async function requireConversation(conversationId: string) {
  const customer = await getCurrentCustomer();
  const conversation = customer ? getOwnedConversation(conversationId, customer.id) : null;
  if (!customer || !conversation) throw new Error("Conversation not found");
  return { customer, conversation };
}

/** "Beratung starten" (and the "Unterlagen zur Hand" link): always as a new, own customer. */
export async function startConversation(formData: FormData) {
  const locale = localeFrom(formData);
  const variant = formData.get("variant") === "upload" ? "upload" : "default";
  const current = await getCurrentCustomer();
  // Coming from the demo picker: leave the demo customer and start as a new visitor.
  const customer = current?.isDemo
    ? await createAnonymousCustomer(locale)
    : await getOrCreateCustomer(locale);
  const conversation = await createConversation({
    customerId: customer.id,
    locale,
    mode: customer.lifecycle === "client" ? "existing_customer" : "new_business",
    variant,
  });
  redirect(`/${locale}/chat/${conversation.id}`);
}

async function createAnonymousCustomer(locale: Locale) {
  const [customer] = db.insert(schema.customers).values({ locale }).returning().all();
  db.insert(schema.profiles).values({ customerId: customer.id, data: emptyLifeSituation() }).run();
  await setCustomerCookie(customer.id);
  return customer;
}

/** "Ich bin bereits Pax-Kunde": switch the device to a seeded demo customer. */
export async function startAsDemoCustomer(formData: FormData) {
  const locale = localeFrom(formData);
  const customerId = z.string().min(1).parse(formData.get("customerId"));
  const customer = db.query.customers
    .findFirst({
      where: and(eq(schema.customers.id, customerId), eq(schema.customers.isDemo, true)),
    })
    .sync();
  if (!customer) throw new Error("Demo customer not found");
  await setCustomerCookie(customer.id);
  audit({
    actorType: "customer",
    actorId: customer.id,
    action: "demo.customer_selected",
    entityType: "customer",
    entityId: customer.id,
  });
  const conversation = await createConversation({
    customerId: customer.id,
    locale,
    mode: "existing_customer",
  });
  redirect(`/${locale}/chat/${conversation.id}`);
}

/** "Neues Gespräch" in the chat header: same customer, fresh conversation. */
export async function startNewConversation(formData: FormData) {
  const locale = localeFrom(formData);
  const customer = await getOrCreateCustomer(locale);
  const conversation = await createConversation({
    customerId: customer.id,
    locale,
    mode: customer.lifecycle === "client" || customer.isDemo ? "existing_customer" : "new_business",
  });
  redirect(`/${locale}/chat/${conversation.id}`);
}

// ─── Widget actions ─────────────────────────────────────────────────────────

const fieldChangeSchema = z.object({
  path: z.string().refine((path) => path in EDITABLE_FIELDS, "not editable"),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});

export type SaveProfileResult =
  | { ok: true; picture: VorsorgebildModel; completeness: number }
  | { ok: false; error: "invalid" };

/** Inline corrections in the "Ihre Situation" card (source: form). */
export async function saveProfileFields(input: {
  conversationId: string;
  changes: Array<{ path: string; value: string | number | boolean | null }>;
}): Promise<SaveProfileResult> {
  const { customer, conversation } = await requireConversation(input.conversationId);
  const parsed = z.array(fieldChangeSchema).min(1).max(20).safeParse(input.changes);
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    const profile = applyProfileChanges(customer.id, parsed.data, {
      source: "form",
      conversationId: conversation.id,
    });
    return {
      ok: true,
      picture: buildVorsorgebild(customer.id),
      completeness: profileCompleteness(profile),
    };
  } catch {
    return { ok: false, error: "invalid" };
  }
}

const callbackSchema = z.object({
  conversationId: z.string(),
  toolCallId: z.string(),
  handoverId: z.string(),
  channel: z.enum(CONTACT_CHANNELS),
  preferredTime: z.string().min(1).max(120),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{6,20}$/)
    .optional(),
});

export async function bookCallback(
  input: z.infer<typeof callbackSchema>,
): Promise<{ ok: boolean }> {
  const data = callbackSchema.parse(input);
  const { customer, conversation } = await requireConversation(data.conversationId);
  const handover = db
    .select()
    .from(schema.handovers)
    .where(
      and(
        eq(schema.handovers.id, data.handoverId),
        eq(schema.handovers.conversationId, conversation.id),
      ),
    )
    .get();
  if (!handover) return { ok: false };
  if ((data.channel === "phone" || data.channel === "video") && !data.phone && !customer.phone)
    return { ok: false };
  db.update(schema.handovers)
    .set({ preferredChannel: data.channel, preferredTime: data.preferredTime })
    .where(eq(schema.handovers.id, handover.id))
    .run();
  if (data.phone) {
    db.update(schema.customers)
      .set({
        phone: data.phone,
        lifecycle: customer.lifecycle === "anonymous" ? "prospect" : customer.lifecycle,
      })
      .where(eq(schema.customers.id, customer.id))
      .run();
  }
  patchToolOutput(conversation.id, data.toolCallId, {
    booked: { channel: data.channel, preferredTime: data.preferredTime },
    phone: data.phone ?? customer.phone,
  });
  publish({ type: "conversation.updated", conversationId: conversation.id });
  return { ok: true };
}

const feedbackSchema = z.object({
  conversationId: z.string(),
  toolCallId: z.string(),
  nps: z.number().int().min(0).max(10),
  comment: z.string().trim().max(1000).optional(),
});

export async function submitFeedback(
  input: z.infer<typeof feedbackSchema>,
): Promise<{ ok: boolean }> {
  const data = feedbackSchema.parse(input);
  const { customer, conversation } = await requireConversation(data.conversationId);
  const comment = data.comment || null;
  db.insert(schema.feedback)
    .values({ conversationId: conversation.id, customerId: customer.id, nps: data.nps, comment })
    .run();
  if (conversation.status === "active") {
    db.update(schema.conversations)
      .set({ status: "completed" })
      .where(eq(schema.conversations.id, conversation.id))
      .run();
  }
  patchToolOutput(conversation.id, data.toolCallId, { submitted: { nps: data.nps, comment } });
  publish({ type: "conversation.updated", conversationId: conversation.id });
  return { ok: true };
}

/** Re-runs a scenario with the customer's own values (logged as a scenario calculation). */
export async function recalculateScenario(input: {
  conversationId: string;
  toolCallId: string;
  scenario: z.infer<typeof scenarioInput>["scenario"];
  params: z.infer<typeof scenarioInput>["params"];
}): Promise<ScenarioOutput> {
  const { customer, conversation } = await requireConversation(input.conversationId);
  const parsed = scenarioInput.parse({ scenario: input.scenario, params: input.params });
  const result = await computeScenario(
    parsed.scenario,
    parsed.params ?? {},
    getProfile(customer.id),
    { customerId: customer.id, conversationId: conversation.id, toolCallId: input.toolCallId },
  );
  if (result.status === "ok") patchToolOutput(conversation.id, input.toolCallId, { ...result });
  return result;
}

const pickResidenceSchema = z.object({
  conversationId: z.string(),
  toolCallId: z.string().min(1).max(100),
  zip: z
    .string()
    .regex(/^\d{4}$/)
    .nullable(),
  town: z.string().min(1).max(100),
});

export type PickResidenceResult =
  | { ok: true; location: ResidencePlace; picture: VorsorgebildModel }
  | { ok: false };

/**
 * The customer picked their town in the "Welcher Ort?" card (postcode 8165 covers three).
 * Checked against the official locality directory and stored as chosen; no model decides it.
 */
export async function pickResidence(
  input: z.infer<typeof pickResidenceSchema>,
): Promise<PickResidenceResult> {
  const data = pickResidenceSchema.parse(input);
  const { customer, conversation } = await requireConversation(data.conversationId);
  const result = await resolveResidence(
    { zip: data.zip ?? undefined, city: data.town },
    getProfile(customer.id).residence,
    conversation.locale,
    { customerId: customer.id, conversationId: conversation.id, toolCallId: data.toolCallId },
  );
  if (result.status !== "resolved" || result.location.city !== data.town) return { ok: false };
  applyProfileChanges(customer.id, result.changes, {
    source: "form",
    conversationId: conversation.id,
  });
  patchToolOutput(conversation.id, data.toolCallId, { location: result.location });
  return { ok: true, location: result.location, picture: buildVorsorgebild(customer.id) };
}

"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createConversation } from "@/lib/advisor/conversations";
import { getCurrentCustomer } from "@/lib/auth/customer";
import { db, schema } from "@/lib/db";
import { deleteDocument } from "@/lib/documents/service";
import { LOCALES } from "@/lib/domain/taxonomy";
import { setHintStatus } from "@/lib/hints/service";

/** Cockpit mutations. Each one checks ownership through the device cookie. */

export async function deletePortalDocumentAction(documentId: string): Promise<{ ok: boolean }> {
  const customer = await getCurrentCustomer();
  if (!customer || !z.uuid().safeParse(documentId).success) return { ok: false };
  const ok = await deleteDocument(customer.id, documentId, "deleted");
  refresh();
  return { ok };
}

const hintForm = z.object({
  hintId: z.uuid(),
  locale: z.enum(LOCALES).catch("de"),
});

export async function dismissHintAction(formData: FormData): Promise<void> {
  const customer = await getCurrentCustomer();
  const parsed = hintForm.safeParse(Object.fromEntries(formData));
  if (!customer || !parsed.success) return;
  setHintStatus(customer.id, parsed.data.hintId, "dismissed");
  refresh();
}

export async function restoreHintAction(formData: FormData): Promise<void> {
  const customer = await getCurrentCustomer();
  const parsed = hintForm.safeParse(Object.fromEntries(formData));
  if (!customer || !parsed.success) return;
  setHintStatus(customer.id, parsed.data.hintId, "seen");
  refresh();
}

/** "Mit dem Berater besprechen": opens a new advisor conversation about the hint. */
export async function discussHintAction(formData: FormData): Promise<void> {
  const customer = await getCurrentCustomer();
  const parsed = hintForm.safeParse(Object.fromEntries(formData));
  if (!customer || !parsed.success) return;
  const { hintId, locale } = parsed.data;
  const hint = db
    .select({ id: schema.hints.id })
    .from(schema.hints)
    .where(and(eq(schema.hints.id, hintId), eq(schema.hints.customerId, customer.id)))
    .get();
  if (!hint) return;
  setHintStatus(customer.id, hint.id, "acted");
  const conversation = await createConversation({
    customerId: customer.id,
    locale,
    mode: customer.lifecycle === "client" || customer.isDemo ? "existing_customer" : "new_business",
  });
  redirect(`/${locale}/chat/${conversation.id}?hint=${hint.id}`);
}

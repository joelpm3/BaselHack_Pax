"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { advisorOrThrow } from "@/lib/firma/auth";
import { getBusinessToday, isoDateSchema, setSimulatedToday } from "@/lib/followups/clock";
import { type RunSummary, resetFollowUps, runFollowUps } from "@/lib/followups/engine";
import { dismissFutureEvent, markEmailReplied } from "@/lib/followups/mutations";
import { setYearlyCheckin } from "@/lib/followups/preferences";

/** Wiedervorlagen: time travel, engine runs and advisor actions. Every action checks the advisor. */

const id = z.uuid();

export type TravelResult = { ok: true; today: string; summary: RunSummary } | { ok: false };

/** Sets the demo date (`null` = back to today) and lets the engine catch up to it. */
export async function travelTo(date: string | null): Promise<TravelResult> {
  await advisorOrThrow();
  const parsed = date === null ? null : isoDateSchema.safeParse(date);
  if (parsed && !parsed.success) return { ok: false };
  await setSimulatedToday(parsed ? parsed.data : null);
  const { today } = await getBusinessToday();
  const summary = await runFollowUps({ today });
  refresh();
  return { ok: true, today, summary };
}

/** Runs the engine for the current (possibly simulated) date. */
export async function runFollowUpsNow(): Promise<TravelResult> {
  await advisorOrThrow();
  const { today } = await getBusinessToday();
  const summary = await runFollowUps({ today });
  refresh();
  return { ok: true, today, summary };
}

/** Demo: records that the customer answered this email; the engine reopens or closes the lead. */
export async function recordReply(emailId: string): Promise<void> {
  const advisor = await advisorOrThrow();
  const customerId = markEmailReplied(id.parse(emailId), advisor.id);
  if (customerId) {
    const { today } = await getBusinessToday();
    await runFollowUps({ today, customerId });
  }
  refresh();
}

export async function dismissEvent(eventId: string): Promise<void> {
  const advisor = await advisorOrThrow();
  dismissFutureEvent(id.parse(eventId), advisor.id);
  refresh();
}

export async function setCustomerCheckin(customerId: string, enabled: boolean): Promise<void> {
  const advisor = await advisorOrThrow();
  setYearlyCheckin(id.parse(customerId), z.boolean().parse(enabled), {
    type: "advisor",
    id: advisor.id,
  });
  refresh();
}

/** Demo: removes generated follow-up leads and emails so the pitch can start over. */
export async function resetFollowUpDemo(): Promise<void> {
  await advisorOrThrow();
  resetFollowUps();
  await setSimulatedToday(null);
  refresh();
}

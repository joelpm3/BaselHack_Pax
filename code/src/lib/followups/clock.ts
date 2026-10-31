import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";
import { toIsoDate } from "@/lib/documents/dates";

/**
 * Demo "time travel": the company dashboard can pretend today is another day so future events
 * become due during a pitch. Stored per browser in a cookie; the real date is used everywhere else.
 */
const COOKIE = "pax_firma_today";

export const isoDateSchema = z.iso.date();

export async function getSimulatedToday(): Promise<string | null> {
  const value = (await cookies()).get(COOKIE)?.value;
  return isoDateSchema.safeParse(value).success ? (value as string) : null;
}

/** The business date the dashboard works with: the simulated one, else the real today. */
export async function getBusinessToday(): Promise<{ today: string; simulated: boolean }> {
  const simulated = await getSimulatedToday();
  return simulated
    ? { today: simulated, simulated: true }
    : { today: toIsoDate(new Date()), simulated: false };
}

/** Server actions only. `null` returns to the real date. */
export async function setSimulatedToday(date: string | null): Promise<void> {
  const store = await cookies();
  if (date === null) {
    store.delete(COOKIE);
    return;
  }
  store.set(COOKIE, isoDateSchema.parse(date), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

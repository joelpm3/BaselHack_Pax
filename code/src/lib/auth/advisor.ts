import "server-only";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db, schema } from "@/lib/db";
import { sign, unsign } from "./signing";

/**
 * Company dashboard access: shared password (COMPANY_PASSWORD) + choosing one of the seeded
 * advisors, so notes and status changes have an author. Not real auth; see documentation.
 */
const COOKIE = "pax_advisor";
const TWELVE_HOURS = 60 * 60 * 12;

export type Advisor = typeof schema.advisors.$inferSelect;

export async function getCurrentAdvisor(): Promise<Advisor | null> {
  const id = unsign((await cookies()).get(COOKIE)?.value);
  if (!id) return null;
  return (await db.query.advisors.findFirst({ where: eq(schema.advisors.id, id) })) ?? null;
}

export async function setAdvisorCookie(advisorId: string): Promise<void> {
  (await cookies()).set(COOKIE, sign(advisorId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TWELVE_HOURS,
  });
}

export async function clearAdvisorCookie(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

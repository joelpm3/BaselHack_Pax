import "server-only";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db, schema } from "@/lib/db";
import { emptyLifeSituation } from "@/lib/domain/profile";
import type { Locale } from "@/lib/domain/taxonomy";
import { sign, unsign } from "./signing";

/**
 * Customers are identified by a signed device cookie: no login for new customers.
 * The demo "Ich bin bereits Pax-Kunde" picker simply switches the cookie to a seeded customer.
 */
const COOKIE = "pax_customer";
const ONE_YEAR = 60 * 60 * 24 * 365;

export type Customer = typeof schema.customers.$inferSelect;

export async function getCurrentCustomer(): Promise<Customer | null> {
  const id = unsign((await cookies()).get(COOKIE)?.value);
  if (!id) return null;
  return (await db.query.customers.findFirst({ where: eq(schema.customers.id, id) })) ?? null;
}

/** Route handlers / server actions only (sets a cookie). */
export async function getOrCreateCustomer(locale: Locale): Promise<Customer> {
  const existing = await getCurrentCustomer();
  if (existing) return existing;
  const [customer] = db.insert(schema.customers).values({ locale }).returning().all();
  db.insert(schema.profiles).values({ customerId: customer.id, data: emptyLifeSituation() }).run();
  await setCustomerCookie(customer.id);
  return customer;
}

export async function setCustomerCookie(customerId: string): Promise<void> {
  (await cookies()).set(COOKIE, sign(customerId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR,
  });
}

export async function clearCustomerCookie(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

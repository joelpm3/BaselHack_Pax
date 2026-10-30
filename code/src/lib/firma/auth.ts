import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { getLocale } from "next-intl/server";
import { cache } from "react";
import { env } from "@/env";
import { redirect } from "@/i18n/navigation";
import { type Advisor, getCurrentAdvisor } from "@/lib/auth/advisor";

/** Dashboard pages: the signed-in advisor, or a redirect to the login screen. */
export const requireAdvisor = cache(async (): Promise<Advisor> => {
  const advisor = await getCurrentAdvisor();
  if (advisor) return advisor;
  return redirect({ href: "/firma/login", locale: await getLocale() });
});

export class UnauthorizedError extends Error {
  constructor() {
    super("Not signed in to the company dashboard");
  }
}

/** Server actions and route handlers: never trust the page that rendered the form. */
export async function advisorOrThrow(): Promise<Advisor> {
  const advisor = await getCurrentAdvisor();
  if (!advisor) throw new UnauthorizedError();
  return advisor;
}

const digest = (value: string) => createHash("sha256").update(value).digest();

export function isCompanyPassword(input: string): boolean {
  return timingSafeEqual(digest(input), digest(env.COMPANY_PASSWORD));
}

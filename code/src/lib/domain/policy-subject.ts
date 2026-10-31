import type { LifeSituation } from "./profile";

/** The customer or the partner: the two adults whose cover the advisor and the cockpit analyse. */
export type PolicySubject = "self" | "partner";

const fold = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * Whose policy it is. A confirmed pension certificate stores the customer's answer in
 * `details.subject`; otherwise the insured person's name decides. Unnamed policies belong to
 * the customer.
 */
export function subjectOfPolicy(
  policy: { insuredPerson: string | null; details?: Record<string, unknown> | null },
  profile: LifeSituation,
): PolicySubject | "other" {
  const stored = policy.details?.subject;
  if (stored === "self" || stored === "partner") return stored;
  if (!policy.insuredPerson) return "self";
  const insured = fold(policy.insuredPerson);
  const partnerName = profile.partner?.firstName;
  const selfName = profile.person.firstName;
  if (partnerName && insured.includes(fold(partnerName))) return "partner";
  if (selfName && insured.includes(fold(selfName))) return "self";
  return selfName ? "other" : "self";
}

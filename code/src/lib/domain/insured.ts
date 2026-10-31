import type { LifeSituation } from "./profile";

/** The customer or the partner: the two adults whose cover the advisor and the cockpit analyse. */
export type InsuredSubject = "self" | "partner";

const fold = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Whose policy it is, by the insured person's name. Unnamed policies belong to the customer. */
export function subjectOfPolicy(
  policy: { insuredPerson: string | null },
  profile: LifeSituation,
): InsuredSubject | "other" {
  if (!policy.insuredPerson) return "self";
  const insured = fold(policy.insuredPerson);
  const partnerName = profile.partner?.firstName;
  const selfName = profile.person.firstName;
  if (partnerName && insured.includes(fold(partnerName))) return "partner";
  if (selfName && insured.includes(fold(selfName))) return "self";
  return selfName ? "other" : "self";
}

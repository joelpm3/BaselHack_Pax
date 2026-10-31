import { z } from "zod";
import type { LifeSituation } from "@/lib/domain/profile";
import type { Locale } from "@/lib/domain/taxonomy";

/** A death or disability policy the customer told the advisor about (tool input). */
export const statedPolicySchema = z.object({
  insurer: z.string().min(1).max(60).describe("Insurer as the customer named it, e.g. AXA, Pax"),
  type: z
    .enum(["death", "disability"])
    .describe(
      "death: term life / death capital (Todesfallversicherung); disability: disability income (Erwerbsunfähigkeitsrente)",
    ),
  insured: z.enum(["self", "partner"]).describe("Whose life or income is insured"),
  sumInsured: z.number().min(0).optional().describe("Death capital, CHF (only when stated)"),
  annuityAnnual: z
    .number()
    .min(0)
    .optional()
    .describe("Disability (or death) pension, CHF PER YEAR (only when stated)"),
  premiumAnnual: z.number().min(0).optional().describe("Premium, CHF per year"),
  endYear: z.number().int().min(2000).max(2100).optional(),
});
export type StatedPolicy = z.infer<typeof statedPolicySchema>;

const NAMES: Record<StatedPolicy["type"], Record<Locale, string>> = {
  death: {
    de: "Todesfallversicherung",
    fr: "Assurance en cas de décès",
    it: "Assicurazione in caso di decesso",
    en: "Term life insurance",
  },
  disability: {
    de: "Erwerbsunfähigkeitsversicherung",
    fr: "Assurance incapacité de gain",
    it: "Assicurazione incapacità di guadagno",
    en: "Disability income insurance",
  },
};

const chf = (amount: number) =>
  `CHF ${Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, "'")}`;

/** The policies row for a stated policy, plus a one-line summary for the "Notiert" card. */
export function statedPolicyRow(policy: StatedPolicy, profile: LifeSituation, locale: Locale) {
  const insurer = policy.insurer.trim();
  const isPax = /^pax\b/i.test(insurer);
  const productName = NAMES[policy.type][locale];
  const person = policy.insured === "self" ? profile.person : profile.partner;
  const amount =
    policy.type === "death" && policy.sumInsured !== undefined
      ? chf(policy.sumInsured)
      : policy.annuityAnnual !== undefined
        ? `${chf(policy.annuityAnnual)} / ${locale === "de" ? "Jahr" : locale === "fr" ? "an" : locale === "it" ? "anno" : "year"}`
        : null;
  return {
    insurer: isPax ? "Pax" : insurer,
    isExternal: !isPax,
    category: policy.type === "death" ? ("risk_death" as const) : ("risk_disability" as const),
    productName,
    status: "active" as const,
    sumInsured: policy.sumInsured ?? null,
    annuityAnnual: policy.annuityAnnual ?? null,
    premiumAnnual: policy.premiumAnnual ?? null,
    endDate: policy.endYear ? `${policy.endYear}-12-31` : null,
    insuredPerson: person?.firstName ?? null,
    details: { subject: policy.insured, statedInChat: true },
    source: "chat" as const,
    summary: [`${isPax ? "Pax" : insurer}: ${productName}`, amount].filter(Boolean).join(", "),
  };
}

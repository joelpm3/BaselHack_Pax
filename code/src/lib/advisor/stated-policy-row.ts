import { z } from "zod";
import type { LifeSituation } from "@/lib/domain/profile";
import type { Locale, PolicyCategory } from "@/lib/domain/taxonomy";
import { INSURANCE_3A } from "./pillar3a";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "yyyy-mm-dd");

/** A policy the customer told the advisor about (tool input). */
export const statedPolicySchema = z.object({
  insurer: z
    .string()
    .max(60)
    .optional()
    .describe("Insurer as the customer named it, e.g. AXA, Pax; leave out when they don't know"),
  type: z
    .enum(["death", "disability", "pillar3a"])
    .describe(
      "death: term life / death capital (Todesfallversicherung); disability: disability income " +
        "(Erwerbsunfähigkeitsrente); pillar3a: an insurance-based 3a (3a-Lebensversicherung, " +
        "premium partly saved, partly death/disability cover)",
    ),
  insured: z.enum(["self", "partner"]).describe("Whose life or income is insured"),
  sumInsured: z.number().min(0).optional().describe("Death capital, CHF (only when stated)"),
  annuityAnnual: z
    .number()
    .min(0)
    .optional()
    .describe("Disability (or death) pension, CHF PER YEAR (only when stated)"),
  premiumAnnual: z.number().min(0).optional().describe("Premium, CHF per year"),
  savingsSharePercent: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe("pillar3a: share of the premium that is saved, percent (only when stated)"),
  mostlyRisk: z
    .boolean()
    .optional()
    .describe(
      "pillar3a: the customer says the premium goes mostly into risk cover, little is saved",
    ),
  endYear: z.number().int().min(2000).max(2100).optional(),
  endDate: isoDate
    .optional()
    .describe(
      "Last day of cover, e.g. 2026-12-31 for 'gekündigt auf Ende Jahr'; overrides endYear",
    ),
  cancelled: z
    .boolean()
    .optional()
    .describe("The customer has given notice: the policy ends on endDate"),
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
  pillar3a: {
    de: "3a-Lebensversicherung",
    fr: "Assurance vie 3a",
    it: "Assicurazione vita 3a",
    en: "Pillar 3a life insurance",
  },
};

const UNKNOWN_INSURER: Record<Locale, string> = {
  de: "Versicherer unbekannt",
  fr: "Assureur inconnu",
  it: "Assicuratore sconosciuto",
  en: "Insurer unknown",
};

const CANCELLED: Record<Locale, (date: string) => string> = {
  de: (d) => `gekündigt per ${d}`,
  fr: (d) => `résiliée au ${d}`,
  it: (d) => `disdetta al ${d}`,
  en: (d) => `cancelled as of ${d}`,
};
const ENDS: Record<Locale, (date: string) => string> = {
  de: (d) => `läuft bis ${d}`,
  fr: (d) => `court jusqu'au ${d}`,
  it: (d) => `valida fino al ${d}`,
  en: (d) => `runs until ${d}`,
};

/** "gekündigt per 31.12.2026" / "läuft bis 31.12.2026" for the "Notiert" card. */
export function endNote(locale: Locale, endDate: string, cancelled: boolean | undefined): string {
  return (cancelled ? CANCELLED : ENDS)[locale](swissDate(endDate));
}

const CATEGORY: Record<StatedPolicy["type"], PolicyCategory> = {
  death: "risk_death",
  disability: "risk_disability",
  pillar3a: "pillar3a",
};

/** "unbekannt", "weiss nicht", "?" and the like: the customer does not know the insurer. */
export function isUnknownInsurer(insurer: string | undefined): boolean {
  const text = (insurer ?? "").trim().toLowerCase();
  return (
    text === "" ||
    /^(\?+|-|unbekannt|unknown|inconnu|sconosciuto|weiss nicht|weiß nicht|keine ahnung|n\/a)$/.test(
      text,
    ) ||
    Object.values(UNKNOWN_INSURER).some((label) => label.toLowerCase() === text)
  );
}

const swissDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
};

const chf = (amount: number) =>
  `CHF ${Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, "'")}`;

/** The policies row for a stated policy, plus a one-line summary for the "Notiert" card. */
export function statedPolicyRow(policy: StatedPolicy, profile: LifeSituation, locale: Locale) {
  const unknown = isUnknownInsurer(policy.insurer);
  const named = unknown ? UNKNOWN_INSURER[locale] : (policy.insurer ?? "").trim();
  const isPax = !unknown && /^pax\b/i.test(named);
  const insurer = isPax ? "Pax" : named;
  const productName = NAMES[policy.type][locale];
  const person = policy.insured === "self" ? profile.person : profile.partner;
  const perYear =
    locale === "de" ? "Jahr" : locale === "fr" ? "an" : locale === "it" ? "anno" : "year";
  const amount =
    policy.type === "pillar3a" && policy.premiumAnnual !== undefined
      ? `${chf(policy.premiumAnnual)} / ${perYear}`
      : policy.type === "death" && policy.sumInsured !== undefined
        ? chf(policy.sumInsured)
        : policy.annuityAnnual !== undefined
          ? `${chf(policy.annuityAnnual)} / ${perYear}`
          : null;
  const endDate = policy.endDate ?? (policy.endYear ? `${policy.endYear}-12-31` : null);
  const details: Record<string, unknown> = { subject: policy.insured, statedInChat: true };
  if (unknown) details.insurerUnknown = true;
  if (policy.cancelled) details.cancelled = true;
  if (policy.type === "pillar3a") {
    details.kind = INSURANCE_3A;
    if (policy.savingsSharePercent !== undefined)
      details.savingsSharePercent = policy.savingsSharePercent;
    if (policy.mostlyRisk) details.mostlyRisk = true;
  }
  return {
    insurer,
    isExternal: !isPax,
    category: CATEGORY[policy.type],
    pillar: policy.type === "pillar3a" ? ("3a" as const) : null,
    productName,
    status: "active" as const,
    sumInsured: policy.sumInsured ?? null,
    annuityAnnual: policy.annuityAnnual ?? null,
    premiumAnnual: policy.premiumAnnual ?? null,
    endDate,
    insuredPerson: person?.firstName ?? null,
    details,
    source: "chat" as const,
    summary: [
      `${insurer}: ${productName}`,
      amount,
      policy.cancelled && endDate ? endNote(locale, endDate, true) : null,
    ]
      .filter(Boolean)
      .join(", "),
  };
}

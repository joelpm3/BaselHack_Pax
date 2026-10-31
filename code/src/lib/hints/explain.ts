import "server-only";
import { generateText, Output } from "ai";
import { type AbstractIntlMessages, createTranslator } from "next-intl";
import { z } from "zod";
import { getModel, modelName } from "@/lib/ai/models";
import { formatSwissDate } from "@/lib/documents/dates";
import type { Locale } from "@/lib/domain/taxonomy";
import { formatChf } from "@/lib/utils";
import deMessages from "../../../messages/de/portal.json";
import enMessages from "../../../messages/en/portal.json";
import frMessages from "../../../messages/fr/portal.json";
import itMessages from "../../../messages/it/portal.json";
import type { DetectedHint } from "./rules";

/**
 * The model only phrases a detected hint for the customer; it never decides whether a hint
 * exists. If it fails or answers out of bounds, a translated template is used instead.
 */

const MESSAGES: Record<Locale, AbstractIntlMessages> = {
  de: deMessages,
  fr: frMessages,
  it: itMessages,
  en: enMessages,
};

const LANGUAGE: Record<Locale, string> = {
  de: "Swiss German standard writing (Hochdeutsch, 'ss' instead of 'ß'), formal 'Sie'",
  fr: "French as written in Switzerland, formal 'vous'",
  it: "Italian as written in Switzerland, formal 'Lei'",
  en: "English, plain and friendly",
};

const PAX_OPTION: Partial<Record<string, string>> = {
  todesfall: "Pax Todesfallversicherung (term life)",
  erwerbsunfaehigkeit: "Pax Erwerbsunfähigkeitsversicherung (disability income)",
  death: "Pax Todesfallversicherung (term life)",
  disability: "Pax Erwerbsunfähigkeitsversicherung (disability income)",
  pillar3a: "a Pax 3a solution such as Pax 3a or Pax LifeStar",
};

function guideFor(hint: DetectedHint): string {
  const d = hint.data;
  switch (hint.type) {
    case "cheaper_equivalent":
      return "An external contract costs clearly more than equivalent cover (same sum, same end age) at the Pax tariff. Say what they pay today and what the same cover would cost (indicative, non-binding). Switching needs a new health declaration: they should only cancel the old contract once the new cover is confirmed. Mention the notice deadline if given.";
    case "coverage_mismatch":
      if (d.source === "calculation")
        return d.risk === "death"
          ? "The Logismata risk check (the same figures as the customer's Vorsorgebild and risk card) shows that if this person died of illness, the family would lack monthlyGap CHF per month to reach the survivors' need (70% of income), after AHV and pension-fund survivors' pensions and the existing policies. Quote the monthly gap. The gap is already calculated: never say it still has to be calculated."
          : "The Logismata risk check (the same figures as the customer's Vorsorgebild and risk card) shows that if this person could no longer work because of illness, monthlyGap CHF per month would be missing to reach 80% of today's income, after IV pensions incl. child pensions, the pension fund and existing policies. Quote the monthly gap. The gap is already calculated: never say it still has to be calculated.";
      if (d.risk === "death")
        return "Rough check by rule of thumb, no calculation yet: the lump sums on death from policies and the pension fund (cover) are low compared with about three gross annual incomes (need). AHV and pension-fund survivors' pensions come on top and are not included, so never say there is no protection at all. Say it is a rule of thumb and that the advisor calculates the exact gap. Explain who would be affected.";
      if (d.risk === "death_without_dependants")
        return "They pay for death cover although nobody depends on their income at the moment. It can still make sense (e.g. a mortgage or planned family); suggest checking whether it is still needed. Do not suggest buying anything.";
      return "Rough check, no calculation yet: in case of long-term disability, even the maximum IV pension plus IV child pensions and the pension fund's disability and child pensions stay below 80% of today's income. Real IV pensions are often lower than the maximum. Say that the advisor calculates the exact gap.";
    case "double_cover":
      return d.kind === "indemnity"
        ? "Two contracts cover the same damage; indemnity insurance pays a loss only once, so one premium is paid for nothing. Suggest checking which one to keep. Do not suggest Pax products."
        : "The same person has two separate contracts for the same risk at different insurers. That can be intended (the sums add up), but two contracts mean two cost blocks; one contract with the combined sum is often cheaper.";
    case "pillar3a_not_maxed":
      return d.contribution === null
        ? "We don't know whether they pay into pillar 3a. Explain the yearly maximum and that contributions reduce taxable income."
        : "They pay less into pillar 3a than allowed. Each franc up to the maximum reduces taxable income and builds retirement savings; a bank 3a account is as valid an option as an insurance solution.";
    case "pension_buyin":
      return "The pension certificate shows a possible voluntary buy-in into the pension fund. A buy-in is deductible from taxable income and raises the retirement benefits. Note: no lump-sum withdrawal for three years after a buy-in. If a tax saving is given, it was calculated with Logismata for buying in over the given number of years.";
    case "contract_ending":
      return d.kind === "notice"
        ? "The notice deadline of a contract is coming up. Explain what happens if they do nothing (the contract continues) and that this is the moment to check whether it still fits."
        : "A contract ends soon. Explain what it covered and that the cover stops, so they should check whether they still need it.";
  }
}

const textSchema = z.object({
  title: z.string().describe("Max. 60 characters, a plain statement, no exclamation mark"),
  body: z.string().describe("2 to 3 short sentences, max. 380 characters"),
});

export interface HintText {
  title: string;
  body: string;
  model: string | null;
}

function fallbackText(hint: DetectedHint, locale: Locale): HintText {
  // Keys are built at runtime from the hint variant, so the translator is used untyped here.
  const t = createTranslator({ locale, messages: MESSAGES[locale] }) as unknown as (
    key: string,
    values: Record<string, string>,
  ) => string;
  const d = hint.data;
  const chf = (v: unknown) => (typeof v === "number" ? formatChf(v, locale) : "–");
  const variant =
    hint.type === "coverage_mismatch"
      ? `coverage_mismatch_${String(d.risk)}${d.source === "calculation" ? "_calculated" : ""}`
      : hint.type === "double_cover"
        ? `double_cover_${String(d.kind)}`
        : hint.type === "contract_ending"
          ? `contract_ending_${String(d.kind)}`
          : hint.type === "pillar3a_not_maxed" && d.contribution === null
            ? "pillar3a_not_maxed_unknown"
            : hint.type === "pension_buyin" && d.taxSavings === null
              ? "pension_buyin_no_tax"
              : hint.type;
  const values = {
    subject: String(d.subject ?? "self"),
    name: typeof d.name === "string" ? d.name : t("hints.partnerFallback", {}),
    monthlyGap: chf(d.monthlyGap),
    insurer: String(d.insurer ?? ""),
    product: String(d.productName ?? ""),
    cover: chf(d.cover),
    need: chf(d.need),
    gap: chf(d.gap),
    limit: chf(d.limit),
    contribution: chf(d.contribution),
    maxBuyIn: chf(d.maxBuyIn),
    taxSavings: chf(d.taxSavings),
    years: String(d.years ?? ""),
    externalPremium: chf(d.externalPremium),
    paxPremium: chf(d.paxPremium),
    saving: chf(d.saving),
    premiumTotal: chf(d.premiumTotal),
    date: formatSwissDate(String(d.noticeDate ?? d.endDate ?? "")),
  };
  return {
    title: t(`hints.fallback.${variant}.title`, values),
    body: t(`hints.fallback.${variant}.body`, values),
    model: null,
  };
}

export async function explainHint(
  hint: DetectedHint,
  context: { locale: Locale; household: Record<string, unknown> },
): Promise<HintText> {
  const { key: _key, inputKey: _inputKey, ...facts } = hint.data;
  const paxOption =
    hint.type === "cheaper_equivalent"
      ? PAX_OPTION[String(facts.productCode)]
      : hint.type === "coverage_mismatch"
        ? PAX_OPTION[String(facts.risk)]
        : hint.type === "pillar3a_not_maxed"
          ? PAX_OPTION.pillar3a
          : undefined;
  try {
    const { output } = await generateText({
      model: getModel("analysis"),
      output: Output.object({ name: "hint", schema: textSchema }),
      instructions: `You write short notes for a customer's insurance cockpit at Pax, a Swiss life insurer.
Language: ${LANGUAGE[context.locale]}.
Rules:
- Start with what is off or worth checking in the customer's current situation, in plain words.
- Use only the facts given; never invent numbers. CHF amounts like CHF 1'234, dates like 31.01.2027.
- ${paxOption ? `You may name ${paxOption} once, as one option among others ("for example"), never as the main message.` : "Do not name or recommend any product."}
- No marketing language, no exclamation marks, no emojis. Address the customer directly.
- If the facts concern the partner (subject "partner"), name the partner.`,
      prompt: `Situation: ${guideFor(hint)}
Hint type: ${hint.type}
Facts: ${JSON.stringify(facts)}
Household: ${JSON.stringify(context.household)}`,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(30_000),
    });
    const title = output.title.trim();
    const body = output.body.trim();
    if (title.length < 5 || title.length > 90 || body.length < 20 || body.length > 600)
      throw new Error("Hint text out of bounds");
    return { title, body, model: modelName("analysis") };
  } catch (error) {
    console.warn(`[hints] explanation fallback for ${hint.key}:`, (error as Error).message);
    return fallbackText(hint, context.locale);
  }
}

import type { ProductCode } from "@/lib/domain/products";
import { PILLAR_3A_MAX } from "../limits";
import type { QuoteInput } from "../types";
import type { QsAction, QsProduct, QsProposal } from "./types";

/**
 * QuoteInput → Quicksale actions. Pure, so it is unit-tested against captured proposals.
 *
 * Quicksale keeps one proposal per session and applies one change per request. After the
 * DEEPLINK the adapter walks `STEPS` in order and only sends a step whose target differs from
 * the latest proposal (person first, then duration, then the amount, so the amount sticks).
 */

/** Product list entries (GET /api/produkte, captured 30.10.2026). */
const PRODUCTS: Partial<Record<ProductCode, Partial<Record<"3a" | "3b", QsProduct>>>> = {
  todesfall: {
    "3b": { titleCode: "108", technicalName: "FK", displayName: "FK", pillar3a: false },
    "3a": { titleCode: "108", technicalName: "FK", displayName: "FK", pillar3a: true },
  },
  erwerbsunfaehigkeit: {
    "3b": { titleCode: "109", technicalName: "SIR", displayName: "SIR", pillar3a: false },
    "3a": { titleCode: "109", technicalName: "SIR", displayName: "SIR", pillar3a: true },
  },
  lifestar: {
    "3b": { titleCode: "146", technicalName: "LifeStar", displayName: "LifeStar", pillar3a: false },
    "3a": {
      titleCode: "147",
      technicalName: "TzaLifeStar",
      displayName: "LifeStar",
      pillar3a: true,
    },
  },
  fondsstar: {
    "3b": {
      titleCode: "510",
      technicalName: "FondsStar",
      displayName: "FondsStar",
      pillar3a: false,
    },
    "3a": {
      titleCode: "511",
      technicalName: "TzaFondsStar",
      displayName: "TerzaFondsStar",
      pillar3a: true,
    },
  },
};

/**
 * Quicksale has no occupation-group field: the group follows from the main occupation.
 * Representatives verified live (SIR, CHF 10'000, 40→65, 24 months): Treuhänder 442.60 (1),
 * Kaufmännischer Angestellter 509.30 (2), Verkäufer 811.50 (3, = sample offer), Schreiner 909.40 (4).
 */
export const OCCUPATION_BY_GROUP: Record<1 | 2 | 3 | 4, number> = {
  1: 867,
  2: 457,
  3: 883,
  4: 771,
};
/** The SIR default occupation (1, Abbrucharbeiter) is already group 4. */
const GROUP_4_IDS = new Set([1, 771]);

/** Product with a live tariff, or undefined (estimate only). Single premiums need PlanInvest tariffs. */
export function quicksaleProductFor(input: QuoteInput): QsProduct | undefined {
  if (input.singlePremium) return undefined;
  return PRODUCTS[input.productCode]?.[input.pillar];
}

export function deeplinkAction(product: QsProduct): QsAction {
  return {
    aktion: {
      key: "DEEPLINK",
      parameter: [
        { name: "PRODUKT_TITEL_CODE", text: product.titleCode },
        { name: "TECHNICAL_NAME", text: product.technicalName },
        { name: "DISPLAY_NAME", text: product.displayName },
        { name: "SAEULE_3A", text: product.pillar3a ? "1" : "0" },
        { name: "USE_DEFAULT_PERSONEN", text: "false" },
      ],
    },
  };
}

/** ISO yyyy-mm-dd → dd.mm.yyyy */
export function toSwissDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/** dd.mm.yyyy → ISO yyyy-mm-dd */
export function fromSwissDate(swiss: string): string {
  const [d, m, y] = swiss.split(".");
  return `${y}-${m}-${d}`;
}

const person = (key: string, fields: Record<string, unknown>): QsAction => ({
  aktion: { key, parameter: [{ name: "PERSON_INDEX", wert: 0 }] },
  personen: [{ index: 0, ...fields }],
});

const mainTariff = (key: string, fields: Record<string, unknown>): QsAction => ({
  aktion: {
    key,
    parameter: [
      { name: "TARIF_INDEX", wert: 0 },
      { name: "PERSON_INDEX", wert: 0 },
    ],
  },
  personen: [{ index: 0, tarife: [{ index: 0, ...fields }] }],
});

const fundAllocation = (
  key: string,
  allocationIndex: number,
  fields: Record<string, unknown>,
): QsAction => ({
  aktion: {
    key,
    parameter: [
      { name: "FONDS_INDEX", wert: 0 },
      { name: "FONDS_ALLOKATION_INDEX", wert: allocationIndex },
    ],
  },
  fonds: [{ index: 0, fondsAllokationen: [{ index: allocationIndex, ...fields }] }],
});

const GUARANTEE = "Garantieanlage";
const WAIVER_MUTABLE = new Set<ProductCode>(["todesfall", "lifestar", "fondsstar"]);
const SAVINGS = new Set<ProductCode>(["lifestar", "fondsstar"]);

/** Fund names differ slightly between lists ("… Portfolio 25" vs "… Portfolio 25 ALV T"). */
export function sameFund(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/\balv t\b/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return norm(a) === norm(b);
}

export interface QsStep {
  name: string;
  /** The action to send for this proposal, or null if the proposal already matches. */
  plan(proposal: QsProposal, input: QuoteInput): QsAction | null;
}

export const STEPS: QsStep[] = [
  {
    name: "sex",
    plan: (p, input) => {
      const target = input.sex === "female" ? "FRAU" : "MANN";
      return p.personen[0].selectedGeschlecht === target
        ? null
        : person("GESCHLECHT_AENDERN", { selectedGeschlecht: target });
    },
  },
  {
    name: "birthDate",
    plan: (p, input) => {
      const target = toSwissDate(input.birthDate);
      return p.personen[0].geburtsdatum === target
        ? null
        : person("GEBURTSDATUM_AENDERN", { geburtsdatum: target });
    },
  },
  {
    name: "smoker",
    // Verified live: smoking does not change the disability tariff, so skip the request there.
    plan: (p, input) =>
      input.productCode === "erwerbsunfaehigkeit" || p.personen[0].raucher === input.smoker
        ? null
        : person("RAUCHER_AENDERN", { raucher: input.smoker }),
  },
  {
    name: "premiumWaiver",
    plan: (p, input) => {
      if (!WAIVER_MUTABLE.has(input.productCode) || input.premiumWaiver === undefined) return null;
      return p.personen[0].praemienbefreiung === input.premiumWaiver
        ? null
        : person("PRAEMIENBEFREIUNG_AENDERN", { praemienbefreiung: input.premiumWaiver });
    },
  },
  {
    name: "occupation",
    plan: (p, input) => {
      if (input.productCode !== "erwerbsunfaehigkeit" || !input.occupationGroup) return null;
      const current = p.personen[0].selectedHauptberufId;
      if (input.occupationGroup === 4 && GROUP_4_IDS.has(current)) return null;
      const target = OCCUPATION_BY_GROUP[input.occupationGroup];
      if (current === target) return null;
      // HAUPTBERUF_AENDERN needs the whole person object (500 otherwise).
      return {
        aktion: { key: "HAUPTBERUF_AENDERN", parameter: [{ name: "PERSON_INDEX", wert: 0 }] },
        personen: [{ ...structuredClone(p.personen[0]), selectedHauptberufId: target }],
      };
    },
  },
  {
    name: "endAge",
    plan: (p, input) =>
      p.personen[0].tarife[0]?.schlussalter === input.endAge
        ? null
        : mainTariff("SCHLUSSALTER_AENDERN", { schlussalter: input.endAge }),
  },
  {
    name: "waitingPeriod",
    plan: (p, input) => {
      if (input.productCode !== "erwerbsunfaehigkeit" || !input.waitingPeriodMonths) return null;
      return p.personen[0].tarife[0]?.selectedWartefrist === input.waitingPeriodMonths
        ? null
        : mainTariff("WARTEFRIST_AENDERN", { selectedWartefrist: input.waitingPeriodMonths });
    },
  },
  {
    name: "guaranteedShare",
    plan: (p, input) => {
      if (input.productCode !== "lifestar" || input.guaranteedSharePercent === undefined)
        return null;
      const allocations = p.fonds[0]?.fondsAllokationen ?? [];
      const guarantee = allocations.find(
        (a) => a.fondsauswahlen[a.selectedFondsauswahlIndex]?.bezeichnung === GUARANTEE,
      );
      if (!guarantee || guarantee.anteil === input.guaranteedSharePercent) return null;
      return fundAllocation("FONDSANTEIL_AENDERN", guarantee.index, {
        anteil: input.guaranteedSharePercent,
      });
    },
  },
  {
    name: "fund",
    plan: (p, input) => {
      if (!SAVINGS.has(input.productCode) || !input.fundName) return null;
      const fundName = input.fundName;
      const allocations = p.fonds[0]?.fondsAllokationen ?? [];
      const fund = allocations.find(
        (a) =>
          a.anteil > 0 && a.fondsauswahlen[a.selectedFondsauswahlIndex]?.bezeichnung !== GUARANTEE,
      );
      if (!fund) return null;
      const target = fund.fondsauswahlen.find((c) => sameFund(c.bezeichnung, fundName));
      if (!target || target.index === fund.selectedFondsauswahlIndex) return null;
      return fundAllocation("FONDSAUSWAHL_AENDERN", fund.index, {
        selectedFondsauswahlIndex: target.index,
      });
    },
  },
  {
    name: "amount",
    plan: (p, input) => {
      const tariff = p.personen[0].tarife[0];
      if (input.productCode === "todesfall") {
        const target = input.sumInsured;
        return target === undefined || tariff?.risikosumme === target
          ? null
          : mainTariff("RISIKOSUMME_AENDERN", { risikosumme: target });
      }
      if (input.productCode === "erwerbsunfaehigkeit") {
        const target = input.annualPension;
        return target === undefined || tariff?.risikosumme === target
          ? null
          : mainTariff("RISIKOSUMME_AENDERN", { risikosumme: target });
      }
      if (SAVINGS.has(input.productCode) && input.annualPremium !== undefined) {
        const cap = input.pillar === "3a" ? PILLAR_3A_MAX : Number.POSITIVE_INFINITY;
        const target = Math.min(input.annualPremium, cap);
        return Math.abs(p.ratenPraemie - target) < 0.5
          ? null
          : { aktion: { key: "RATENPRAEMIE_AENDERN" }, ratenPraemie: target };
      }
      return null;
    },
  },
];

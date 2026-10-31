import type { GapType, PolicyCategory } from "./taxonomy";

/**
 * Pax private-pension catalogue (source: pax.ch product pages and the sample offers in
 * documentation/challenge_context/material). Products are deliberately secondary: the advisor only reaches
 * for this list after the life situation and the gaps are understood.
 */

export const PRODUCT_CODES = [
  "todesfall",
  "erwerbsunfaehigkeit",
  "lifestar",
  "fondsstar",
  "pax3a",
  "auszahlungsplan",
  "kinderversicherung",
  "care",
] as const;
export type ProductCode = (typeof PRODUCT_CODES)[number];

export type Pillar = "3a" | "3b";

export interface Product {
  code: ProductCode;
  name: string;
  category: PolicyCategory;
  /** Pillars the product can be written in. */
  pillars: Pillar[];
  /** Gaps this product can close. */
  closes: GapType[];
  /** Unit-linked: requires the Angemessenheitsprüfung (suitability check) before recommending. */
  requiresSuitability: boolean;
  /** Entry age limits from the technical tariff sheets (quicksale/pdf_text). */
  entryAge: { min: number; max: number };
  /** Quicksale product title codes (portal.pax.ch/quicksale) for live pricing. */
  quicksale?: { code3b?: string; code3a?: string; technicalName: string };
  url: string;
}

export const PRODUCTS: Record<ProductCode, Product> = {
  todesfall: {
    code: "todesfall",
    name: "Pax Todesfallversicherung",
    category: "risk_death",
    pillars: ["3a", "3b"],
    closes: ["death"],
    requiresSuitability: false,
    entryAge: { min: 15, max: 70 },
    quicksale: { code3b: "108", technicalName: "FK" },
    url: "https://www.pax.ch/de/private-vorsorge/produkte/pax-todesfallversicherung",
  },
  erwerbsunfaehigkeit: {
    code: "erwerbsunfaehigkeit",
    name: "Pax Erwerbsunfähigkeitsversicherung",
    category: "risk_disability",
    pillars: ["3b"],
    closes: ["disability"],
    requiresSuitability: false,
    entryAge: { min: 15, max: 60 },
    quicksale: { code3b: "109", technicalName: "SIR" },
    url: "https://www.pax.ch/de/private-vorsorge/produkte/pax-erwerbsunfaehigkeitsversicherung",
  },
  lifestar: {
    code: "lifestar",
    name: "Pax LifeStar",
    category: "pillar3a",
    pillars: ["3a", "3b"],
    closes: ["retirement", "tax", "death"],
    requiresSuitability: true,
    entryAge: { min: 17, max: 60 },
    quicksale: { code3b: "146", code3a: "147", technicalName: "LifeStar" },
    url: "https://www.pax.ch/de/private-vorsorge/produkte/pax-lifestar",
  },
  fondsstar: {
    code: "fondsstar",
    name: "Pax FondsStar",
    category: "pillar3a",
    pillars: ["3a", "3b"],
    closes: ["retirement", "tax"],
    requiresSuitability: true,
    entryAge: { min: 17, max: 60 },
    quicksale: { code3b: "510", code3a: "511", technicalName: "FondsStar" },
    url: "https://www.pax.ch/de/private-vorsorge/produkte/pax-fondsstar",
  },
  pax3a: {
    code: "pax3a",
    name: "Pax 3a",
    category: "pillar3a",
    pillars: ["3a"],
    closes: ["retirement", "tax"],
    requiresSuitability: false,
    entryAge: { min: 18, max: 60 },
    url: "https://www.pax.ch/de/private-vorsorge/produkte/pax-3a",
  },
  auszahlungsplan: {
    code: "auszahlungsplan",
    name: "Pax Auszahlungsplan",
    category: "payout_plan",
    pillars: ["3b"],
    closes: ["payout", "retirement"],
    requiresSuitability: true,
    entryAge: { min: 18, max: 85 },
    quicksale: { code3b: "167", technicalName: "AZP" },
    url: "https://www.pax.ch/de/private-vorsorge/produkte/pax-auszahlungsplan",
  },
  kinderversicherung: {
    code: "kinderversicherung",
    name: "Pax Kinderversicherung",
    category: "child",
    pillars: ["3b"],
    closes: ["child"],
    requiresSuitability: false,
    entryAge: { min: 0, max: 20 },
    quicksale: { code3b: "103", technicalName: "LifeStarFS" },
    url: "https://www.pax.ch/de/private-vorsorge/produkte/pax-kinderversicherung",
  },
  care: {
    code: "care",
    name: "Pax Care",
    category: "care",
    pillars: ["3b"],
    closes: ["care"],
    requiresSuitability: false,
    entryAge: { min: 18, max: 99 },
    url: "https://www.pax.ch/de/private-vorsorge/produkte/pax-care",
  },
};

export function productsClosing(gap: GapType): Product[] {
  return Object.values(PRODUCTS).filter((p) => p.closes.includes(gap));
}

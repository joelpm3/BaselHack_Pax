import type { ConversationMode, Locale } from "@/lib/domain/taxonomy";

/**
 * Simulated customers: the three personas from the Pax challenge material plus randomly
 * generated Swiss profiles with one concern each. Pure and seedable so a run is reproducible
 * and the mix is testable. The facts only live in the simulated customer's prompt; the advisor
 * has to find them out by talking (except for existing clients, whose CRM data Pax already has).
 */

export const CONCERNS = [
  "baby_on_the_way",
  "buying_home",
  "early_retirement",
  "pillar3a_taxes",
  "disability_worry",
  "external_policy",
  "wants_human",
  "self_employed",
  "high_wealth",
  "retirement_payout",
  "first_job",
] as const;
export type Concern = (typeof CONCERNS)[number];

export const MATERIAL_PERSONAS = [
  "young_family",
  "affluent_couple",
  "single_professional",
] as const;
export type MaterialPersona = (typeof MATERIAL_PERSONAS)[number];

export type Style = "brief" | "chatty" | "sceptical" | "precise";

/**
 * Hand-written pitch and test personas (see `demo-personas.ts`). Each one is also a seeded demo
 * client, so the simulated customer starts with the same CRM data as in the pitch.
 */
export const DEMO_PERSONA_KEYS = [
  "student_first_job",
  "cohabiting_wedding",
  "self_employed_8165",
  "pension_or_lump_sum",
  "home_saver",
  "romandie_contract_end",
  "yearly_checkin",
] as const;
export type DemoPersonaKey = (typeof DEMO_PERSONA_KEYS)[number];

/** The richer inner life of a hand-written persona (English; the customer writes in `locale`). */
export interface PersonaStory {
  backstory: string;
  goals: string[];
  worries: string[];
  /** How they write: tone, length, du/Sie, dialect, voice dictation. */
  speakingStyle: string;
  /** What they reveal and when ("only if asked about X: …", "in the second message: …"). */
  reveals: string[];
  /** Replaces the generic pension-fund line when the persona knows their figures. */
  pensionFund?: string;
}

export interface SimPersona {
  /** `material:young_family`, `demo:student_first_job` or `generated`. */
  source: `material:${MaterialPersona}` | `demo:${DemoPersonaKey}` | "generated";
  locale: Locale;
  mode: ConversationMode;
  firstName: string;
  lastName: string;
  sex: "male" | "female";
  birthYear: number;
  canton: string;
  city: string;
  zip: string;
  maritalStatus: "single" | "married" | "cohabiting" | "divorced";
  employment: "employed" | "self_employed" | "homemaker" | "student";
  workloadPercent: number;
  grossIncome: number;
  partner: { firstName: string; birthYear: number; grossIncome: number } | null;
  childrenBirthYears: number[];
  assets: number;
  pillar3aBalance: number | null;
  concern: Concern;
  externalPolicy: { insurer: string; productName: string; premiumAnnual: number } | null;
  style: Style;
  /** Advisor replies the customer tolerates before leaving without a word; null = stays. */
  patience: number | null;
  sharesContact: boolean;
  wantsHuman: boolean;
  /** Only hand-written demo personas have one. */
  story?: PersonaStory;
}

/** Deterministic PRNG (mulberry32). */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;
const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)];
const between = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
const roundTo = (value: number, step: number) => Math.round(value / step) * step;

interface Place {
  canton: string;
  city: string;
  zip: string;
  locale: Locale;
}

const PLACES: Place[] = [
  { canton: "ZH", city: "Zürich", zip: "8004", locale: "de" },
  { canton: "ZH", city: "Winterthur", zip: "8400", locale: "de" },
  { canton: "BE", city: "Bern", zip: "3011", locale: "de" },
  { canton: "BS", city: "Basel", zip: "4051", locale: "de" },
  { canton: "BL", city: "Liestal", zip: "4410", locale: "de" },
  { canton: "LU", city: "Luzern", zip: "6003", locale: "de" },
  { canton: "SG", city: "St. Gallen", zip: "9000", locale: "de" },
  { canton: "AG", city: "Aarau", zip: "5000", locale: "de" },
  { canton: "ZG", city: "Zug", zip: "6300", locale: "de" },
  { canton: "GR", city: "Chur", zip: "7000", locale: "de" },
  { canton: "VD", city: "Lausanne", zip: "1003", locale: "fr" },
  { canton: "GE", city: "Genève", zip: "1201", locale: "fr" },
  { canton: "NE", city: "Neuchâtel", zip: "2000", locale: "fr" },
  { canton: "TI", city: "Lugano", zip: "6900", locale: "it" },
  { canton: "TI", city: "Bellinzona", zip: "6500", locale: "it" },
];

const NAMES: Record<Locale, { female: string[]; male: string[]; last: string[] }> = {
  de: {
    female: ["Anna", "Sarah", "Laura", "Nina", "Corinne", "Sandra", "Lea", "Martina"],
    male: ["Lukas", "Daniel", "Simon", "Thomas", "Reto", "Marco", "Patrick", "Stefan"],
    last: [
      "Meier",
      "Schneider",
      "Keller",
      "Brunner",
      "Huber",
      "Frei",
      "Baumann",
      "Gerber",
      "Widmer",
    ],
  },
  fr: {
    female: ["Camille", "Léa", "Chloé", "Sophie", "Julie", "Céline"],
    male: ["Julien", "Nicolas", "Mathieu", "Olivier", "Yannick", "Loïc"],
    last: ["Favre", "Rochat", "Pittet", "Morel", "Bonvin", "Perrin", "Jaquet"],
  },
  it: {
    female: ["Giulia", "Chiara", "Sara", "Elena", "Francesca"],
    male: ["Luca", "Matteo", "Davide", "Alessandro", "Fabio"],
    last: ["Bernasconi", "Rossi", "Ferrari", "Pedrazzini", "Bianchi", "Lurati"],
  },
  en: {
    female: ["Emily", "Hannah", "Olivia", "Grace"],
    male: ["James", "Oliver", "Daniel", "Ben"],
    last: ["Smith", "Walker", "Brown", "Clarke", "Evans"],
  },
};

const EXTERNAL_INSURERS = [
  "Swiss Life",
  "AXA",
  "Allianz Suisse",
  "Helvetia",
  "Baloise",
  "Generali",
];

/** Age range each concern is plausible for. */
const CONCERN_AGES: Record<Concern, [number, number]> = {
  baby_on_the_way: [26, 41],
  buying_home: [28, 48],
  early_retirement: [48, 58],
  pillar3a_taxes: [25, 55],
  disability_worry: [28, 55],
  external_policy: [30, 55],
  wants_human: [30, 62],
  self_employed: [28, 55],
  high_wealth: [40, 62],
  retirement_payout: [58, 63],
  first_job: [22, 27],
};

function behaviour(rng: Rng, concern: Concern) {
  const roll = rng();
  // ~25% leave early, ~15% midway, the rest stay until they are done (max turns applies).
  const patience = roll < 0.25 ? between(rng, 1, 3) : roll < 0.4 ? between(rng, 4, 6) : null;
  return {
    style: pick<Style>(rng, ["brief", "brief", "chatty", "sceptical", "precise"]),
    patience,
    sharesContact: rng() < 0.55,
    wantsHuman: concern === "wants_human" || rng() < 0.08,
  };
}

export function generatePersona(rng: Rng, currentYear: number): SimPersona {
  const concern = pick(rng, CONCERNS);
  // English-speaking expats live in the bigger cities; otherwise the place's language.
  const place = pick(rng, PLACES);
  const locale: Locale = rng() < 0.1 && place.locale !== "it" ? "en" : place.locale;
  const sex = rng() < 0.5 ? "female" : "male";
  const names = NAMES[locale];
  const [minAge, maxAge] = CONCERN_AGES[concern];
  const age = between(rng, minAge, maxAge);
  const birthYear = currentYear - age;

  const partnered = concern === "baby_on_the_way" || (concern !== "first_job" && rng() < 0.55);
  const maritalStatus = partnered
    ? rng() < 0.75
      ? "married"
      : "cohabiting"
    : rng() < 0.2 && age > 35
      ? "divorced"
      : "single";
  const employment = concern === "self_employed" ? "self_employed" : "employed";
  const workloadPercent =
    concern === "first_job" ? 100 : pick(rng, [60, 80, 80, 90, 100, 100, 100]);
  const fullTimeIncome =
    concern === "first_job" ? between(rng, 55, 75) * 1000 : between(rng, 70, 170) * 1000;
  const grossIncome = roundTo((fullTimeIncome * workloadPercent) / 100, 1000);

  const partner = partnered
    ? {
        firstName: pick(rng, sex === "female" ? names.male : names.female),
        birthYear: birthYear + between(rng, -4, 4),
        grossIncome: rng() < 0.2 ? 0 : roundTo(between(rng, 40, 140) * 1000, 1000),
      }
    : null;

  const childrenBirthYears: number[] = [];
  if (partnered && age > 30 && concern !== "baby_on_the_way" && rng() < 0.5) {
    const count = between(rng, 1, 2);
    for (let i = 0; i < count; i++)
      childrenBirthYears.push(currentYear - between(rng, 1, Math.min(18, age - 26)));
  }

  const assets =
    concern === "high_wealth"
      ? roundTo(between(rng, 350, 1200) * 1000, 10_000)
      : roundTo(between(rng, 5, 30) * 1000 * Math.max(1, (age - 22) / 6), 5000);

  return {
    source: "generated",
    locale,
    mode: "new_business",
    firstName: pick(rng, sex === "female" ? names.female : names.male),
    lastName: pick(rng, names.last),
    sex,
    birthYear,
    canton: place.canton,
    city: place.city,
    zip: place.zip,
    maritalStatus,
    employment,
    workloadPercent,
    grossIncome,
    partner,
    childrenBirthYears: childrenBirthYears.sort(),
    assets,
    pillar3aBalance: concern === "first_job" || rng() < 0.3 ? null : roundTo(assets * 0.3, 1000),
    concern,
    externalPolicy:
      concern === "external_policy"
        ? {
            insurer: pick(rng, EXTERNAL_INSURERS),
            productName: pick(rng, [
              "Gemischte Lebensversicherung 3a",
              "Risikolebensversicherung",
              "Fondsgebundene Vorsorge 3a",
            ]),
            premiumAnnual: roundTo(between(rng, 1500, 7200), 50),
          }
        : null,
    ...behaviour(rng, concern),
  };
}

/** The challenge personas as existing Pax clients (their CRM data is copied from the seed). */
export function materialPersona(rng: Rng, key: MaterialPersona): SimPersona {
  const common = {
    locale: "de" as const,
    mode: "existing_customer" as const,
    externalPolicy: null,
  };
  if (key === "young_family") {
    return {
      ...common,
      source: "material:young_family",
      firstName: "Jane",
      lastName: "Müller",
      sex: "female",
      birthYear: 1986,
      canton: "BS",
      city: "Basel",
      zip: "4053",
      maritalStatus: "married",
      employment: "homemaker",
      workloadPercent: 0,
      grossIncome: 0,
      partner: { firstName: "May", birthYear: 1984, grossIncome: 100_000 },
      childrenBirthYears: [2026],
      assets: 20_000,
      pillar3aBalance: null,
      concern: "baby_on_the_way",
      ...behaviour(rng, "baby_on_the_way"),
    };
  }
  if (key === "affluent_couple") {
    return {
      ...common,
      source: "material:affluent_couple",
      firstName: "Lily",
      lastName: "Smith",
      sex: "female",
      birthYear: 1976,
      canton: "BS",
      city: "Riehen",
      zip: "4125",
      maritalStatus: "married",
      employment: "employed",
      workloadPercent: 80,
      grossIncome: 80_000,
      partner: { firstName: "Wilson", birthYear: 1967, grossIncome: 200_000 },
      childrenBirthYears: [],
      assets: 500_000,
      pillar3aBalance: null,
      concern: "retirement_payout",
      ...behaviour(rng, "retirement_payout"),
    };
  }
  return {
    ...common,
    source: "material:single_professional",
    firstName: "Taylor",
    lastName: "Johnson",
    sex: "male",
    birthYear: 1995,
    canton: "ZH",
    city: "Zürich",
    zip: "8004",
    maritalStatus: "single",
    employment: "employed",
    workloadPercent: 90,
    grossIncome: 100_000,
    partner: null,
    childrenBirthYears: [],
    assets: 500_000,
    pillar3aBalance: 45_000,
    concern: "buying_home",
    ...behaviour(rng, "buying_home"),
  };
}

/** A plausible, obviously fake e-mail address for the persona. */
export function personaEmail(p: Pick<SimPersona, "firstName" | "lastName">): string {
  const clean = (v: string) =>
    v
      .normalize("NFKD")
      .replace(/[^A-Za-z]/g, "")
      .toLowerCase();
  return `${clean(p.firstName)}.${clean(p.lastName)}@example.ch`;
}

/** A run's cast: some material personas (as existing clients), the rest generated. */
export function buildCast(size: number, seed: number, currentYear: number): SimPersona[] {
  const rng = createRng(seed);
  const materialCount = Math.min(MATERIAL_PERSONAS.length, Math.ceil(size / 5));
  const cast: SimPersona[] = [];
  for (let i = 0; i < materialCount; i++) cast.push(materialPersona(rng, MATERIAL_PERSONAS[i]));
  while (cast.length < size) cast.push(generatePersona(rng, currentYear));
  // Interleave so material personas don't all start in the first batch.
  return cast
    .map((persona) => ({ persona, order: rng() }))
    .sort((a, b) => a.order - b.order)
    .map((x) => x.persona);
}

export function summariseCast(cast: SimPersona[]) {
  const count = <K extends string>(keys: K[]) =>
    keys.reduce<Record<string, number>>((acc, k) => {
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
  return {
    material: cast.filter((p) => p.source.startsWith("material:")).length,
    demo: cast.filter((p) => p.source.startsWith("demo:")).length,
    generated: cast.filter((p) => p.source === "generated").length,
    locales: count(cast.map((p) => p.locale)),
    concerns: count(cast.map((p) => p.concern)),
    earlyLeavers: cast.filter((p) => p.patience !== null).length,
  };
}

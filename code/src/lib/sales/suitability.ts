import { z } from "zod";
import type { ProductCode } from "@/lib/domain/products";

/**
 * Angemessenheitsprüfung for qualified (unit-linked) life insurance, as on Pax form
 * 0054/PMPV/03.2026 (documentation/challenge_context/material/text/pax-angemessenheitspruefung.txt).
 * Pure and deterministic so the result is auditable and unit-tested.
 */

export const SUITABILITY_PRODUCTS = ["lifestar", "fondsstar", "auszahlungsplan"] as const;
export type SuitabilityProduct = (typeof SUITABILITY_PRODUCTS)[number];

/** A. Financial capacity: bracket answers, no points. */
export const NET_INCOME = ["lt75k", "75k_150k", "150k_250k", "gt250k"] as const;
export const NET_ASSETS = ["lt10k", "10k_50k", "50k_150k", "150k_300k", "gt300k"] as const;
export const SAVING_CAPACITY = ["lt1k", "1k_3k", "3k_7k", "gt7k"] as const;
export const ONE_OFF_CAPACITY = NET_ASSETS;

/** Upper bounds (CHF) used for the affordability check against A3 / A4. */
const SAVING_CAPACITY_MAX: Record<(typeof SAVING_CAPACITY)[number], number> = {
  lt1k: 999,
  "1k_3k": 3000,
  "3k_7k": 7000,
  gt7k: Number.POSITIVE_INFINITY,
};
const ONE_OFF_CAPACITY_MAX: Record<(typeof ONE_OFF_CAPACITY)[number], number> = {
  lt10k: 9999,
  "10k_50k": 50_000,
  "50k_150k": 150_000,
  "150k_300k": 300_000,
  gt300k: Number.POSITIVE_INFINITY,
};

/** B and C: the answers that carry points. */
export const POINTS = {
  goal: { minimise_loss: 0, moderate_gains: 15, high_gains: 30 },
  horizon: { "10_15": 15, gt15: 30 },
  knowledge: { none: 0, knowledge_only: 10, experience: 20, expert: 30 },
  drawdown: { sell_all: 0, sell_part: 10, hold: 20, buy_more: 30 },
} as const;

const keys = <T extends Record<string, number>>(o: T) =>
  Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];

export const suitabilityAnswersSchema = z.object({
  annualPremium: z.number().min(0).max(1_000_000).nullable(),
  singlePremium: z.number().min(0).max(10_000_000).nullable(),
  netIncome: z.enum(NET_INCOME),
  netAssets: z.enum(NET_ASSETS),
  savingCapacity: z.enum(SAVING_CAPACITY),
  oneOffCapacity: z.enum(ONE_OFF_CAPACITY),
  goal: z.enum(keys(POINTS.goal)),
  horizon: z.enum(keys(POINTS.horizon)),
  knowledge: z.enum(keys(POINTS.knowledge)),
  drawdown: z.enum(keys(POINTS.drawdown)),
  /** D. Guaranteed share of the premium in percent (0 for pure fund products). */
  guaranteedSharePercent: z.number().min(0).max(100),
});
export type SuitabilityAnswers = z.infer<typeof suitabilityAnswersSchema>;

export type InvestmentProfile = "conservative" | "balanced" | "dynamic";

export interface Fund {
  name: string;
  profile: InvestmentProfile;
  /** Maximum equity share in percent, as described on the form. */
  maxEquityPercent: number;
  onlyFor?: SuitabilityProduct[];
  notFor?: SuitabilityProduct[];
}

export const FUNDS: Fund[] = [
  {
    name: "Pax (CH) Sustainable Portfolio Target Return ALV T",
    profile: "conservative",
    maxEquityPercent: 25,
  },
  { name: "Pax (CH) Sustainable Portfolio 25 ALV T", profile: "balanced", maxEquityPercent: 30 },
  { name: "Pax (CH) Sustainable Portfolio 50 ALV T", profile: "balanced", maxEquityPercent: 50 },
  { name: "Pax (CH) Sustainable Portfolio 75 ALV T", profile: "balanced", maxEquityPercent: 90 },
  { name: "Pax (CH) Sustainable Portfolio 100 ALV T", profile: "dynamic", maxEquityPercent: 100 },
  {
    name: "Pax (CH) Sustainable Portfolio Quality Select ALV T",
    profile: "dynamic",
    maxEquityPercent: 100,
    onlyFor: ["auszahlungsplan"],
  },
  {
    name: "Pax (CH) Sustainable Equity Switzerland Small & Mid Cap ALV T",
    profile: "dynamic",
    maxEquityPercent: 100,
    notFor: ["auszahlungsplan"],
  },
  {
    name: "UBS MSCI World Selection UCITS ETF",
    profile: "dynamic",
    maxEquityPercent: 100,
    notFor: ["auszahlungsplan"],
  },
];

/** Guaranteed share the customer can choose per product (tariff sheets), and the default. */
export const GUARANTEE_RANGE: Record<
  SuitabilityProduct,
  { min: number; max: number; default: number }
> = {
  lifestar: { min: 10, max: 100, default: 50 },
  fondsstar: { min: 0, max: 0, default: 0 },
  auszahlungsplan: { min: 0, max: 95, default: 50 },
};

export function isSuitabilityProduct(code: ProductCode): code is SuitabilityProduct {
  return (SUITABILITY_PRODUCTS as readonly string[]).includes(code);
}

/** Konservativ ≤ 44, Ausgewogen 45–84, Dynamisch ≥ 85. */
export function profileFor(total: number): InvestmentProfile {
  if (total <= 44) return "conservative";
  if (total <= 84) return "balanced";
  return "dynamic";
}

export function fundsFor(profile: InvestmentProfile, product: SuitabilityProduct): Fund[] {
  return FUNDS.filter(
    (f) =>
      f.profile === profile &&
      (!f.onlyFor || f.onlyFor.includes(product)) &&
      !f.notFor?.includes(product),
  );
}

/**
 * The form lists three funds for "Ausgewogen" without ranking them; we suggest the one whose
 * equity share fits the position within the band (our heuristic, the customer can change it).
 */
export function suggestedFund(
  profile: InvestmentProfile,
  total: number,
  product: SuitabilityProduct,
): Fund {
  const funds = fundsFor(profile, product);
  if (profile !== "balanced") return funds[0];
  const index = total <= 58 ? 0 : total <= 71 ? 1 : 2;
  return funds[index];
}

export interface SuitabilityResult {
  points: { goal: number; horizon: number; knowledge: number; drawdown: number };
  /** Sum of B1–C2 (0–120). */
  basePoints: number;
  guaranteedSharePercent: number;
  /** `basePoints × (100 % − g) + 120 × g`, rounded to whole points. */
  total: number;
  profile: InvestmentProfile;
  funds: string[];
  suggestedFund: string;
  affordability: {
    annual: boolean | null;
    single: boolean | null;
    ok: boolean;
  };
  /** Both checks of section 6 answered "Ja". */
  suitable: boolean;
}

export function scoreSuitability(
  answers: SuitabilityAnswers,
  product: SuitabilityProduct,
): SuitabilityResult {
  const points = {
    goal: POINTS.goal[answers.goal],
    horizon: POINTS.horizon[answers.horizon],
    knowledge: POINTS.knowledge[answers.knowledge],
    drawdown: POINTS.drawdown[answers.drawdown],
  };
  const basePoints = points.goal + points.horizon + points.knowledge + points.drawdown;
  const g = answers.guaranteedSharePercent / 100;
  const total = Math.round(basePoints * (1 - g) + 120 * g);
  const profile = profileFor(total);

  const annual =
    answers.annualPremium && answers.annualPremium > 0
      ? answers.annualPremium <= SAVING_CAPACITY_MAX[answers.savingCapacity]
      : null;
  const single =
    answers.singlePremium && answers.singlePremium > 0
      ? answers.singlePremium <= ONE_OFF_CAPACITY_MAX[answers.oneOffCapacity]
      : null;
  const ok = (annual !== null || single !== null) && annual !== false && single !== false;

  return {
    points,
    basePoints,
    guaranteedSharePercent: answers.guaranteedSharePercent,
    total,
    profile,
    funds: fundsFor(profile, product).map((f) => f.name),
    suggestedFund: suggestedFund(profile, total, product).name,
    affordability: { annual, single, ok },
    // The fund is always chosen within the customer's profile, so the risk check is "Ja";
    // the result then depends on affordability.
    suitable: ok,
  };
}

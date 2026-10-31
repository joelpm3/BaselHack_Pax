import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { patchToolOutput } from "@/lib/advisor/conversations";
import { type Pillar3aPolicy, pillar3aContributionIn } from "@/lib/advisor/pillar3a";
import { activeLifePolicies } from "@/lib/advisor/policies";
import type { ToolContext } from "@/lib/advisor/tools/context";
import { modelName } from "@/lib/ai/models";
import { audit } from "@/lib/audit";
import { db, schema } from "@/lib/db";
import { PRODUCTS, type Product, type ProductCode, productsClosing } from "@/lib/domain/products";
import { type LifeSituation, pillar2Of } from "@/lib/domain/profile";
import { GAP_TYPES, type GapType } from "@/lib/domain/taxonomy";
import { type Quote, type QuoteInput, quotePremium } from "@/lib/pricing";
import { resolveStartDate, technicalAge } from "@/lib/pricing/limits";
import { getProfile } from "@/lib/profile/service";
import { type SalesTexts, salesTexts } from "./i18n";
import {
  type InsuredFacts,
  occupationGroup,
  pillar3aRoom,
  SAVINGS_MIN_PREMIUM,
  sizeDeathCover,
  sizeDisabilityCover,
  sizeSavings,
} from "./sizing";
import { advanceConversationStage } from "./stage";
import type {
  CoverView,
  Criterion,
  ExcludedProduct,
  PriceView,
  RecommendationView,
  RecommendOutput,
} from "./types";

export const recommendInputSchema = z.object({
  gaps: z
    .array(
      z.object({
        type: z.enum(GAP_TYPES),
        annualAmount: z
          .number()
          .min(0)
          .nullable()
          .describe(
            "Gap in CHF per year from the analysis (monthly gap × 12, not the cumulative gap " +
              "until retirement); null if not calculated",
          ),
        person: z
          .enum(["self", "partner"])
          .default("self")
          .describe("Whose death, disability or retirement causes the gap: that person is insured"),
        note: z
          .string()
          .max(300)
          .default("")
          .describe(
            "Short note for the audit trail, e.g. 'death by illness, until youngest child is 25'",
          ),
      }),
    )
    .min(1)
    .max(7),
  preferences: z
    .object({
      pillar: z.enum(["3a", "3b"]).optional().describe("Only if the customer asked for a pillar"),
      maxAnnualBudget: z
        .number()
        .positive()
        .optional()
        .describe("CHF per year the customer wants to spend"),
      riskAttitude: z.enum(["low", "medium", "high"]).optional(),
      availableCapital: z
        .number()
        .positive()
        .optional()
        .describe(
          "Capital for a payout plan (Auszahlungsplan), e.g. a 3a or pension-fund lump sum",
        ),
    })
    .default({}),
  annualPremium: z
    .number()
    .positive()
    .optional()
    .describe(
      "Savings products only: the yearly premium the customer wants (e.g. the 3a maximum). " +
        "Kept within the 3a room of the start year and the tariff minimum of CHF 1'200",
    ),
  startDate: z
    .string()
    .optional()
    .describe(
      "Contract start yyyy-mm-01, from next month up to 12 months ahead (default: first of next " +
        "month). E.g. 2027-01-01 when this year's 3a room is used up; the 3a room is computed " +
        "for the start year",
    ),
});
export type RecommendInput = z.infer<typeof recommendInputSchema>;

/** Parameters stored with each recommendation; the offer re-prices from `quoteInput`. */
export interface RecommendationParameters {
  quoteInput: QuoteInput;
  insured: {
    who: "self" | "partner";
    name: string | null;
    birthDateAssumed: boolean;
    smokerAssumed: boolean;
  };
  cover: CoverView;
  price: PriceView;
  alsoCloses: GapType[];
  gapAnnual: number | null;
  note: string;
  flags: Array<{ ruleId: string; text: string }>;
  /** The recommendProducts call that showed it (to update the card's status later). */
  toolCallId?: string;
}

type Who = "self" | "partner";

interface Need {
  gap: GapType;
  alsoCloses: GapType[];
  annual: number | null;
  who: Who;
  note: string;
}

interface Insured {
  who: Who;
  name: string | null;
  birthDate: string;
  birthDateAssumed: boolean;
  sex: "male" | "female";
  smoker: boolean;
  smokerAssumed: boolean;
  facts: InsuredFacts;
}

interface Draft {
  need: Need;
  /** Savings: the 3a room in the start year. */
  room3a?: number;
  product: Product;
  insured: Insured;
  input: QuoteInput;
  criteria: Criterion[];
  rationaleKey: string;
  rationaleParams: Record<string, string | number>;
  alternatives: RecommendationView["alternatives"];
  flags: RecommendationView["flags"];
  budget?: number;
}

/** Order in which products answer a gap (filtered by the catalogue's `productsClosing`). */
function preference(
  gap: GapType,
  riskAttitude: "low" | "medium" | "high" | undefined,
): ProductCode[] {
  const savings: ProductCode[] =
    riskAttitude === "high"
      ? ["fondsstar", "lifestar", "pax3a"]
      : ["lifestar", "fondsstar", "pax3a"];
  const order: Record<GapType, ProductCode[]> = {
    death: ["todesfall", "lifestar"],
    disability: ["erwerbsunfaehigkeit"],
    retirement: [...savings, "auszahlungsplan"],
    tax: savings,
    child: ["kinderversicherung"],
    payout: ["auszahlungsplan"],
    care: ["care"],
  };
  const closing = new Set(productsClosing(gap).map((p) => p.code));
  return order[gap].filter((code) => closing.has(code));
}

/** One need per gap type; retirement and tax share one 3a recommendation. */
function needsFrom(gaps: RecommendInput["gaps"]): Need[] {
  const byType = new Map<GapType, Need>();
  for (const g of gaps) {
    const existing = byType.get(g.type);
    if (existing) {
      existing.annual = Math.max(existing.annual ?? 0, g.annualAmount ?? 0) || existing.annual;
      continue;
    }
    byType.set(g.type, {
      gap: g.type,
      alsoCloses: [],
      annual: g.annualAmount,
      who: g.person,
      note: g.note,
    });
  }
  const retirement = byType.get("retirement");
  const tax = byType.get("tax");
  if (retirement && tax) {
    retirement.alsoCloses.push("tax");
    byType.delete("tax");
  }
  return [...byType.values()];
}

function insuredFor(
  who: Who,
  profile: LifeSituation,
  customer: typeof schema.customers.$inferSelect,
  startDate: string,
  contributionIn: (year: number) => number,
): Insured | { missing: string[] } {
  const person = who === "partner" ? profile.partner : profile.person;
  const prefix = who === "partner" ? "partner" : "person";
  if (!person) return { missing: ["partner"] };
  const exactBirthDate = who === "self" ? customer.birthDate : null;
  const birthYear =
    person.birthYear ?? (exactBirthDate ? Number(exactBirthDate.slice(0, 4)) : undefined);
  const missing = [
    ...(birthYear === undefined ? [`${prefix}.birthYear`] : []),
    ...(person.sex === undefined ? [`${prefix}.sex`] : []),
  ];
  if (birthYear === undefined || person.sex === undefined) return { missing };

  const birthDate = exactBirthDate ?? `${birthYear}-01-01`;
  const youngest = profile.children.reduce<number | undefined>(
    (max, c) => (max === undefined || c.birthYear > max ? c.birthYear : max),
    undefined,
  );
  return {
    who,
    name:
      who === "self"
        ? [customer.firstName ?? person.firstName, customer.lastName].filter(Boolean).join(" ") ||
          null
        : [person.firstName, customer.lastName].filter(Boolean).join(" ") || null,
    birthDate,
    birthDateAssumed: !exactBirthDate,
    sex: person.sex,
    smoker: person.smoker ?? false,
    smokerAssumed: person.smoker === undefined,
    facts: {
      age: technicalAge(birthDate, startDate),
      currentYear: Number(startDate.slice(0, 4)),
      grossIncome: person.grossIncome,
      employment: person.employment,
      occupation: person.occupation,
      hasPartner: who === "partner" || Boolean(profile.partner),
      youngestChildBirthYear: youngest,
      hasPensionFund: pillar2Of(profile, who).hasPensionFund,
      pillar3aContribution:
        who === "self" ? contributionIn(Number(startDate.slice(0, 4))) : undefined,
      retirementAge: profile.desiredRetirementAge ?? 65,
    },
  };
}

function flagsFor(product: Product, ctx: ToolContext): RecommendationView["flags"] {
  const words = [
    product.name.replace(/^Pax\s+/, ""),
    ...(product.requiresSuitability ? ["Angemessenheit"] : []),
  ];
  const pattern = new RegExp(
    `\\b(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "i",
  );
  return ctx.ruleSet.rules
    .filter((r) => r.active && r.action === "flag" && pattern.test(r.text))
    .map((r) => ({ ruleId: r.id, text: r.text }));
}

function priceView(quote: Quote): PriceView {
  return {
    annualGross: quote.premiumAnnualGross,
    annualNet: quote.premiumAnnualNet,
    source: quote.source,
    singlePremium: quote.singlePremium,
    maturity: quote.maturity,
    payoutAnnual: quote.payoutAnnual,
    riders: quote.riders,
    startDate: quote.startDate,
    durationYears: quote.durationYears,
    fundName: quote.fundName,
    guaranteedSharePercent: quote.guaranteedSharePercent,
    issues: quote.issues,
  };
}

/** Builds the priced, explainable recommendations and stores them. */
export async function recommendProducts(
  ctx: ToolContext,
  raw: z.input<typeof recommendInputSchema>,
  toolCallId?: string,
): Promise<RecommendOutput> {
  const input = recommendInputSchema.parse(raw);
  const { t, chf } = await salesTexts(ctx.locale);
  const today = new Date();
  const start = resolveStartDate(input.startDate, today);
  const startDate = start.startDate;
  const explicitStart =
    Boolean(input.startDate) && (!start.problem || start.problem === "not_first_of_month");
  const profile = getProfile(ctx.customerId);
  const policies: Pillar3aPolicy[] = activeLifePolicies(ctx.customerId);
  const thisYear = today.getFullYear();
  const contributionIn = (year: number) =>
    pillar3aContributionIn(year, profile, policies, thisYear);
  const customer = db.query.customers
    .findFirst({ where: eq(schema.customers.id, ctx.customerId) })
    .sync();
  if (!customer) throw new Error("Customer not found");

  const base: RecommendOutput = {
    status: "ok",
    missing: [],
    recommendations: [],
    excluded: [],
    ruleSetVersion: ctx.ruleSet.version,
    notes: [],
  };
  if (start.problem)
    base.notes?.push(
      `startDate ${input.startDate}: ${start.problem.replaceAll("_", " ")}, used ${startDate}. ` +
        "Allowed: the first of a month from next month up to 12 months ahead.",
    );
  const needs = needsFrom(input.gaps);
  const insuredByWho = new Map<Who, Insured>();
  for (const who of new Set(needs.map((n) => n.who))) {
    const insured = insuredFor(who, profile, customer, startDate, contributionIn);
    if ("missing" in insured) base.missing.push(...insured.missing);
    else insuredByWho.set(who, insured);
  }
  if (base.missing.length > 0) return { ...base, status: "needs_info" };

  const blocked = new Map(
    ctx.ruleSet.rules
      .filter((r) => r.active && r.action === "block_product" && r.productCode)
      .map((r) => [r.productCode as ProductCode, r]),
  );
  const prefs = input.preferences;
  const drafts: Draft[] = [];

  for (const need of needs) {
    const insured = insuredByWho.get(need.who) as Insured;
    const eligible: Product[] = [];
    for (const code of preference(need.gap, prefs.riskAttitude)) {
      const product = PRODUCTS[code];
      const rule = blocked.get(code);
      if (rule) {
        base.excluded.push({
          productCode: code,
          productName: product.name,
          reason: rule.text,
          ruleId: rule.id,
        });
        continue;
      }
      if (prefs.pillar && !product.pillars.includes(prefs.pillar)) continue;
      if (code === "auszahlungsplan" && need.gap === "retirement" && insured.facts.age < 55)
        continue;
      const age =
        code === "kinderversicherung" && insured.facts.youngestChildBirthYear !== undefined
          ? insured.facts.currentYear - insured.facts.youngestChildBirthYear
          : insured.facts.age;
      if (age < product.entryAge.min || age > product.entryAge.max) {
        base.excluded.push({
          productCode: code,
          productName: product.name,
          reason: t("server.excluded.entryAge", {
            age,
            min: product.entryAge.min,
            max: product.entryAge.max,
          }),
        });
        continue;
      }
      eligible.push(product);
    }
    const [primary, ...others] = eligible;
    if (!primary) continue;
    const draft = buildDraft(
      need,
      primary,
      insured,
      prefs,
      { annualPremium: input.annualPremium, startDate: explicitStart ? startDate : undefined },
      ctx,
      { t, chf },
    );
    if ("excluded" in draft) {
      base.excluded.push(draft.excluded);
      continue;
    }
    draft.alternatives = alternativesFor(need, primary, others, profile, t);
    drafts.push(draft);
    const year = insured.facts.currentYear;
    if (draft.room3a !== undefined && draft.input.pillar === "3a") {
      if (input.annualPremium !== undefined && draft.input.annualPremium !== input.annualPremium)
        base.notes?.push(
          `annualPremium ${input.annualPremium} became ${draft.input.annualPremium}: the 3a room ` +
            `in ${year} is CHF ${draft.room3a}, the tariff minimum CHF ${SAVINGS_MIN_PREMIUM}.`,
        );
      const nextRoom = pillar3aRoom({
        ...insured.facts,
        currentYear: year + 1,
        pillar3aContribution: contributionIn(year + 1),
      });
      if (draft.room3a < SAVINGS_MIN_PREMIUM && nextRoom >= SAVINGS_MIN_PREMIUM)
        base.notes?.push(
          `The 3a room in ${year} is used up (CHF ${draft.room3a}); in ${year + 1} it is ` +
            `CHF ${nextRoom}. To start the 3a then, call again with startDate ${year + 1}-01-01.`,
        );
    }
  }

  // Price all recommendations at once (the pricing module limits concurrency).
  const quotes = await Promise.all(
    drafts.map((d) =>
      quotePremium(d.input, {
        customerId: ctx.customerId,
        conversationId: ctx.conversationId,
        toolCallId,
      }),
    ),
  );

  const model = modelName("chat");
  const views: RecommendationView[] = [];
  drafts.forEach((draft, i) => {
    const quote = quotes[i];
    const blocking = quote.issues.find((issue) => issue.blocking);
    if (blocking) {
      base.excluded.push({
        productCode: draft.product.code,
        productName: draft.product.name,
        reason: t(`issues.${blocking.code}`, blocking.params ?? {}),
      });
      return;
    }
    const view = finalize(draft, quote, { t, chf });
    const parameters: RecommendationParameters = {
      quoteInput: quote.inputs,
      insured: {
        who: draft.insured.who,
        name: draft.insured.name,
        birthDateAssumed: draft.insured.birthDateAssumed,
        smokerAssumed: draft.insured.smokerAssumed,
      },
      cover: view.cover,
      price: view.price as PriceView,
      alsoCloses: draft.need.alsoCloses,
      gapAnnual: draft.need.annual,
      note: draft.need.note,
      flags: draft.flags,
      toolCallId,
    };
    const [row] = db
      .insert(schema.recommendations)
      .values({
        conversationId: ctx.conversationId,
        customerId: ctx.customerId,
        productCode: draft.product.code,
        pillar: draft.input.pillar,
        gap: draft.need.gap,
        headline: view.headline,
        rationale: view.rationale,
        criteria: view.criteria,
        parameters: parameters as unknown as Record<string, unknown>,
        premiumAnnual: quote.premiumAnnualGross,
        premiumSource: quote.source,
        alternatives: view.alternatives.map((a) => ({ productCode: a.code, reason: a.reason })),
        ruleSetId: ctx.ruleSet.id,
        model,
      })
      .returning()
      .all();
    audit({
      actorType: "ai",
      actorId: model,
      action: "recommendation.created",
      entityType: "recommendation",
      entityId: row.id,
      data: {
        conversationId: ctx.conversationId,
        productCode: row.productCode,
        premiumAnnual: row.premiumAnnual,
        premiumSource: row.premiumSource,
        ruleSetVersion: ctx.ruleSet.version,
      },
    });
    views.push({ ...view, id: row.id });
  });

  if (views.length > 0) advanceConversationStage(ctx.conversationId, "recommendation_shown");
  return { ...base, recommendations: views };
}

interface Terms {
  annualPremium?: number;
  /** Set only when the advisor chose the start; the default start stays implicit. */
  startDate?: string;
}

function buildDraft(
  need: Need,
  product: Product,
  insured: Insured,
  prefs: RecommendInput["preferences"],
  terms: Terms,
  ctx: ToolContext,
  { t, chf }: SalesTexts,
): Draft | { excluded: ExcludedProduct } {
  const facts = insured.facts;
  const person = {
    birthDate: insured.birthDate,
    sex: insured.sex,
    smoker: insured.smoker,
    ...(terms.startDate ? { startDate: terms.startDate } : {}),
  };
  let room3a: number | undefined;
  const gapValue =
    need.annual && need.annual > 0
      ? t("server.criteria.gapValue", {
          gap: t(`server.gaps.${need.gap}`),
          amount: chf(need.annual),
        })
      : t("server.criteria.gapValueUnknown", { gap: t(`server.gaps.${need.gap}`) });
  const criteria: Criterion[] = [
    { criterion: t("server.criteria.gap"), value: gapValue, met: true },
  ];
  const age = facts.age;
  criteria.push({
    criterion: t("server.criteria.entryAge"),
    value: t("server.criteria.entryAgeValue", {
      age,
      min: product.entryAge.min,
      max: product.entryAge.max,
    }),
    met: true,
  });

  let input: QuoteInput;
  let rationaleKey: string;
  let rationaleParams: Record<string, string | number> = {
    gap: need.annual ? chf(need.annual) : "",
  };

  switch (product.code) {
    case "todesfall": {
      const cover = sizeDeathCover(need.annual, facts);
      const pillar = prefs.pillar === "3a" && cover.endAge <= 65 ? "3a" : "3b";
      input = {
        productCode: "todesfall",
        pillar,
        ...person,
        sumInsured: cover.sumInsured,
        endAge: Math.min(85, cover.endAge),
      };
      criteria.push({
        criterion: t("server.criteria.sumInsured"),
        value: cover.fromIncome
          ? t("server.criteria.sumFromIncome", { sum: chf(cover.sumInsured) })
          : t("server.criteria.sumFromGap", {
              gap: chf(need.annual ?? 0),
              years: cover.years,
              sum: chf(cover.sumInsured),
            }),
        met: true,
      });
      criteria.push({
        criterion: t("server.criteria.duration"),
        value: t(`server.criteria.durationDeath.${cover.method}`, {
          years: cover.years,
          endAge: input.endAge,
        }),
        met: true,
      });
      rationaleKey = need.annual
        ? `server.rationale.todesfall`
        : "server.rationale.todesfallIncome";
      rationaleParams = {
        ...rationaleParams,
        sum: chf(cover.sumInsured),
        years: cover.years,
        endAge: input.endAge,
      };
      break;
    }
    case "erwerbsunfaehigkeit": {
      const cover = sizeDisabilityCover(need.annual, facts);
      const group = occupationGroup(facts.occupation);
      input = {
        productCode: "erwerbsunfaehigkeit",
        pillar: prefs.pillar === "3a" ? "3a" : "3b",
        ...person,
        annualPension: cover.annualPension,
        waitingPeriodMonths: cover.waitingPeriodMonths,
        occupationGroup: group.group,
        endAge: cover.endAge,
      };
      criteria.push({
        criterion: t("server.criteria.pension"),
        value: t("server.criteria.pensionValue", {
          pension: chf(cover.annualPension),
          endAge: cover.endAge,
        }),
        met: !cover.aboveSumInsurance,
      });
      criteria.push({
        criterion: t("server.criteria.waitingPeriod"),
        value: t(`server.criteria.waiting${cover.waitingPeriodMonths}`),
        met: true,
      });
      criteria.push({
        criterion: t("server.criteria.occupation"),
        value: group.assumed
          ? t("server.criteria.occupationAssumed", { group: group.group })
          : t("server.criteria.occupationValue", {
              group: group.group,
              occupation: facts.occupation ?? "",
            }),
        met: !group.assumed,
      });
      rationaleKey = need.annual
        ? "server.rationale.erwerbsunfaehigkeit"
        : "server.rationale.erwerbsunfaehigkeitNoAmount";
      rationaleParams = {
        ...rationaleParams,
        pension: chf(cover.annualPension),
        months: cover.waitingPeriodMonths,
        endAge: cover.endAge,
      };
      break;
    }
    case "auszahlungsplan": {
      const capital = prefs.availableCapital ?? (need.annual ? need.annual * 15 : undefined);
      if (!capital) {
        return {
          excluded: {
            productCode: product.code,
            productName: product.name,
            reason: t("server.excluded.capitalUnknown"),
          },
        };
      }
      input = {
        productCode: "auszahlungsplan",
        pillar: "3b",
        ...person,
        singlePremium: Math.round(capital),
        endAge: 85,
      };
      criteria.push({
        criterion: t("server.criteria.capital"),
        value: t(
          prefs.availableCapital
            ? "server.criteria.capitalGiven"
            : "server.criteria.capitalFromGap",
          { capital: chf(capital) },
        ),
        met: true,
      });
      rationaleKey = "server.rationale.auszahlungsplan";
      rationaleParams = {
        ...rationaleParams,
        capital: chf(capital),
        startAge: Math.max(65, age + 1),
      };
      break;
    }
    case "kinderversicherung": {
      const childYear = facts.youngestChildBirthYear ?? facts.currentYear;
      const premium = Math.max(1000, Math.round(prefs.maxAnnualBudget ?? 1200));
      input = {
        productCode: "kinderversicherung",
        pillar: "3b",
        birthDate: `${childYear}-01-01`,
        sex: insured.sex,
        smoker: false,
        annualPremium: premium,
        endAge: 25,
      };
      criteria.push({
        criterion: t("server.criteria.premium"),
        value: t("server.criteria.premiumValue", { premium: chf(premium) }),
        met: true,
      });
      rationaleKey = "server.rationale.kinderversicherung";
      rationaleParams = { ...rationaleParams, premium: chf(premium) };
      break;
    }
    case "care": {
      input = { productCode: "care", pillar: "3b", ...person, endAge: 99 };
      rationaleKey = "server.rationale.care";
      break;
    }
    default: {
      // Savings: LifeStar, FondsStar, Pax 3a (retirement and/or tax gap, or death as fallback).
      const includeTax = need.gap === "tax" || need.alsoCloses.includes("tax");
      const plan = sizeSavings(
        need.gap === "death" ? null : need.annual,
        includeTax,
        facts,
        prefs.maxAnnualBudget,
        terms.annualPremium,
      );
      room3a = plan.room3a;
      const pillar = product.code === "pax3a" ? "3a" : (prefs.pillar ?? plan.pillar);
      input = {
        productCode: product.code,
        pillar,
        ...person,
        annualPremium: plan.annualPremium,
        endAge: plan.endAge,
      };
      criteria.push({
        criterion: t("server.criteria.room3a"),
        value: terms.startDate
          ? plan.room3a > 0
            ? t("server.criteria.room3aYearValue", {
                room: chf(plan.room3a),
                year: String(facts.currentYear),
              })
            : t("server.criteria.room3aYearFull", { year: String(facts.currentYear) })
          : plan.room3a > 0
            ? t("server.criteria.room3aValue", { room: chf(plan.room3a) })
            : t("server.criteria.room3aFull"),
        met: pillar === "3b" || plan.room3a >= plan.annualPremium,
      });
      const desired = terms.annualPremium !== undefined && !plan.desiredAdjusted;
      criteria.push({
        criterion: t("server.criteria.premium"),
        value: desired
          ? t("server.criteria.premiumDesired", { premium: chf(plan.annualPremium) })
          : plan.closesGapFully
            ? t("server.criteria.premiumValue", { premium: chf(plan.annualPremium) })
            : t("server.criteria.premiumPartial", {
                premium: chf(plan.annualPremium),
                required: chf(plan.requiredPremium),
              }),
        met: desired || plan.closesGapFully,
      });
      rationaleKey =
        need.gap === "tax"
          ? "server.rationale.savingsTax"
          : need.annual
            ? "server.rationale.savings"
            : "server.rationale.savingsNoAmount";
      rationaleParams = {
        ...rationaleParams,
        premium: chf(plan.annualPremium),
        endAge: plan.endAge,
        pillar,
      };
    }
  }

  if (terms.startDate) {
    const [y, m, d] = terms.startDate.split("-");
    criteria.push({
      criterion: t("server.criteria.start"),
      value: t("server.criteria.startValue", { date: `${d}.${m}.${y}` }),
      met: true,
    });
  }
  if (["todesfall", "lifestar", "fondsstar", "pax3a"].includes(product.code)) {
    criteria.push({
      criterion: t("server.criteria.smoker"),
      value: t(
        insured.smokerAssumed
          ? "server.criteria.nonSmokerAssumed"
          : insured.smoker
            ? "server.criteria.smokerYes"
            : "server.criteria.smokerNo",
      ),
      met: !insured.smokerAssumed,
    });
  }
  if (insured.who === "partner") {
    criteria.push({
      criterion: t("server.criteria.insured"),
      value: insured.name ?? t("server.criteria.partner"),
      met: true,
    });
  }
  const flags = flagsFor(product, ctx);
  criteria.push({
    criterion: t("server.criteria.rules"),
    value: t("server.criteria.rulesValue", { version: ctx.ruleSet.version }),
    met: true,
  });
  if (product.requiresSuitability) {
    criteria.push({
      criterion: t("server.criteria.suitability"),
      value: t("server.criteria.suitabilityPending"),
      met: false,
    });
  }
  return {
    need,
    room3a,
    budget: prefs.maxAnnualBudget,
    product,
    insured,
    input,
    criteria,
    rationaleKey,
    rationaleParams,
    alternatives: [],
    flags,
  };
}

function alternativesFor(
  need: Need,
  primary: Product,
  others: Product[],
  profile: LifeSituation,
  t: SalesTexts["t"],
): RecommendationView["alternatives"] {
  const list: RecommendationView["alternatives"] = others.slice(0, 2).map((p) => ({
    code: p.code,
    label: p.name,
    reason: t(`server.alternatives.${p.code}`),
  }));
  if (primary.code === "todesfall" && need.gap === "death") {
    list.unshift({
      code: "todesfall_decreasing",
      label: t("server.alternatives.todesfallDecreasingLabel"),
      reason: t("server.alternatives.todesfall_decreasing"),
    });
  }
  if (need.gap === "retirement" && (profile.pillar2.maxBuyIn ?? 0) > 0) {
    list.push({
      code: "pension_fund_buyin",
      label: t("server.alternatives.pensionFundBuyinLabel"),
      reason: t("server.alternatives.pension_fund_buyin"),
    });
  }
  return list;
}

function finalize(
  draft: Draft,
  quote: Quote,
  { t, chf }: SalesTexts,
): Omit<RecommendationView, "id"> {
  const input = quote.inputs;
  const durationYears = quote.durationYears ?? input.endAge - draft.insured.facts.age;
  const criteria = [...draft.criteria];
  if (draft.budget && quote.premiumAnnualGross > 0) {
    // Budget check on the priced premium; inserted before the company-rule criteria.
    criteria.splice(-1 - (draft.product.requiresSuitability ? 1 : 0), 0, {
      criterion: t("server.criteria.budget"),
      value: t("server.criteria.budgetValue", {
        budget: chf(draft.budget),
        premium: chf(quote.premiumAnnualGross),
      }),
      met: quote.premiumAnnualGross <= draft.budget,
    });
  }
  return {
    productCode: draft.product.code,
    productName: draft.product.name,
    pillar: input.pillar,
    gap: draft.need.gap,
    alsoCloses: draft.need.alsoCloses,
    headline: t(`server.headlines.${draft.need.gap}`),
    rationale: t(draft.rationaleKey, draft.rationaleParams),
    criteria,
    cover: {
      sumInsured: input.productCode === "todesfall" ? input.sumInsured : undefined,
      annualPension: input.annualPension,
      annualPremium: input.annualPremium,
      singlePremium: input.singlePremium,
      endAge: input.endAge,
      durationYears,
      waitingPeriodMonths: input.waitingPeriodMonths,
      occupationGroup: input.occupationGroup,
    },
    price: priceView(quote),
    requiresSuitability: draft.product.requiresSuitability,
    alternatives: draft.alternatives,
    flags: draft.flags,
    url: draft.product.url,
  };
}

/** Marks a recommendation as declined ("Nicht passend"). */
export function declineRecommendation(conversationId: string, recommendationId: string): boolean {
  const row = db
    .update(schema.recommendations)
    .set({ status: "declined" })
    .where(
      and(
        eq(schema.recommendations.id, recommendationId),
        eq(schema.recommendations.conversationId, conversationId),
        eq(schema.recommendations.status, "shown"),
      ),
    )
    .returning()
    .get();
  if (row) syncRecommendationCard(conversationId, recommendationId);
  return Boolean(row);
}

/** Writes the current statuses into the persisted recommendProducts output (card after reload). */
export function syncRecommendationCard(conversationId: string, recommendationId: string): void {
  const rec = db
    .select()
    .from(schema.recommendations)
    .where(eq(schema.recommendations.id, recommendationId))
    .get();
  const toolCallId = (rec?.parameters as { toolCallId?: string } | null)?.toolCallId;
  if (!toolCallId) return;
  const rows = db
    .select({ id: schema.recommendations.id, status: schema.recommendations.status })
    .from(schema.recommendations)
    .where(eq(schema.recommendations.conversationId, conversationId))
    .all();
  patchToolOutput(conversationId, toolCallId, {
    statuses: Object.fromEntries(rows.map((r) => [r.id, r.status])),
  });
}

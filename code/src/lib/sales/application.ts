import "server-only";
import { randomInt } from "node:crypto";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import type { ToolContext } from "@/lib/advisor/tools/context";
import { audit } from "@/lib/audit";
import { db, schema } from "@/lib/db";
import { PRODUCTS } from "@/lib/domain/products";
import { publish } from "@/lib/events/bus";
import { quotePremium } from "@/lib/pricing";
import { addYears, contractStartDate } from "@/lib/pricing/limits";
import { applyProfileChanges, getProfile } from "@/lib/profile/service";
import { formatChf } from "@/lib/utils";
import { type OfferInputs, offerDiffers, offerInputs } from "./offer-inputs";
import { type RecommendationParameters, syncRecommendationCard } from "./recommend";
import { advanceConversationStage } from "./stage";
import {
  GUARANTEE_RANGE,
  isSuitabilityProduct,
  SUITABILITY_PRODUCTS,
  type SuitabilityAnswers,
  scoreSuitability,
} from "./suitability";
import type {
  ContactPrefill,
  OfferOutput,
  OfferView,
  PriceView,
  SignedInfo,
  SuitabilityOutput,
  SuitabilityRecord,
} from "./types";

type Recommendation = typeof schema.recommendations.$inferSelect;
type Application = typeof schema.applications.$inferSelect;
type Customer = typeof schema.customers.$inferSelect;

function recommendation(conversationId: string, id: string): Recommendation | undefined {
  return db
    .select()
    .from(schema.recommendations)
    .where(
      and(
        eq(schema.recommendations.id, id),
        eq(schema.recommendations.conversationId, conversationId),
      ),
    )
    .get();
}

function parametersOf(rec: Recommendation): RecommendationParameters {
  return rec.parameters as unknown as RecommendationParameters;
}

/** The newest application of this conversation for the recommendation (or product). */
function applicationFor(
  conversationId: string,
  productCode: Recommendation["productCode"],
  recommendationId: string | null,
) {
  return db
    .select()
    .from(schema.applications)
    .where(
      and(
        eq(schema.applications.conversationId, conversationId),
        eq(schema.applications.productCode, productCode),
        recommendationId
          ? or(
              eq(schema.applications.recommendationId, recommendationId),
              isNull(schema.applications.recommendationId),
            )
          : isNull(schema.applications.recommendationId),
      ),
    )
    .orderBy(desc(schema.applications.createdAt))
    .get();
}

export function ownedApplication(
  conversationId: string,
  applicationId: string,
): Application | undefined {
  return db
    .select()
    .from(schema.applications)
    .where(
      and(
        eq(schema.applications.id, applicationId),
        eq(schema.applications.conversationId, conversationId),
      ),
    )
    .get();
}

// ─── Suitability ────────────────────────────────────────────────────────────

export const suitabilityInputSchema = z.object({
  recommendationId: z
    .string()
    .optional()
    .describe("Id of the unit-linked recommendation returned by recommendProducts"),
  productCode: z.enum(SUITABILITY_PRODUCTS).describe("lifestar, fondsstar or auszahlungsplan"),
});
export type SuitabilityInput = z.infer<typeof suitabilityInputSchema>;

/** Opens (or reopens) the draft application that carries the suitability check. */
export function startSuitabilityCheck(
  ctx: ToolContext,
  input: SuitabilityInput,
): SuitabilityOutput {
  const rec = input.recommendationId
    ? recommendation(ctx.conversationId, input.recommendationId)
    : undefined;
  const productCode = rec?.productCode ?? input.productCode;
  const product = PRODUCTS[productCode];
  if (!isSuitabilityProduct(productCode)) {
    return {
      status: "not_applicable",
      applicationId: null,
      recommendationId: rec?.id ?? null,
      productCode,
      productName: product.name,
      plannedAnnualPremium: null,
      plannedSinglePremium: null,
      guarantee: null,
    };
  }
  const params = rec ? parametersOf(rec) : undefined;
  let app = applicationFor(ctx.conversationId, productCode, rec?.id ?? null);
  if (!app || app.status !== "draft") {
    [app] = db
      .insert(schema.applications)
      .values({
        customerId: ctx.customerId,
        conversationId: ctx.conversationId,
        recommendationId: rec?.id,
        productCode,
        offer: { step: "suitability", productCode },
      })
      .returning()
      .all();
  }
  return {
    status: "ok",
    applicationId: app.id,
    recommendationId: rec?.id ?? null,
    productCode,
    productName: product.name,
    plannedAnnualPremium: params?.quoteInput.annualPremium ?? null,
    plannedSinglePremium: params?.quoteInput.singlePremium ?? null,
    guarantee: GUARANTEE_RANGE[productCode],
    record: (app.suitability as SuitabilityRecord | null) ?? undefined,
  };
}

export function saveSuitability(
  customerId: string,
  app: Application,
  answers: SuitabilityAnswers,
  fund: string,
): SuitabilityRecord | null {
  if (!isSuitabilityProduct(app.productCode) || app.status !== "draft") return null;
  const range = GUARANTEE_RANGE[app.productCode];
  const guaranteed = Math.min(range.max, Math.max(range.min, answers.guaranteedSharePercent));
  const normalized = { ...answers, guaranteedSharePercent: guaranteed };
  const result = scoreSuitability(normalized, app.productCode);
  const record: SuitabilityRecord = {
    answers: normalized,
    result,
    fund: result.funds.includes(fund) ? fund : result.suggestedFund,
    completedAt: new Date().toISOString(),
  };
  db.update(schema.applications)
    .set({ suitability: record as unknown as Record<string, unknown> })
    .where(eq(schema.applications.id, app.id))
    .run();
  audit({
    actorType: "customer",
    actorId: customerId,
    action: "suitability.completed",
    entityType: "application",
    entityId: app.id,
    data: {
      total: result.total,
      profile: result.profile,
      suitable: result.suitable,
      fund: record.fund,
    },
  });
  return record;
}

// ─── Offer ──────────────────────────────────────────────────────────────────

export const offerInputSchema = z.object({
  recommendationId: z.string().describe("Id of the recommendation the customer wants an offer for"),
});
export type OfferInput = z.infer<typeof offerInputSchema>;

function contactOf(customer: Customer): ContactPrefill {
  return {
    firstName: customer.firstName ?? "",
    lastName: customer.lastName ?? "",
    birthDate: customer.birthDate ?? "",
    email: customer.email ?? "",
    phone: customer.phone ?? "",
  };
}

function needsContact(customer: Customer): boolean {
  return !customer.firstName || !customer.lastName || !customer.email || !customer.birthDate;
}

function insuredName(params: RecommendationParameters, customer: Customer): string | null {
  if (params.insured.who === "partner") return params.insured.name;
  return [customer.firstName, customer.lastName].filter(Boolean).join(" ") || params.insured.name;
}

/** The insured facts known now (exact birth date, smoker status) applied to the recommendation. */
function currentInputs(rec: Recommendation, customer: Customer): OfferInputs {
  const params = parametersOf(rec);
  const profile = getProfile(customer.id);
  const person = params.insured.who === "partner" ? profile.partner : profile.person;
  return offerInputs(params.quoteInput, params.insured, {
    customerBirthDate: customer.birthDate,
    smoker: person?.smoker,
  });
}

/** Prices the recommendation with the given insured facts (and the suitability fund) as an offer. */
async function priceOffer(
  rec: Recommendation,
  customer: Customer,
  inputs: OfferInputs,
  suitability: SuitabilityRecord | undefined,
  context: { customerId: string; conversationId: string; toolCallId?: string },
): Promise<OfferView> {
  const params = parametersOf(rec);
  const product = PRODUCTS[rec.productCode];
  const quoteInput = { ...inputs.input };
  if (suitability) {
    quoteInput.fundName = suitability.fund;
    if (rec.productCode !== "fondsstar")
      quoteInput.guaranteedSharePercent = suitability.answers.guaranteedSharePercent;
    if (suitability.answers.annualPremium)
      quoteInput.annualPremium = suitability.answers.annualPremium;
    if (suitability.answers.singlePremium)
      quoteInput.singlePremium = suitability.answers.singlePremium;
  }
  const quote = await quotePremium(quoteInput, context);
  const startDate = quote.startDate ?? contractStartDate(new Date());
  const durationYears = quote.durationYears ?? params.cover.durationYears;
  const price: PriceView = {
    ...params.price,
    annualGross: quote.premiumAnnualGross,
    annualNet: quote.premiumAnnualNet,
    source: quote.source,
    singlePremium: quote.singlePremium,
    maturity: quote.maturity,
    payoutAnnual: quote.payoutAnnual,
    riders: quote.riders,
    startDate,
    durationYears,
    fundName: quote.fundName ?? suitability?.fund,
    guaranteedSharePercent: quote.guaranteedSharePercent,
    issues: quote.issues,
  };
  return {
    productCode: rec.productCode,
    productName: product.name,
    pillar: rec.pillar,
    insured: {
      who: params.insured.who,
      name: insuredName(params, customer),
      birthDate: quote.inputs.birthDate,
      sex: quote.inputs.sex,
      smoker: quote.inputs.smoker,
      birthDateAssumed: inputs.birthDateAssumed,
      smokerAssumed: inputs.smokerAssumed,
    },
    cover: {
      ...params.cover,
      endAge: quote.inputs.endAge,
      annualPremium: quote.inputs.annualPremium,
      singlePremium: quote.inputs.singlePremium,
      durationYears,
    },
    price,
    startDate,
    endDate: addYears(startDate, durationYears),
    fund: price.fundName,
    guaranteedSharePercent: price.guaranteedSharePercent,
    suitability: suitability
      ? { total: suitability.result.total, profile: suitability.result.profile }
      : undefined,
  };
}

/** Prices the chosen recommendation (with the fund from the suitability check) as an offer. */
export async function prepareOffer(
  ctx: ToolContext,
  input: OfferInput,
  toolCallId?: string,
): Promise<OfferOutput> {
  const customer = db.query.customers
    .findFirst({ where: eq(schema.customers.id, ctx.customerId) })
    .sync();
  const rec = recommendation(ctx.conversationId, input.recommendationId);
  const empty: OfferOutput = {
    status: "not_found",
    applicationId: null,
    recommendationId: input.recommendationId,
    offer: null,
    needsContact: false,
    contact: { firstName: "", lastName: "", birthDate: "", email: "", phone: "" },
  };
  if (!rec || !customer) return empty;
  const contact = contactOf(customer);
  const product = PRODUCTS[rec.productCode];
  let app = applicationFor(ctx.conversationId, rec.productCode, rec.id);

  if (app?.status === "signed" && app.policyId) {
    const policy = db
      .select()
      .from(schema.policies)
      .where(eq(schema.policies.id, app.policyId))
      .get();
    return {
      ...empty,
      status: "ok",
      applicationId: app.id,
      offer: app.offer as unknown as OfferView,
      contact,
      signed: {
        policyId: app.policyId,
        policyNumber: policy?.policyNumber ?? "",
        startDate: policy?.startDate ?? "",
        inReview: policy?.status === "offer",
      },
    };
  }

  const suitability = (app?.suitability as SuitabilityRecord | null) ?? undefined;
  if (product.requiresSuitability) {
    if (!suitability)
      return { ...empty, status: "suitability_required", applicationId: app?.id ?? null, contact };
    if (!suitability.result.suitable)
      return { ...empty, status: "not_suitable", applicationId: app?.id ?? null, contact };
  }

  const offer = await priceOffer(rec, customer, currentInputs(rec, customer), suitability, {
    customerId: ctx.customerId,
    conversationId: ctx.conversationId,
    toolCallId,
  });
  const price = offer.price;

  if (app && app.status === "draft") {
    db.update(schema.applications)
      .set({
        offer: offer as unknown as Record<string, unknown>,
        premiumAnnual: price.annualGross,
        recommendationId: rec.id,
      })
      .where(eq(schema.applications.id, app.id))
      .run();
  } else {
    [app] = db
      .insert(schema.applications)
      .values({
        customerId: ctx.customerId,
        conversationId: ctx.conversationId,
        recommendationId: rec.id,
        productCode: rec.productCode,
        offer: offer as unknown as Record<string, unknown>,
        premiumAnnual: price.annualGross,
      })
      .returning()
      .all();
  }
  audit({
    actorType: "ai",
    action: "offer.prepared",
    entityType: "application",
    entityId: app.id,
    data: {
      recommendationId: rec.id,
      productCode: rec.productCode,
      premiumAnnual: price.annualGross,
      source: price.source,
    },
  });
  advanceConversationStage(ctx.conversationId, "offer_viewed");

  return {
    status: "ok",
    applicationId: app.id,
    recommendationId: rec.id,
    offer,
    needsContact: needsContact(customer) || Boolean(offer.insured.smokerAssumed),
    contact,
  };
}

// ─── Contact details and signature ──────────────────────────────────────────

export const contactSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  birthDate: z.iso.date().refine((d) => {
    const year = Number(d.slice(0, 4));
    const now = new Date().getUTCFullYear();
    return year >= now - 100 && year <= now - 18;
  }, "age"),
  email: z.email().max(200),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{6,20}$/),
});
export type ContactInput = z.infer<typeof contactSchema>;

/**
 * Contact details make an anonymous visitor a prospect. The birth date also corrects the birth
 * year in the profile (the chat only knew the year, or a wrong one).
 */
export function saveContact(
  customer: Customer,
  conversationId: string,
  contact: ContactInput,
): void {
  db.update(schema.customers)
    .set({
      ...contact,
      lifecycle: customer.lifecycle === "anonymous" ? "prospect" : customer.lifecycle,
    })
    .where(eq(schema.customers.id, customer.id))
    .run();
  applyProfileChanges(
    customer.id,
    [{ path: "person.birthYear", value: Number(contact.birthDate.slice(0, 4)) }],
    { source: "form", conversationId },
  );
  audit({
    actorType: "customer",
    actorId: customer.id,
    action: "customer.contact_saved",
    entityType: "customer",
    entityId: customer.id,
    data: { conversationId, lifecycleBefore: customer.lifecycle },
  });
  advanceConversationStage(conversationId, "application_started");
}

/**
 * After the application form: stores the insured person's smoker status in the profile and
 * re-prices the draft offer if the birth date or smoker status differ from the priced ones.
 * Returns the offer as it now stands (null if the application cannot change any more).
 */
export async function updateOfferDetails(
  customerId: string,
  conversationId: string,
  app: Application,
  smoker: boolean,
): Promise<{ offer: OfferView; repriced: boolean } | null> {
  if (app.status !== "draft" || !app.recommendationId) return null;
  const rec = recommendation(conversationId, app.recommendationId);
  const customer = db.query.customers
    .findFirst({ where: eq(schema.customers.id, customerId) })
    .sync();
  const current = app.offer as unknown as OfferView;
  if (!rec || !customer || !current?.price) return null;
  const who = parametersOf(rec).insured.who === "partner" ? "partner" : "person";
  applyProfileChanges(customerId, [{ path: `${who}.smoker`, value: smoker }], {
    source: "form",
    conversationId,
  });
  const inputs = currentInputs(rec, customer);
  const repriced = offerDiffers(current, inputs);
  const offer: OfferView = repriced
    ? await priceOffer(
        rec,
        customer,
        inputs,
        (app.suitability as SuitabilityRecord | null) ?? undefined,
        { customerId, conversationId },
      )
    : {
        ...current,
        insured: {
          ...current.insured,
          birthDateAssumed: inputs.birthDateAssumed,
          smokerAssumed: inputs.smokerAssumed,
        },
      };
  db.update(schema.applications)
    .set({
      offer: offer as unknown as Record<string, unknown>,
      premiumAnnual: offer.price.annualGross,
    })
    .where(eq(schema.applications.id, app.id))
    .run();
  if (repriced) {
    audit({
      actorType: "customer",
      actorId: customerId,
      action: "offer.repriced",
      entityType: "application",
      entityId: app.id,
      data: {
        birthDate: { before: current.insured.birthDate, after: offer.insured.birthDate },
        smoker: { before: current.insured.smoker, after: offer.insured.smoker },
        premiumAnnual: { before: current.price.annualGross, after: offer.price.annualGross },
        source: offer.price.source,
      },
    });
  }
  return { offer, repriced };
}

export const consentSchema = z.object({
  offerRead: z.literal(true),
  dataCorrect: z.literal(true),
  demoUnderstood: z.literal(true),
});

export type SignError =
  | "not_found"
  | "already_signed"
  | "offer_outdated"
  | "suitability_missing"
  | "contact_missing"
  | "signature_mismatch";

const normalizeName = (s: string) =>
  s.normalize("NFKC").toLocaleLowerCase("de-CH").replace(/\s+/g, " ").trim();

function policyNumber(startDate: string): string {
  return `PAX-${startDate.slice(0, 4)}-${randomInt(100_000, 1_000_000)}`;
}

/**
 * Demo signature: the typed name must match the customer. Signing submits the application: the
 * Pax policy is created "in review" (status `offer`) and a handover asks a Pax advisor to check
 * and release it ({@link approveApplication}). Only the release activates the policy.
 */
export function signApplication(
  customerId: string,
  conversationId: string,
  applicationId: string,
  signatureName: string,
): { ok: true; signed: SignedInfo } | { ok: false; error: SignError } {
  const app = ownedApplication(conversationId, applicationId);
  const customer = db.query.customers
    .findFirst({ where: eq(schema.customers.id, customerId) })
    .sync();
  if (!app || !customer || app.customerId !== customerId) return { ok: false, error: "not_found" };
  if (app.status !== "draft") return { ok: false, error: "already_signed" };
  const offer = app.offer as unknown as OfferView;
  if (!offer?.price) return { ok: false, error: "not_found" };
  const product = PRODUCTS[app.productCode];
  const suitability = app.suitability as SuitabilityRecord | null;
  if (product.requiresSuitability && !suitability?.result.suitable)
    return { ok: false, error: "suitability_missing" };
  if (!customer.firstName || !customer.lastName) return { ok: false, error: "contact_missing" };
  if (normalizeName(signatureName) !== normalizeName(`${customer.firstName} ${customer.lastName}`))
    return { ok: false, error: "signature_mismatch" };
  const rec = app.recommendationId
    ? recommendation(conversationId, app.recommendationId)
    : undefined;
  // Never sign a premium computed for another birth date or smoker status than the ones on file.
  if (rec && offerDiffers(offer, currentInputs(rec, customer)))
    return { ok: false, error: "offer_outdated" };

  // The offer's start (e.g. 1 January when this year's 3a room is used), never earlier than
  // the first of next month.
  const now = new Date();
  const earliest = contractStartDate(now);
  const startDate = offer.startDate && offer.startDate > earliest ? offer.startDate : earliest;
  const years = offer.cover.durationYears;
  const number = policyNumber(startDate);
  const params = rec ? parametersOf(rec) : undefined;
  const category =
    product.category === "pillar3a" && offer.pillar === "3b" ? "savings_3b" : product.category;

  const policy = db.transaction((tx) => {
    const [row] = tx
      .insert(schema.policies)
      .values({
        customerId,
        policyNumber: number,
        insurer: "Pax",
        isExternal: false,
        category,
        productCode: app.productCode,
        productName: product.name,
        pillar: offer.pillar,
        status: "offer",
        startDate,
        endDate: years ? addYears(startDate, years) : null,
        premiumAnnual: offer.price.annualGross,
        sumInsured: offer.cover.sumInsured ?? null,
        annuityAnnual: offer.cover.annualPension ?? offer.price.payoutAnnual?.medium ?? null,
        insuredPerson: params
          ? insuredName(params, customer)
          : `${customer.firstName} ${customer.lastName}`,
        details: {
          premiumNet: offer.price.annualNet,
          priceSource: offer.price.source,
          singlePremium: offer.price.singlePremium,
          riders: offer.price.riders,
          maturity: offer.price.maturity,
          payoutAnnual: offer.price.payoutAnnual,
          fund: offer.fund,
          guaranteedSharePercent: offer.guaranteedSharePercent,
          waitingPeriodMonths: offer.cover.waitingPeriodMonths,
          durationYears: years,
          recommendationId: app.recommendationId,
          signatureName,
          demoSignature: true,
        },
        source: "chat",
        applicationId: app.id,
      })
      .returning()
      .all();
    tx.update(schema.applications)
      .set({ status: "signed", signatureName, signedAt: now, policyId: row.id })
      .where(eq(schema.applications.id, app.id))
      .run();
    const handover = tx
      .insert(schema.handovers)
      .values({
        conversationId,
        customerId,
        reason: reviewReason(product.name, number, offer),
        ruleIds: [],
      })
      .returning()
      .get();
    tx.update(schema.policies)
      .set({ details: { ...row.details, reviewHandoverId: handover.id } })
      .where(eq(schema.policies.id, row.id))
      .run();
    if (app.recommendationId) {
      tx.update(schema.recommendations)
        .set({ status: "accepted" })
        .where(eq(schema.recommendations.id, app.recommendationId))
        .run();
    }
    return { ...row, handoverId: handover.id };
  });

  audit({
    actorType: "customer",
    actorId: customerId,
    action: "application.signed",
    entityType: "application",
    entityId: app.id,
    data: {
      policyId: policy.id,
      policyNumber: number,
      productCode: app.productCode,
      demoSignature: true,
    },
  });
  audit({
    actorType: "system",
    action: "policy.created",
    entityType: "policy",
    entityId: policy.id,
    data: { applicationId: app.id, source: "chat", lifecycleBefore: customer.lifecycle },
  });
  audit({
    actorType: "system",
    action: "handover.requested",
    entityType: "handover",
    entityId: policy.handoverId,
    data: { reason: "application_review", applicationId: app.id, policyId: policy.id },
  });
  advanceConversationStage(conversationId, "signed");
  if (app.recommendationId) syncRecommendationCard(conversationId, app.recommendationId);
  publish({ type: "policy.created", policyId: policy.id, customerId });
  publish({ type: "handover.created", handoverId: policy.handoverId, conversationId });
  return {
    ok: true,
    signed: { policyId: policy.id, policyNumber: number, startDate, inReview: true },
  };
}

/** What the advisor team reads in the handover queue for a signed application. */
function reviewReason(productName: string, number: string, offer: OfferView): string {
  const premium = formatChf(offer.price.annualGross, "de");
  const single = offer.price.singlePremium
    ? `, Einmalanlage ${formatChf(offer.price.singlePremium, "de")}`
    : "";
  return `Antrag ${productName} unterschrieben (Police ${number}, Prämie ${premium} pro Jahr${single}). Bitte Beträge und Angaben prüfen und den Antrag freigeben oder mit der Kundin oder dem Kunden anpassen.`;
}

export type ApproveError = "not_found" | "not_in_review";

/**
 * A Pax advisor releases a signed application after checking it: the policy becomes active,
 * the customer a client, and the review handover is closed.
 */
export function approveApplication(
  advisorId: string,
  applicationId: string,
): { ok: true } | { ok: false; error: ApproveError } {
  const app = db
    .select()
    .from(schema.applications)
    .where(eq(schema.applications.id, applicationId))
    .get();
  if (!app || app.status !== "signed" || !app.policyId) return { ok: false, error: "not_found" };
  const policy = db
    .select()
    .from(schema.policies)
    .where(eq(schema.policies.id, app.policyId))
    .get();
  if (!policy) return { ok: false, error: "not_found" };
  if (policy.status !== "offer") return { ok: false, error: "not_in_review" };
  const handoverId =
    typeof policy.details?.reviewHandoverId === "string" ? policy.details.reviewHandoverId : null;
  const customer = db
    .select({ lifecycle: schema.customers.lifecycle })
    .from(schema.customers)
    .where(eq(schema.customers.id, app.customerId))
    .get();

  db.transaction((tx) => {
    tx.update(schema.policies)
      .set({
        status: "active",
        details: { ...policy.details, approvedBy: advisorId, approvedAt: new Date().toISOString() },
      })
      .where(eq(schema.policies.id, policy.id))
      .run();
    tx.update(schema.customers)
      .set({ lifecycle: "client" })
      .where(eq(schema.customers.id, app.customerId))
      .run();
    if (handoverId) {
      tx.update(schema.handovers)
        .set({ status: "done", assignedAdvisorId: advisorId })
        .where(eq(schema.handovers.id, handoverId))
        .run();
    }
  });

  audit({
    actorType: "advisor",
    actorId: advisorId,
    action: "application.approved",
    entityType: "application",
    entityId: app.id,
    data: {
      policyId: policy.id,
      policyNumber: policy.policyNumber,
      handoverId,
      lifecycleBefore: customer?.lifecycle,
    },
  });
  if (app.conversationId)
    publish({ type: "conversation.updated", conversationId: app.conversationId });
  publish({ type: "policy.created", policyId: policy.id, customerId: app.customerId });
  return { ok: true };
}

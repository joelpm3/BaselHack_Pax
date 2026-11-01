import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "@/lib/db";
import type { ProductCode } from "@/lib/domain/products";
import { contractStartDate } from "@/lib/pricing/limits";
import { approveApplication, signApplication } from "./application";
import type { OfferView } from "./types";

// Runs against the per-file test database (vitest.setup.ts).

let customerId: string;
let conversationId: string;

beforeEach(() => {
  customerId = randomUUID();
  conversationId = randomUUID();
  db.insert(schema.customers)
    .values({ id: customerId, firstName: "Anna", lastName: "Müller", lifecycle: "prospect" })
    .run();
  db.insert(schema.conversations)
    .values({ id: conversationId, customerId, mode: "new_business", stage: "application_started" })
    .run();
});

const offer = (overrides: Partial<OfferView> = {}): OfferView => ({
  productCode: "todesfall",
  productName: "Pax Todesfallversicherung",
  pillar: "3b",
  insured: {
    who: "self",
    name: "Anna Müller",
    birthDate: "1990-01-01",
    sex: "female",
    smoker: false,
  },
  cover: { sumInsured: 200_000, endAge: 65, durationYears: 20 },
  price: { annualGross: 480, annualNet: 410, source: "estimate", riders: [], issues: [] },
  startDate: "2099-01-01",
  endDate: "2119-01-01",
  ...overrides,
});

function draftApplication(
  productCode: ProductCode = "todesfall",
  view = offer(),
  suitability?: Record<string, unknown>,
) {
  const id = randomUUID();
  db.insert(schema.applications)
    .values({
      id,
      customerId,
      conversationId,
      productCode,
      offer: view as unknown as Record<string, unknown>,
      suitability,
    })
    .run();
  return id;
}

const applicationRow = (id: string) =>
  db.select().from(schema.applications).where(eq(schema.applications.id, id)).get();
const policyRow = (id: string) =>
  db.select().from(schema.policies).where(eq(schema.policies.id, id)).get();
const customerRow = () =>
  db.select().from(schema.customers).where(eq(schema.customers.id, customerId)).get();

describe("signApplication", () => {
  it("submits the policy for review instead of activating it", () => {
    const appId = draftApplication();
    const result = signApplication(customerId, conversationId, appId, "Anna Müller");
    if (!result.ok) throw new Error(result.error);
    expect(result.signed).toMatchObject({ inReview: true, startDate: "2099-01-01" });
    expect(result.signed.policyNumber).toMatch(/^PAX-2099-\d{6}$/);

    const policy = policyRow(result.signed.policyId);
    expect(policy).toMatchObject({
      status: "offer",
      productCode: "todesfall",
      category: "risk_death",
      premiumAnnual: 480,
      sumInsured: 200_000,
      endDate: "2119-01-01",
      applicationId: appId,
    });
    expect(applicationRow(appId)).toMatchObject({ status: "signed", policyId: policy?.id });
    // Only the advisor's release makes the customer a client.
    expect(customerRow()?.lifecycle).toBe("prospect");

    const handoverId = policy?.details?.reviewHandoverId;
    expect(typeof handoverId).toBe("string");
    const handover = db
      .select()
      .from(schema.handovers)
      .where(eq(schema.handovers.id, String(handoverId)))
      .get();
    expect(handover).toMatchObject({ status: "open", conversationId, customerId });
    expect(handover?.reason).toContain(result.signed.policyNumber);

    const conversation = db
      .select()
      .from(schema.conversations)
      .where(eq(schema.conversations.id, conversationId))
      .get();
    expect(conversation?.stage).toBe("signed");
  });

  it("accepts the name in any case and spacing, and rejects another name", () => {
    expect(
      signApplication(customerId, conversationId, draftApplication(), "  anna   MÜLLER ").ok,
    ).toBe(true);
    expect(signApplication(customerId, conversationId, draftApplication(), "Anna Meier")).toEqual({
      ok: false,
      error: "signature_mismatch",
    });
  });

  it("signs an application only once", () => {
    const appId = draftApplication();
    expect(signApplication(customerId, conversationId, appId, "Anna Müller").ok).toBe(true);
    expect(signApplication(customerId, conversationId, appId, "Anna Müller")).toEqual({
      ok: false,
      error: "already_signed",
    });
    expect(
      db.select().from(schema.policies).where(eq(schema.policies.customerId, customerId)).all(),
    ).toHaveLength(1);
  });

  it("does not let another customer or conversation sign the application", () => {
    const appId = draftApplication();
    const intruder = randomUUID();
    db.insert(schema.customers)
      .values({ id: intruder, firstName: "Anna", lastName: "Müller" })
      .run();
    expect(signApplication(intruder, conversationId, appId, "Anna Müller")).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(signApplication(customerId, randomUUID(), appId, "Anna Müller")).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(applicationRow(appId)?.status).toBe("draft");
  });

  it("requires the contact name before signing", () => {
    db.update(schema.customers)
      .set({ lastName: null })
      .where(eq(schema.customers.id, customerId))
      .run();
    expect(signApplication(customerId, conversationId, draftApplication(), "Anna")).toEqual({
      ok: false,
      error: "contact_missing",
    });
  });

  it("requires a passed suitability check for investment products", () => {
    const appId = draftApplication("fondsstar", offer({ productCode: "fondsstar", pillar: "3a" }));
    expect(signApplication(customerId, conversationId, appId, "Anna Müller")).toEqual({
      ok: false,
      error: "suitability_missing",
    });
  });

  it("files a savings product signed in pillar 3b as 3b savings", () => {
    const appId = draftApplication("lifestar", offer({ productCode: "lifestar", pillar: "3b" }), {
      result: { suitable: true },
    });
    const result = signApplication(customerId, conversationId, appId, "Anna Müller");
    if (!result.ok) throw new Error(result.error);
    expect(policyRow(result.signed.policyId)).toMatchObject({
      category: "savings_3b",
      pillar: "3b",
    });
  });

  it("never starts the contract before the first of next month", () => {
    const appId = draftApplication("todesfall", offer({ startDate: "2020-01-01" }));
    const result = signApplication(customerId, conversationId, appId, "Anna Müller");
    if (!result.ok) throw new Error(result.error);
    expect(result.signed.startDate).toBe(contractStartDate(new Date()));
  });
});

describe("approveApplication", () => {
  let advisorId: string;

  beforeEach(() => {
    advisorId = randomUUID();
    db.insert(schema.advisors)
      .values({ id: advisorId, name: "Lea Advisor", email: "lea@pax.test", team: "sales" })
      .run();
  });

  function signed() {
    const appId = draftApplication();
    const result = signApplication(customerId, conversationId, appId, "Anna Müller");
    if (!result.ok) throw new Error(result.error);
    return { appId, policyId: result.signed.policyId };
  }

  it("activates the policy, makes the customer a client and closes the review", () => {
    const { appId, policyId } = signed();
    expect(approveApplication(advisorId, appId)).toEqual({ ok: true });

    const policy = policyRow(policyId);
    expect(policy?.status).toBe("active");
    expect(policy?.details).toMatchObject({ approvedBy: advisorId });
    expect(customerRow()?.lifecycle).toBe("client");
    const handover = db
      .select()
      .from(schema.handovers)
      .where(eq(schema.handovers.id, String(policy?.details?.reviewHandoverId)))
      .get();
    expect(handover).toMatchObject({ status: "done", assignedAdvisorId: advisorId });
  });

  it("releases a policy only once", () => {
    const { appId } = signed();
    approveApplication(advisorId, appId);
    expect(approveApplication(advisorId, appId)).toEqual({ ok: false, error: "not_in_review" });
  });

  it("does not release an application that was never signed", () => {
    expect(approveApplication(advisorId, draftApplication())).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(customerRow()?.lifecycle).toBe("prospect");
  });
});

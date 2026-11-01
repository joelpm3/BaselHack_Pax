import { describe, expect, it } from "vitest";
import type { schema } from "@/lib/db";
import type { OfferView } from "@/lib/sales/types";
import {
  beneficiariesOf,
  type ContractSources,
  contractDocument,
  contractDocumentsFor,
} from "./mapping";

type Policy = typeof schema.policies.$inferSelect;
type Application = typeof schema.applications.$inferSelect;
type Customer = typeof schema.customers.$inferSelect;

const now = new Date("2026-11-01T10:00:00Z");

const policy: Policy = {
  id: "pol-1",
  customerId: "cus-1",
  policyNumber: "PAX-2026-123456",
  insurer: "Pax",
  isExternal: false,
  category: "risk_death",
  productCode: "todesfall",
  productName: "Pax Todesfallversicherung",
  pillar: "3b",
  status: "offer",
  startDate: "2026-12-01",
  endDate: "2046-12-01",
  noticeDate: null,
  premiumAnnual: 384.2,
  sumInsured: 300000,
  annuityAnnual: null,
  insuredPerson: "Max Muster",
  details: {},
  source: "chat",
  documentId: null,
  applicationId: "app-1",
  createdAt: now,
  updatedAt: now,
};

const customer: Customer = {
  id: "cus-1",
  lifecycle: "prospect",
  firstName: "Max",
  lastName: "Muster",
  email: "max@example.ch",
  phone: null,
  birthDate: "1987-01-01",
  locale: "fr",
  isSimulated: false,
  isDemo: false,
  createdAt: now,
  updatedAt: now,
  lastSeenAt: null,
};

const offer = {
  productCode: "todesfall",
  productName: "Pax Todesfallversicherung",
  pillar: "3b",
  insured: { who: "self", name: "Max Muster", birthDate: "1987-01-01", sex: "male", smoker: false },
  cover: { sumInsured: 300000, endAge: 59, durationYears: 20 },
  price: { annualGross: 384.2, annualNet: 350, source: "quicksale", riders: [], issues: [] },
  startDate: "2026-11-01",
  endDate: "2046-11-01",
} satisfies OfferView;

const application: Application = {
  id: "app-1",
  customerId: "cus-1",
  conversationId: "conv-1",
  recommendationId: null,
  productCode: "todesfall",
  offer: offer as unknown as Record<string, unknown>,
  suitability: null,
  premiumAnnual: 384.2,
  status: "signed",
  signatureName: "Max Muster",
  signedAt: now,
  policyId: "pol-1",
  createdAt: now,
  updatedAt: now,
};

const sources: ContractSources = {
  policy,
  customer,
  place: "4051 Basel",
  application,
  recommendation: null,
  advisorName: null,
  today: "2026-11-02",
};

describe("contractDocumentsFor", () => {
  it("offers the Antrag once signed and the Police once active", () => {
    expect(contractDocumentsFor(policy)).toEqual(["offer"]);
    expect(contractDocumentsFor({ ...policy, status: "active" })).toEqual(["offer", "policy"]);
    expect(contractDocumentsFor({ ...policy, status: "active", applicationId: null })).toEqual([
      "policy",
    ]);
    expect(contractDocumentsFor({ ...policy, status: "cancelled" })).toEqual([]);
    expect(contractDocumentsFor({ ...policy, status: "active", isExternal: true })).toEqual([]);
  });
});

describe("contractDocument", () => {
  it("builds the Antrag from the signed offer, with the policy's final dates", () => {
    const doc = contractDocument("offer", sources);
    expect(doc?.kind).toBe("offer");
    expect(doc?.locale).toBe("fr");
    expect(doc?.policyholder).toMatchObject({ name: "Max Muster", place: "4051 Basel" });
    expect(doc?.coverage).toMatchObject({
      sumInsured: 300000,
      premiumAnnual: 384.2,
      premiumNet: 350,
      startDate: "2026-12-01",
      priceSource: "quicksale",
    });
    expect(doc?.kind === "offer" && doc.signature.signedAt).toBe(now.toISOString());
  });

  it("has no Police before the release and no Antrag without a signature", () => {
    expect(contractDocument("policy", sources)).toBeNull();
    expect(
      contractDocument("offer", { ...sources, application: { ...application, status: "draft" } }),
    ).toBeNull();
  });

  it("builds the Police of a seeded policy from the policy row", () => {
    const seeded = {
      ...policy,
      status: "active" as const,
      applicationId: null,
      details: { approvedAt: "2026-11-02T09:00:00Z", riders: [{ name: "X", premiumAnnual: 0 }] },
    };
    const doc = contractDocument("policy", {
      ...sources,
      policy: seeded,
      application: null,
      advisorName: "Sandra Keller",
    });
    expect(doc?.kind).toBe("policy");
    expect(doc?.coverage).toMatchObject({ sumInsured: 300000, premiumAnnual: 384.2 });
    expect(doc?.coverage.riders).toHaveLength(1);
    expect(doc?.kind === "policy" && doc.approval).toEqual({
      advisorName: "Sandra Keller",
      approvedAt: "2026-11-02T09:00:00Z",
    });
  });
});

describe("beneficiariesOf", () => {
  it("reads text or a list from the policy details", () => {
    expect(beneficiariesOf({ ...policy, details: { beneficiaries: "Ehefrau" } })).toEqual([
      "Ehefrau",
    ]);
    expect(beneficiariesOf({ ...policy, details: { beneficiaries: ["A", " ", "B"] } })).toEqual([
      "A",
      "B",
    ]);
    expect(beneficiariesOf(policy)).toEqual([]);
  });
});

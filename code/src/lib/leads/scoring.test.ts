import { describe, expect, it } from "vitest";
import {
  determineLeadType,
  externalPolicyState,
  gapPoints,
  type LeadScoreInput,
  type LeadTypeInput,
  leadPriority,
  scoreLead,
} from "./scoring";

const base: LeadScoreInput = {
  type: "new_business",
  intentStage: "informing",
  gaps: [],
  productInterest: [],
  lifecycle: "anonymous",
  hasContactDetails: false,
  stage: "started",
  mode: "new_business",
  handover: null,
};

describe("scoreLead", () => {
  it("gives an anonymous, merely curious visitor a zero score", () => {
    expect(scoreLead(base)).toEqual({ score: 0, breakdown: [] });
  });

  it("scores a ready young family with a large gap highly and explains every point", () => {
    const result = scoreLead({
      ...base,
      intentStage: "ready",
      gaps: [
        { gap: "death", amountAnnual: 20_660, note: "" },
        { gap: "retirement", amountAnnual: 33_827, note: "" },
      ],
      productInterest: [
        { productCode: "todesfall", strength: "high" },
        { productCode: "pax3a", strength: "low" },
      ],
      hasContactDetails: true,
      lifecycle: "prospect",
      stage: "offer_viewed",
    });
    expect(result.breakdown.map((b) => b.factor)).toEqual([
      "intent",
      "gap",
      "product",
      "contact",
      "stage",
    ]);
    expect(result.breakdown.find((b) => b.factor === "gap")?.note).toBe("54487");
    expect(result.breakdown.find((b) => b.factor === "product")?.note).toBe("todesfall:high");
    // 30 intent + 20 gap + 15 product + 10 contact + round(6/8*15)=11 stage
    expect(result.score).toBe(86);
    expect(result.score).toBe(result.breakdown.reduce((s, b) => s + b.points, 0));
  });

  it("caps at 100", () => {
    const result = scoreLead({
      ...base,
      type: "switch_opportunity",
      intentStage: "ready",
      gaps: [{ gap: "retirement", amountAnnual: 50_000, note: "" }],
      productInterest: [{ productCode: "lifestar", strength: "high" }],
      lifecycle: "client",
      stage: "signed",
      mode: "existing_customer",
      handover: { required: true, urgency: "high" },
    });
    expect(result.score).toBe(100);
  });

  it("ignores gaps and products for service leads", () => {
    const result = scoreLead({
      ...base,
      type: "service",
      gaps: [{ gap: "death", amountAnnual: 40_000, note: "" }],
      productInterest: [{ productCode: "todesfall", strength: "high" }],
      lifecycle: "client",
    });
    expect(result.breakdown.map((b) => b.factor)).toEqual(["service", "contact"]);
    expect(result.score).toBe(30);
  });
});

describe("gapPoints", () => {
  it("steps by annual amount and counts gaps without amounts a little", () => {
    expect(gapPoints([]).points).toBe(0);
    expect(gapPoints([{ gap: "death", amountAnnual: 2000, note: "" }]).points).toBe(5);
    expect(gapPoints([{ gap: "death", amountAnnual: 7200, note: "" }]).points).toBe(10);
    expect(gapPoints([{ gap: "death", amountAnnual: 17_940, note: "" }]).points).toBe(15);
    expect(gapPoints([{ gap: "death", amountAnnual: null, note: "" }]).points).toBe(4);
    expect(
      gapPoints([
        { gap: "death", amountAnnual: null, note: "" },
        { gap: "care", amountAnnual: null, note: "" },
        { gap: "child", amountAnnual: null, note: "" },
      ]).points,
    ).toBe(8);
  });
});

describe("leadPriority", () => {
  it("follows the score", () => {
    expect(leadPriority(10, null)).toBe("low");
    expect(leadPriority(40, null)).toBe("medium");
    expect(leadPriority(60, null)).toBe("high");
    expect(leadPriority(80, null)).toBe("urgent");
  });

  it("raises priority when a handover is open", () => {
    expect(leadPriority(10, { urgency: "normal" })).toBe("high");
    expect(leadPriority(80, { urgency: "normal" })).toBe("urgent");
    expect(leadPriority(10, { urgency: "high" })).toBe("urgent");
  });
});

describe("determineLeadType", () => {
  const input: LeadTypeInput = {
    lifecycle: "anonymous",
    hasPaxPolicy: false,
    externalPolicy: "none",
    intentStage: "informing",
    gaps: [],
    productInterest: [],
    serviceRequest: null,
  };
  const gap = { gap: "death" as const, amountAnnual: null, note: "" };

  it("creates no lead for general information without potential", () => {
    expect(determineLeadType(input)).toBeNull();
  });

  it("separates new business from upsell by client status", () => {
    const sales = { ...input, intentStage: "comparing" as const };
    expect(determineLeadType(sales)).toBe("new_business");
    expect(determineLeadType({ ...sales, lifecycle: "client" })).toBe("existing_upsell");
    expect(determineLeadType({ ...sales, hasPaxPolicy: true })).toBe("existing_upsell");
  });

  it("makes one switch lead, not two, when the customer talks about an external policy", () => {
    expect(
      determineLeadType({
        ...input,
        lifecycle: "client",
        externalPolicy: "discussed",
        gaps: [gap],
      }),
    ).toBe("switch_opportunity");
    expect(determineLeadType({ ...input, externalPolicy: "discussed" })).toBeNull();
  });

  it("keeps the sales lead when an external policy is only on file", () => {
    expect(
      determineLeadType({ ...input, lifecycle: "client", externalPolicy: "on_file", gaps: [gap] }),
    ).toBe("existing_upsell");
    expect(
      determineLeadType({ ...input, externalPolicy: "on_file", intentStage: "exploring" }),
    ).toBe("switch_opportunity");
  });

  it("never makes a switch lead without an external policy", () => {
    expect(
      determineLeadType({ ...input, lifecycle: "client", intentStage: "exploring", gaps: [gap] }),
    ).toBe("existing_upsell");
    expect(determineLeadType({ ...input, intentStage: "exploring" })).toBeNull();
  });

  it("does not treat a pension certificate or non-life cover as switchable", () => {
    const fund = { isExternal: true, category: "pension_fund" as const, status: "active" };
    const household = {
      isExternal: true,
      category: "nonlife_household" as const,
      status: "active",
    };
    const term = { isExternal: true, category: "risk_death" as const, status: "active" };
    expect(externalPolicyState([fund, household], null)).toBe("none");
    expect(externalPolicyState([fund], { category: "pension_fund" })).toBe("none");
    expect(externalPolicyState([fund, term], null)).toBe("on_file");
    expect(externalPolicyState([{ ...term, status: "ended" }], null)).toBe("none");
    expect(externalPolicyState([], { category: "pillar3a" })).toBe("discussed");
  });

  it("creates a service lead only without sales potential", () => {
    expect(determineLeadType({ ...input, serviceRequest: "Begünstigung ändern" })).toBe("service");
    expect(
      determineLeadType({
        ...input,
        serviceRequest: "Begünstigung ändern",
        productInterest: [{ productCode: "pax3a", strength: "medium" }],
      }),
    ).toBe("new_business");
  });
});

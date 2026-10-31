import { describe, expect, it } from "vitest";
import { type LeadRef, leadToUpdate } from "./merge";

const lead = (overrides: Partial<LeadRef>): LeadRef => ({
  id: "l",
  conversationId: "c1",
  type: "existing_upsell",
  status: "new",
  updatedAt: new Date(0),
  ...overrides,
});

describe("leadToUpdate", () => {
  it("updates this conversation's lead of the same type", () => {
    const own = lead({ id: "a", status: "won" });
    expect(leadToUpdate([own], "c1", "existing_upsell")).toBe(own);
  });

  it("re-types this conversation's open lead instead of adding a second one", () => {
    const upsell = lead({ id: "a" });
    expect(leadToUpdate([upsell], "c1", "switch_opportunity")).toBe(upsell);
    expect(leadToUpdate([lead({ id: "b", status: "lost" })], "c1", "switch_opportunity")).toBe(
      undefined,
    );
  });

  it("merges into the customer's open lead of that type from another conversation", () => {
    const older = lead({ id: "a", conversationId: "c0", updatedAt: new Date(1) });
    const newer = lead({ id: "b", conversationId: "c2", updatedAt: new Date(2) });
    const service = lead({ id: "s", conversationId: "c0", type: "service" });
    expect(leadToUpdate([older, newer, service], "c1", "existing_upsell")).toBe(newer);
    expect(leadToUpdate([service], "c1", "existing_upsell")).toBeUndefined();
    expect(leadToUpdate([{ ...older, status: "won" }], "c1", "existing_upsell")).toBeUndefined();
  });
});

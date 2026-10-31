import { describe, expect, it } from "vitest";
import { erasurePlan } from "./plan";

describe("erasurePlan", () => {
  it("removes a customer without contracts completely", () => {
    const plan = erasurePlan(
      [{ id: "ext", isExternal: true }],
      [{ id: "draft", status: "draft", policyId: null }],
    );
    expect(plan).toEqual({ scope: "full", keepPolicyIds: [], keepApplicationIds: [] });
  });

  it("keeps Pax policies and signed applications, drops external policies and drafts", () => {
    const plan = erasurePlan(
      [
        { id: "pax", isExternal: false },
        { id: "ext", isExternal: true },
      ],
      [
        { id: "signed", status: "signed", policyId: "pax" },
        { id: "cancelled", status: "cancelled", policyId: null },
      ],
    );
    expect(plan.scope).toBe("agentic");
    expect(plan.keepPolicyIds).toEqual(["pax"]);
    expect(plan.keepApplicationIds).toEqual(["signed"]);
  });

  it("keeps a signed application even before its policy exists", () => {
    const plan = erasurePlan([], [{ id: "signed", status: "signed", policyId: "missing" }]);
    expect(plan).toEqual({ scope: "agentic", keepPolicyIds: [], keepApplicationIds: ["signed"] });
  });
});

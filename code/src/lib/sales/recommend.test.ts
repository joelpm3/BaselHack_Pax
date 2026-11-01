import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { ToolContext } from "@/lib/advisor/tools/context";
import { db, schema } from "@/lib/db";
import type { GapType } from "@/lib/domain/taxonomy";
import { recommendProducts } from "./recommend";

// Runs against the per-file test database (vitest.setup.ts). The gate returns before any
// pricing call, so no network is involved.

let ctx: ToolContext;

beforeEach(() => {
  const customerId = randomUUID();
  db.insert(schema.customers).values({ id: customerId }).run();
  ctx = {
    conversationId: randomUUID(),
    customerId,
    locale: "de",
    mode: "new_business",
    ruleSet: { id: "rs", version: 1, leadHints: "", rules: [] },
  };
});

function storeCalculation(
  operation: string,
  overrides: Partial<typeof schema.calculations.$inferInsert> = {},
) {
  db.insert(schema.calculations)
    .values({
      customerId: ctx.customerId,
      provider: "logismata",
      operation,
      input: {},
      status: "ok",
      ...overrides,
    })
    .run();
}

const recommend = (...types: GapType[]) =>
  recommendProducts(ctx, { gaps: types.map((type) => ({ type, annualAmount: 20_000 })) });

describe("recommendProducts analysis gate", () => {
  it("holds back cover until the risk analysis ran, one entry per tool", async () => {
    const result = await recommend("death", "disability");
    expect(result.status).toBe("needs_analysis");
    expect(result.analysisNeeded).toEqual([
      { tool: "showRiskAnalysis", gaps: ["death", "disability"] },
    ]);
    expect(result.recommendations).toEqual([]);
    const stored = db.select().from(schema.recommendations).all();
    expect(stored).toEqual([]);
  });

  it("lists every missing analysis when gaps need different tools", async () => {
    const result = await recommend("death", "retirement", "payout");
    expect(result.analysisNeeded).toEqual([
      { tool: "showRiskAnalysis", gaps: ["death"] },
      { tool: "showPensionOverview", gaps: ["retirement", "payout"] },
    ]);
  });

  it("lets the gaps through once a successful analysis is stored", async () => {
    storeCalculation("APICalc_calculateRisk");
    const result = await recommend("death");
    // Past the gate; the empty profile now stops it at the next check.
    expect(result.status).toBe("needs_info");
    expect(result.missing).toEqual(["person.birthYear", "person.sex"]);
  });

  it("does not count failed calls, what-if scenarios or other customers' results", async () => {
    storeCalculation("APICalc_calculateRisk", { status: "error", error: "timeout" });
    storeCalculation("APICalc_calculateRisk", { toolCallId: "call_1:scenario" });
    const other = randomUUID();
    db.insert(schema.customers).values({ id: other }).run();
    storeCalculation("APICalc_calculateRisk", { customerId: other });

    const result = await recommend("death");
    expect(result.status).toBe("needs_analysis");
  });

  it("counts a regular tool call that is not a scenario", async () => {
    storeCalculation("APICalc_calculateRisk", { toolCallId: "call_1" });
    expect((await recommend("disability")).status).toBe("needs_info");
  });

  it("accepts any of the operations that back a tax gap", async () => {
    storeCalculation("APICalc_calculatePurchaseP2");
    expect((await recommend("tax")).status).toBe("needs_info");
  });

  it("requires the retirement analysis when tax is merged into a retirement need", async () => {
    // Tax alone would pass on the 3a saving check, but it is folded into the retirement need.
    storeCalculation("APICalc_calculateSaving3a");
    const result = await recommend("retirement", "tax");
    expect(result.analysisNeeded).toEqual([{ tool: "showPensionOverview", gaps: ["retirement"] }]);
  });

  it("does not gate child and care gaps, which have no analysis of their own", async () => {
    expect((await recommend("child", "care")).status).toBe("needs_info");
  });
});

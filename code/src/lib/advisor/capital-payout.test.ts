import { describe, expect, it } from "vitest";
import { groupPayoutsByAge } from "./capital-payout";

describe("groupPayoutsByAge", () => {
  it("adds up payouts in the same year and sorts by age", () => {
    expect(
      groupPayoutsByAge([
        { amount: 300000, age: 65, source: "pension_fund" },
        { amount: 40000, age: 62, source: "pillar3a" },
        { amount: 30000, age: 65, source: "pillar3a" },
      ]),
    ).toEqual([
      { age: 62, amount: 40000, sources: ["pillar3a"] },
      { age: 65, amount: 330000, sources: ["pension_fund", "pillar3a"] },
    ]);
  });

  it("drops empty payouts", () => {
    expect(groupPayoutsByAge([{ amount: 0, age: 64, source: "pillar3a" }])).toEqual([]);
  });
});

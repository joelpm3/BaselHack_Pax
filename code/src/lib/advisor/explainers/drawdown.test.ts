import { describe, expect, it } from "vitest";
import { lifeSituationSchema } from "@/lib/domain/profile";
import {
  buildConsumptionRequest,
  capitalByYear,
  drawdownStartAge,
  profileCapitalFor,
} from "./drawdown";

const profile = lifeSituationSchema.parse({
  person: { birthYear: 1970 },
  desiredRetirementAge: 63,
  pillar2: { projectedCapitalAtRetirement: 400_000 },
  pillar3a: { balance: 80_000 },
  assets: { liquid: 20_000, securities: 30_000, total: 999_000 },
});

describe("drawdown helpers", () => {
  it("takes the capital for each source from the profile", () => {
    expect(profileCapitalFor("pension_fund", profile)).toBe(400_000);
    expect(profileCapitalFor("pillar3a", profile)).toBe(80_000);
    expect(profileCapitalFor("savings", profile)).toBe(50_000);
    expect(
      profileCapitalFor("savings", lifeSituationSchema.parse({ assets: { total: 70_000 } })),
    ).toBe(70_000);
  });

  it("starts at retirement, or today when already older", () => {
    expect(drawdownStartAge(profile, 2026)).toBe(63);
    expect(drawdownStartAge(profile, 2040)).toBe(70);
    expect(drawdownStartAge(lifeSituationSchema.parse({}), 2026)).toBeUndefined();
    const early = lifeSituationSchema.parse({
      person: { birthYear: 1986 },
      plannedEvents: [{ type: "early_retirement", year: 2036 }],
    });
    expect(drawdownStartAge(early, 2026)).toBe(50);
  });

  it("asks for the duration with a monthly amount, otherwise for the amount until 85", () => {
    expect(
      buildConsumptionRequest({ capital: 300_000.4, startAge: 65, monthlyWithdrawal: 2000 }),
    ).toEqual({
      StartCapital: 300_000,
      InterestRate: 1,
      WithdrawalMonthly: true,
      EndCapital: 0,
      ConsumptionGoal: 2,
      Withdrawal: 2000,
    });
    expect(buildConsumptionRequest({ capital: 300_000, startAge: 65 })).toMatchObject({
      ConsumptionGoal: 1,
      Duration: 20,
    });
  });

  it("reads the yearly capital from the response", () => {
    expect(capitalByYear({ DetailsCapital: { Data1: [300_000, 278_890.6, -2] } })).toEqual([
      300_000, 278_891, 0,
    ]);
    expect(capitalByYear({})).toEqual([]);
  });
});

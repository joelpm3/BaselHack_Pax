import { describe, expect, it } from "vitest";
import {
  buildGrowthRequest,
  buildSavingRequest,
  normalizeSavingsParams,
  SAVINGS_INTEREST_RATE,
  savingsPlanFromResponse,
} from "./savings-plan";

const params = { goal: 50000, years: 10, startCapital: 0 };

describe("savings plan", () => {
  it("asks Logismata for the monthly rate at the documented interest rate", () => {
    expect(buildSavingRequest(params)).toEqual({
      SavingGoal: 2,
      Duration: 10,
      InitialInvestment: 0,
      InvestmentMonthly: true,
      InterestRate: SAVINGS_INTEREST_RATE,
      EndCapital: 50000,
    });
    expect(buildGrowthRequest({ ...params, startCapital: 60000 })).toMatchObject({
      SavingGoal: 1,
      InitialInvestment: 60000,
      PeriodicInvestment: 0,
    });
  });

  it("clamps the inputs to the slider limits", () => {
    expect(normalizeSavingsParams({ goal: 50000.4, years: 0, startCapital: -5 })).toEqual({
      goal: 50000,
      years: 1,
      startCapital: 0,
    });
    expect(normalizeSavingsParams({ goal: 1e9, years: 99 })).toEqual({
      goal: 1_000_000,
      years: 45,
      startCapital: 0,
    });
  });

  it("maps the response and its yearly series (pax.ch example: CHF 367 per month)", () => {
    const result = savingsPlanFromResponse(
      params,
      {
        Deposits: 44040,
        Interest: 5967,
        GrossCapital: 50007,
        PeriodicInvestment: 367,
        DetailsDeposits: { Periods: 2, Data2: [4404, 8808] },
        DetailsInterest: { Periods: 2, Data2: [60, 225.4] },
      },
      false,
    );
    expect(result).toMatchObject({ monthly: 367, endCapital: 50007, reachedWithoutSaving: false });
    expect(result.series).toEqual([
      { year: 1, deposits: 4404, interest: 60 },
      { year: 2, deposits: 8808, interest: 225 },
    ]);
  });

  it("saves nothing when the start capital alone reaches the goal", () => {
    expect(
      savingsPlanFromResponse(params, { PeriodicInvestment: 0, GrossCapital: 76800 }, true),
    ).toMatchObject({ monthly: 0, reachedWithoutSaving: true, endCapital: 76800 });
  });
});

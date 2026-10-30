import { describe, expect, it } from "vitest";
import { normalizeQuoteInput } from "../normalize";
import type { QuoteInput } from "../types";
import fkDeeplink from "./__fixtures__/fk-deeplink.json";
import fkSample from "./__fixtures__/fk-sample-10000.json";
import fondsStar from "./__fixtures__/fondsstar-3a-5000.json";
import lifeStar from "./__fixtures__/lifestar-3a-7258-g50.json";
import sirGroup3 from "./__fixtures__/sir-group3-10000.json";
import {
  deeplinkAction,
  OCCUPATION_BY_GROUP,
  quicksaleProductFor,
  STEPS,
  sameFund,
  toSwissDate,
} from "./mapping";
import { parseProposal } from "./parse";
import type { QsAction, QsProposal } from "./types";

const proposal = (fixture: { data: unknown }) => fixture.data as QsProposal;
const sample: QuoteInput = normalizeQuoteInput({
  productCode: "todesfall",
  pillar: "3b",
  birthDate: "1987-01-01",
  sex: "male",
  smoker: false,
  endAge: 65,
  sumInsured: 10_000,
});

/** The actions the adapter would send for this input against this proposal. */
function plan(p: QsProposal, input: QuoteInput): QsAction[] {
  return STEPS.map((s) => s.plan(p, input)).filter((a): a is QsAction => a !== null);
}

describe("product mapping", () => {
  it("deeplinks the Quicksale product of the pillar", () => {
    const product = quicksaleProductFor({ ...sample, productCode: "lifestar", pillar: "3a" });
    expect(product).toMatchObject({ titleCode: "147", technicalName: "TzaLifeStar" });
    const action = deeplinkAction(product ?? fail());
    expect(action.aktion.parameter).toContainEqual({ name: "SAEULE_3A", text: "1" });
    expect(quicksaleProductFor({ ...sample, productCode: "auszahlungsplan" })).toBeUndefined();
    expect(
      quicksaleProductFor({ ...sample, productCode: "lifestar", singlePremium: 50_000 }),
    ).toBeUndefined();
  });

  it("formats Swiss dates and matches fund names across lists", () => {
    expect(toSwissDate("1987-01-01")).toBe("01.01.1987");
    expect(
      sameFund("Pax (CH) Sustainable Portfolio 25", "Pax (CH) Sustainable Portfolio 25 ALV T"),
    ).toBe(true);
    expect(sameFund("Pax (CH) Sustainable Portfolio 25", "Pax (CH) Sustainable Portfolio 50")).toBe(
      false,
    );
  });
});

describe("action planning", () => {
  it("sends only the differences from the deeplinked defaults, amount last", () => {
    const actions = plan(proposal(fkDeeplink), sample);
    expect(actions.map((a) => a.aktion.key)).toEqual([
      "GEBURTSDATUM_AENDERN",
      "RAUCHER_AENDERN",
      "PRAEMIENBEFREIUNG_AENDERN",
      "RISIKOSUMME_AENDERN",
    ]);
    expect(actions[0].personen).toEqual([{ index: 0, geburtsdatum: "01.01.1987" }]);
    expect(actions[3]).toEqual({
      aktion: {
        key: "RISIKOSUMME_AENDERN",
        parameter: [
          { name: "TARIF_INDEX", wert: 0 },
          { name: "PERSON_INDEX", wert: 0 },
        ],
      },
      personen: [{ index: 0, tarife: [{ index: 0, risikosumme: 10_000 }] }],
    });
  });

  it("sends nothing when the proposal already matches", () => {
    expect(plan(proposal(fkSample), sample)).toEqual([]);
  });

  it("changes sex, end age and the occupation (with the whole person)", () => {
    const sir = normalizeQuoteInput({
      ...sample,
      productCode: "erwerbsunfaehigkeit",
      sumInsured: undefined,
      annualPension: 10_000,
      occupationGroup: 1,
      sex: "female",
      endAge: 60,
    });
    const actions = plan(proposal(sirGroup3), sir);
    expect(actions.map((a) => a.aktion.key)).toEqual([
      "GESCHLECHT_AENDERN",
      "HAUPTBERUF_AENDERN",
      "SCHLUSSALTER_AENDERN",
    ]);
    const occupation = actions[1].personen?.[0];
    expect(occupation?.selectedHauptberufId).toBe(OCCUPATION_BY_GROUP[1]);
    expect(occupation?.geburtsdatum).toBe("01.01.1987");
  });

  it("sets the guarantee, the fund and the premium for LifeStar", () => {
    const input = normalizeQuoteInput({
      ...sample,
      productCode: "lifestar",
      pillar: "3a",
      sumInsured: undefined,
      premiumWaiver: true,
      annualPremium: 6000,
      guaranteedSharePercent: 30,
      fundName: "Pax (CH) Sustainable Portfolio 75 ALV T",
    });
    const actions = plan(proposal(lifeStar), input);
    expect(actions.map((a) => a.aktion.key)).toEqual([
      "FONDSANTEIL_AENDERN",
      "FONDSAUSWAHL_AENDERN",
      "RATENPRAEMIE_AENDERN",
    ]);
    expect(actions[0].fonds).toEqual([{ index: 0, fondsAllokationen: [{ index: 0, anteil: 30 }] }]);
    expect(actions[1].fonds).toEqual([
      { index: 0, fondsAllokationen: [{ index: 1, selectedFondsauswahlIndex: 2 }] },
    ]);
    expect(actions[2].ratenPraemie).toBe(6000);
  });

  it("caps 3a premiums at the deductible maximum", () => {
    const input = normalizeQuoteInput({
      ...sample,
      productCode: "fondsstar",
      pillar: "3a",
      sumInsured: undefined,
      premiumWaiver: true,
      annualPremium: 9000,
    });
    expect(plan(proposal(fondsStar), input).at(-1)?.ratenPraemie).toBe(7258);
  });
});

describe("parseProposal", () => {
  it("reads gross and surplus-reduced premiums of the term life sample", () => {
    const q = parseProposal(proposal(fkSample), sample);
    expect(q).toMatchObject({
      premiumAnnualGross: 113.6,
      premiumAnnualNet: 111.2,
      sumInsured: 10_000,
      startDate: "2026-11-01",
      durationYears: 25,
      riders: [],
      quicksaleWarnings: [],
    });
  });

  it("reads the disability pension and the included premium waiver", () => {
    const input = { ...sample, productCode: "erwerbsunfaehigkeit" as const, annualPension: 10_000 };
    const q = parseProposal(proposal(sirGroup3), input);
    expect(q.premiumAnnualGross).toBe(811.5);
    expect(q.premiumAnnualNet).toBe(704.7);
    expect(q.annualPension).toBe(10_000);
    expect(q.riders).toEqual([
      { code: "I", name: "Prämienbefreiung bei Erwerbsunfähigkeit", premiumAnnual: 0 },
    ]);
  });

  it("reads scenarios, guarantee and fund of a savings product", () => {
    const input = {
      ...sample,
      productCode: "lifestar" as const,
      pillar: "3a" as const,
      annualPremium: 7258,
    };
    const q = parseProposal(proposal(lifeStar), input);
    expect(q.premiumAnnualGross).toBe(7258.1);
    expect(q.maturity).toEqual({
      guaranteed: 88_257.9,
      low: 143_363.2,
      medium: 219_184.1,
      high: 273_436.1,
    });
    expect(q.guaranteedSharePercent).toBe(50);
    expect(q.fundName).toBe("Pax (CH) Sustainable Equity Switzerland Small & Mid Cap ALV T");
    expect(q.riders.map((r) => r.code)).toEqual(["I"]);
    expect(q.sumInsured).toBe(168_910);
  });

  it("has no guaranteed maturity for FondsStar", () => {
    const input = {
      ...sample,
      productCode: "fondsstar" as const,
      pillar: "3a" as const,
      annualPremium: 5000,
    };
    const q = parseProposal(proposal(fondsStar), input);
    expect(q.maturity).toEqual({ low: 75_723.2, medium: 185_743.7, high: 262_815.3 });
    expect(q.guaranteedSharePercent).toBe(0);
    expect(q.riders.map((r) => r.code)).toEqual(["PFZ", "I"]);
  });
});

function fail(): never {
  throw new Error("expected a Quicksale product");
}

import { describe, expect, it } from "vitest";
import type { QuoteInput } from "@/lib/pricing/types";
import { offerDiffers, offerInputs } from "./offer-inputs";
import type { OfferView } from "./types";

const death: QuoteInput = {
  productCode: "todesfall",
  pillar: "3b",
  birthDate: "1992-01-01",
  sex: "female",
  smoker: false,
  endAge: 55,
  sumInsured: 500_000,
};
const assumed = { who: "self" as const, birthDateAssumed: true, smokerAssumed: true };
const unknown = { customerBirthDate: null, smoker: undefined };

describe("offerInputs", () => {
  it("keeps the recommendation's inputs while nothing new is known", () => {
    expect(offerInputs(death, assumed, unknown)).toEqual({
      input: death,
      birthDateAssumed: true,
      smokerAssumed: true,
    });
  });

  it("prices with the birth date from the application form", () => {
    const next = offerInputs(death, assumed, { ...unknown, customerBirthDate: "1985-03-15" });
    expect(next.input.birthDate).toBe("1985-03-15");
    expect(next.birthDateAssumed).toBe(false);
  });

  it("keeps the end year of death cover when the age changes", () => {
    const next = offerInputs(death, assumed, { ...unknown, customerBirthDate: "1985-03-15" });
    expect(next.input.endAge).toBe(62);
    const old = offerInputs({ ...death, birthDate: "1950-01-01", endAge: 80 }, assumed, {
      ...unknown,
      customerBirthDate: "1945-06-01",
    });
    expect(old.input.endAge).toBe(85);
  });

  it("keeps the end age of other products (retirement age)", () => {
    const disability: QuoteInput = { ...death, productCode: "erwerbsunfaehigkeit", endAge: 65 };
    const next = offerInputs(disability, assumed, { ...unknown, customerBirthDate: "1985-03-15" });
    expect(next.input.endAge).toBe(65);
  });

  it("ignores the policyholder's birth date when the partner is insured", () => {
    const next = offerInputs(
      death,
      { ...assumed, who: "partner" },
      { ...unknown, customerBirthDate: "1985-03-15" },
    );
    expect(next.input.birthDate).toBe("1992-01-01");
    expect(next.birthDateAssumed).toBe(true);
  });

  it("uses a stated smoker status and stops calling it an assumption", () => {
    const next = offerInputs(death, assumed, { ...unknown, smoker: true });
    expect(next.input.smoker).toBe(true);
    expect(next.smokerAssumed).toBe(false);
  });
});

describe("offerDiffers", () => {
  const offer = { insured: { birthDate: "1992-01-01", smoker: false } } as OfferView;

  it("detects a changed birth date or smoker status", () => {
    expect(offerDiffers(offer, offerInputs(death, assumed, unknown))).toBe(false);
    expect(
      offerDiffers(
        offer,
        offerInputs(death, assumed, { ...unknown, customerBirthDate: "1985-03-15" }),
      ),
    ).toBe(true);
    expect(offerDiffers(offer, offerInputs(death, assumed, { ...unknown, smoker: true }))).toBe(
      true,
    );
  });
});

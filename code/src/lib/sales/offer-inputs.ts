import type { QuoteInput } from "@/lib/pricing/types";
import type { OfferView } from "./types";

/**
 * A recommendation is priced with what the chat knew (birth year → 1 January, smoker unknown →
 * non-smoker). The offer re-prices with what is known by now: the exact birth date from the
 * application form and the smoker status from the profile. Pure, so the rules are testable.
 */

export interface InsuredBasis {
  who: "self" | "partner";
  birthDateAssumed: boolean;
  smokerAssumed: boolean;
}

export interface KnownFacts {
  /** The policyholder's exact birth date (application form); only used when they are insured. */
  customerBirthDate: string | null;
  /** The insured person's smoker status from the profile; undefined if never stated. */
  smoker: boolean | undefined;
}

export interface OfferInputs {
  input: QuoteInput;
  birthDateAssumed: boolean;
  smokerAssumed: boolean;
}

const yearOf = (iso: string) => Number(iso.slice(0, 4));

export function offerInputs(
  stored: QuoteInput,
  insured: InsuredBasis,
  known: KnownFacts,
): OfferInputs {
  const exact = insured.who === "self" ? known.customerBirthDate : null;
  const input: QuoteInput = {
    ...stored,
    birthDate: exact ?? stored.birthDate,
    smoker: known.smoker ?? stored.smoker,
  };
  if (input.productCode === "todesfall" && input.birthDate !== stored.birthDate) {
    // Death cover runs until a calendar year (youngest child 25, or a fixed number of years),
    // so a different age keeps the end year and moves the end age.
    input.endAge = Math.min(85, stored.endAge + yearOf(stored.birthDate) - yearOf(input.birthDate));
  }
  return {
    input,
    birthDateAssumed: exact ? false : insured.birthDateAssumed,
    smokerAssumed: known.smoker === undefined && insured.smokerAssumed,
  };
}

/** True when the offer was priced with other insured facts than the ones known now. */
export function offerDiffers(offer: OfferView, next: OfferInputs): boolean {
  return (
    offer.insured.birthDate !== next.input.birthDate || offer.insured.smoker !== next.input.smoker
  );
}

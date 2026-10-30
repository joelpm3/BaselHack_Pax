import type { QuoteInput } from "./types";

/** Product defaults applied before pricing, so cache keys and audit records are explicit. */
export function normalizeQuoteInput(input: QuoteInput): QuoteInput {
  const n: QuoteInput = { ...input };
  const round = (v: number | undefined) => (v === undefined ? undefined : Math.round(v));
  n.sumInsured = round(n.sumInsured);
  n.annualPension = round(n.annualPension);
  n.annualPremium = round(n.annualPremium);
  n.singlePremium = round(n.singlePremium);
  n.endAge = Math.round(n.endAge);

  switch (n.productCode) {
    case "todesfall":
      // The sample offer prices term life without premium waiver.
      n.premiumWaiver ??= false;
      break;
    case "erwerbsunfaehigkeit":
      // Premium waiver is included in the disability tariff ("I incl.").
      n.premiumWaiver = true;
      n.waitingPeriodMonths ??= 24;
      n.occupationGroup ??= 2;
      break;
    case "lifestar":
    case "pax3a":
      n.premiumWaiver ??= true;
      n.guaranteedSharePercent = clamp(n.guaranteedSharePercent ?? 50, 10, 100);
      break;
    case "fondsstar":
    case "kinderversicherung":
      n.premiumWaiver ??= true;
      n.guaranteedSharePercent = 0;
      break;
    case "auszahlungsplan":
      n.guaranteedSharePercent = clamp(n.guaranteedSharePercent ?? 50, 0, 95);
      break;
    case "care":
      break;
  }
  return n;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Stable key: same normalized input → same quote. */
export function quoteCacheKey(input: QuoteInput): string {
  const entries = Object.entries(input)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
}

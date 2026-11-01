import type { OfferDocument, PolicyDocument } from "./types";

/** Sample documents for the PDF tests and scripts/render-contract-pdfs.ts (previews). */

const holder = {
  name: "Anna-Lena Müller-Schönenberger",
  birthDate: "1988-03-12",
  email: "anna-lena.mueller@example.ch",
  phone: "+41 79 123 45 67",
  place: "4053 Basel",
};

export const disabilityOffer: OfferDocument = {
  kind: "offer",
  locale: "de",
  policyNumber: "PAX-2026-418203",
  status: "offer",
  policyholder: holder,
  coverage: {
    productCode: "erwerbsunfaehigkeit",
    productName: "Pax Erwerbsunfähigkeitsversicherung",
    category: "risk_disability",
    pillar: "3b",
    insured: { name: holder.name, birthDate: holder.birthDate, smoker: false },
    startDate: "2026-12-01",
    endDate: "2053-03-31",
    durationYears: 27,
    endAge: 65,
    annualPension: 24000,
    waitingPeriodMonths: 24,
    premiumAnnual: 1234.5,
    premiumNet: 1087.2,
    riders: [{ code: "I", name: "Prämienbefreiung", premiumAnnual: 0 }],
    priceSource: "quicksale",
  },
  signature: { name: "Anna-Lena Müller-Schönenberger", signedAt: "2026-11-01T13:05:00.000Z" },
  suitability: null,
  recommendation: {
    gap: "disability",
    alsoCloses: [],
    gapAnnual: 26400,
    headline: "Ihr Einkommen bei Krankheit sichern",
    rationale:
      "Werden Sie wegen Krankheit erwerbsunfähig, zahlen IV und Pensionskasse zusammen rund 60 % Ihres Lohns. Es fehlen Ihnen rund CHF 26'400 pro Jahr. Eine Rente von CHF 24'000 pro Jahr schliesst den grössten Teil dieser Lücke.",
    criteria: [
      { criterion: "Lücke", value: "Erwerbsunfähigkeit: CHF 26'400 pro Jahr", met: true },
      { criterion: "Eintrittsalter", value: "38 Jahre (möglich 15 bis 60)", met: true },
      {
        criterion: "Wartefrist",
        value: "24 Monate: vorher zahlen Lohnfortzahlung und Krankentaggeld",
        met: true,
      },
      {
        criterion: "Berufsgruppe",
        value: "Gruppe 2 angenommen, Beruf noch nicht bekannt",
        met: false,
      },
    ],
    alternatives: [
      {
        label: "Pax LifeStar",
        reason: "Spart fürs Alter und schützt mit Prämienbefreiung, ersetzt aber kein Einkommen.",
      },
    ],
  },
};

export const lifestarOffer: OfferDocument = {
  kind: "offer",
  locale: "de",
  policyNumber: "PAX-2027-207415",
  status: "active",
  policyholder: holder,
  coverage: {
    productCode: "lifestar",
    productName: "Pax LifeStar",
    category: "pillar3a",
    pillar: "3a",
    insured: { name: holder.name, birthDate: holder.birthDate, smoker: false },
    startDate: "2027-01-01",
    endDate: "2053-03-31",
    durationYears: 26,
    endAge: 65,
    premiumAnnual: 7258,
    premiumNet: 7258,
    fund: "Pax (CH) Sustainable Portfolio 50 ALV T",
    guaranteedSharePercent: 50,
    riders: [
      { code: "I", name: "Prämienbefreiung bei Erwerbsunfähigkeit", premiumAnnual: 142.3 },
      { code: "PFZ", name: "Prämienbefreiung bei Familienzuwachs", premiumAnnual: 0 },
    ],
    maturity: { guaranteed: 94_354, low: 151_200, medium: 196_840, high: 254_120 },
    priceSource: "estimate",
  },
  signature: { name: "Anna-Lena Müller-Schönenberger", signedAt: "2026-11-01T08:41:00.000Z" },
  suitability: {
    answers: {
      annualPremium: 7258,
      singlePremium: null,
      netIncome: "75k_150k",
      netAssets: "50k_150k",
      savingCapacity: "3k_7k",
      oneOffCapacity: "10k_50k",
      goal: "moderate_gains",
      horizon: "gt15",
      knowledge: "experience",
      drawdown: "hold",
      guaranteedSharePercent: 50,
    },
    result: {
      points: { goal: 15, horizon: 30, knowledge: 20, drawdown: 20 },
      basePoints: 85,
      guaranteedSharePercent: 50,
      total: 103,
      profile: "dynamic",
      funds: ["Pax (CH) Sustainable Portfolio 50 ALV T"],
      suggestedFund: "Pax (CH) Sustainable Portfolio 50 ALV T",
      affordability: { annual: true, single: null, ok: true },
      suitable: true,
    },
    fund: "Pax (CH) Sustainable Portfolio 50 ALV T",
    completedAt: "2026-11-01T08:30:00.000Z",
  },
  recommendation: {
    gap: "retirement",
    alsoCloses: ["tax"],
    gapAnnual: 18000,
    headline: "Die Lücke im Alter gezielt schliessen",
    rationale:
      "Nach der Pensionierung fehlen Ihnen rund CHF 18'000 pro Jahr. Mit CHF 7'258 pro Jahr in der Säule 3a sparen Sie gezielt dafür und senken gleichzeitig Ihre Steuern.",
    criteria: [
      { criterion: "Lücke", value: "Alter: CHF 18'000 pro Jahr", met: true },
      { criterion: "Spielraum Säule 3a", value: "CHF 7'258 können Sie 2027 einzahlen", met: true },
    ],
    alternatives: [
      { label: "Pax FondsStar", reason: "Ganz in Fonds, ohne garantierten Teil." },
      {
        label: "Einkauf in die Pensionskasse",
        reason: "Spart Steuern, bindet das Geld aber bis zur Pensionierung.",
      },
    ],
  },
};

export const disabilityPolicy: PolicyDocument = {
  kind: "policy",
  locale: "de",
  policyNumber: "PAX-2026-418203",
  status: "active",
  policyholder: holder,
  coverage: disabilityOffer.coverage,
  beneficiaries: [],
  approval: { advisorName: "Sandra Keller", approvedAt: "2026-11-02T09:15:00.000Z" },
  signature: disabilityOffer.signature,
  issuedOn: "2026-11-02",
};

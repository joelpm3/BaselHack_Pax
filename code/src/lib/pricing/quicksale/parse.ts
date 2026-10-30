import { PILLAR_3A_MAX } from "../limits";
import type { Quote, QuoteInput, QuoteRider, ScenarioValues } from "../types";
import { fromSwissDate } from "./mapping";
import type { QsProposal } from "./types";

type ParsedFields = Omit<Quote, "source" | "issues" | "inputs" | "warnings"> & {
  quicksaleWarnings: string[];
};

const GUARANTEE = "Garantieanlage";
const SCENARIO_KEYS: Record<string, keyof ScenarioValues> = {
  NIEDRIG: "low",
  MITTEL: "medium",
  HOCH: "high",
};

const stripHtml = (s: string) =>
  s
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function riders(proposal: QsProposal): QuoteRider[] {
  return proposal.personen[0].tarife
    .filter((t) => t.index > 0 && t.code)
    .map((t) => {
      const choice = t.tarifauswahlen?.find((c) => c.bezeichnung === t.selectedTarif);
      return {
        code: t.selectedTarif.replace(/\s+incl\.?$/i, ""),
        name: choice?.tarifbeschreibung ?? t.selectedTarif,
        premiumAnnual: t.periodischePraemie,
      };
    });
}

function fundSplit(proposal: QsProposal): { fundName?: string; guaranteedSharePercent?: number } {
  const allocations = proposal.fonds[0]?.fondsAllokationen ?? [];
  const nameOf = (i: number) =>
    allocations[i].fondsauswahlen[allocations[i].selectedFondsauswahlIndex]?.bezeichnung;
  let fundName: string | undefined;
  let guaranteed = 0;
  allocations.forEach((a, i) => {
    const name = nameOf(i);
    if (!name || a.anteil <= 0) return;
    if (name === GUARANTEE) guaranteed += a.anteil;
    else fundName ??= name;
  });
  return { fundName, guaranteedSharePercent: guaranteed };
}

/** Reads the recalculated proposal into quote fields. */
export function parseProposal(proposal: QsProposal, input: QuoteInput): ParsedFields {
  const main = proposal.personen[0].tarife[0];
  const savings = proposal.sparprodukt;
  // Risk products report gross and surplus-reduced premiums; savings products credit the
  // surplus to the fund, so the instalment is both.
  const gross = savings ? proposal.ratenPraemie : proposal.bruttopraemie;
  const net = savings ? proposal.ratenPraemie : proposal.nettopraemie;

  const fields: ParsedFields = {
    productCode: input.productCode,
    premiumAnnualGross: gross,
    premiumAnnualNet: net,
    riders: riders(proposal),
    startDate: fromSwissDate(proposal.beginnDatum),
    durationYears: main?.dauer,
    quicksaleWarnings: [],
  };

  if (input.productCode === "erwerbsunfaehigkeit") fields.annualPension = main?.risikosumme;
  else fields.sumInsured = main?.risikosumme;

  if (savings) {
    const maturity: ScenarioValues = {};
    for (const s of proposal.verwendeteAnnahmen?.szenarienBetraege ?? []) {
      const key = SCENARIO_KEYS[s.bezeichnung];
      if (key) maturity[key] = s.betrag;
    }
    const guaranteed = proposal.vorsorgeart.garantiertesErlebensfallkapital;
    if (guaranteed > 0) maturity.guaranteed = guaranteed;
    fields.maturity = maturity;
    Object.assign(fields, fundSplit(proposal));
  }

  // Quicksale rounds the 3a maximum up by ten centimes and then warns about it.
  const atCap = input.pillar === "3a" && Math.abs(proposal.ratenPraemie - PILLAR_3A_MAX) < 1;
  fields.quicksaleWarnings = (proposal.warnungen ?? [])
    .map((w) => stripHtml(w.text))
    .filter((text) => text && !(atCap && /maximal abzugsf/i.test(text)));
  return fields;
}

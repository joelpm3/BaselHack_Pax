/**
 * The subset of the Pax Quicksale proposal ("Vorschlag") this adapter reads. The API returns the
 * whole proposal after every action; unknown fields are kept (index signatures) because some
 * actions must send a person or the 3a settings back unchanged.
 */

export interface QsTariffChoice {
  index: number;
  bezeichnung: string;
  tarifbeschreibung: string;
}

export interface QsTariff {
  index: number;
  code: string;
  selectedTarif: string;
  dauer: number;
  schlussalter: number;
  selectedWartefrist: number;
  periodischePraemie: number;
  einmalpraemie: number;
  risikosumme: number;
  erlebensfallleistung: number;
  tarifauswahlen?: QsTariffChoice[];
}

export interface QsPerson {
  index: number;
  geburtsdatum: string; // dd.mm.yyyy
  selectedGeschlecht: "MANN" | "FRAU";
  raucher: boolean;
  praemienbefreiung: boolean;
  selectedHauptberufId: number;
  technischesAlter?: number;
  tarife: QsTariff[];
  [key: string]: unknown;
}

export interface QsFundChoice {
  index: number;
  bezeichnung: string;
}

export interface QsFundAllocation {
  index: number;
  anteil: number;
  selectedFondsauswahlIndex: number;
  fondsauswahlen: QsFundChoice[];
}

export interface QsFundSplit {
  index: number;
  fondsAllokationen: QsFundAllocation[];
}

export interface QsScenarioAmount {
  bezeichnung: "NIEDRIG" | "MITTEL" | "HOCH" | string;
  betrag: number;
}

export interface QsProposal {
  sessionId?: string;
  beginnDatum: string; // dd.mm.yyyy
  ratenPraemie: number;
  jahresPraemie: number;
  bruttopraemie: number;
  nettopraemie: number;
  aktuelleUeberschuesse?: number;
  einmalpraemieTotal: number;
  erlebensfallleistungTotal: number;
  sparprodukt: boolean;
  vorsorgeart: {
    saeule3a: boolean;
    garantiertesErlebensfallkapital: number;
    [key: string]: unknown;
  };
  verwendeteAnnahmen?: {
    szenarienBetraege?: QsScenarioAmount[];
    [key: string]: unknown;
  };
  warnungen?: Array<{ text: string }>;
  fonds: QsFundSplit[];
  personen: QsPerson[];
  [key: string]: unknown;
}

export interface QsResponse {
  message: string;
  state: string;
  data?: QsProposal;
}

export interface QsActionParameter {
  name: string;
  text?: string;
  wert?: number;
}

/** One proposal change. Quicksale applies exactly the field named by `aktion.key`. */
export interface QsAction {
  aktion: { key: string; parameter?: QsActionParameter[] };
  personen?: Array<Record<string, unknown>>;
  fonds?: Array<{ index: number; fondsAllokationen: Array<Record<string, unknown>> }>;
  ratenPraemie?: number;
  [key: string]: unknown;
}

/** Product as listed by GET /api/produkte (used for the DEEPLINK action). */
export interface QsProduct {
  titleCode: string;
  technicalName: string;
  displayName: string;
  pillar3a: boolean;
}

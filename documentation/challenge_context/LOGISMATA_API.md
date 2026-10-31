# Logismata API & Pax Hackathon Tools

> Sources: https://pax-hackathon-2026.vercel.app/tools#analysis (password-protected hackathon hub) and its `/material` and `/rechner/*` pages, captured 2026-10-30.
> Every example in [`api/examples/`](api/examples/) was run against the live API on 2026-10-30. Each returned HTTP 200.

## Files

| Path | Content |
|---|---|
| [`api/APICalc-swagger.yaml`](api/APICalc-swagger.yaml) | Full OpenAPI 3.1 spec (APICalc v1.2, 24 operations), original file from the hub |
| [`api/examples/`](api/examples/) | One working request and the live response for each of the 24 operations (taken from the hub calculators' "Load example") |
| [`api/call.sh`](api/call.sh) | `./call.sh <operationId> '<json>'` or `@file.json`. Reads the token from `api/.env` |
| `api/.env` | `LOGISMATA_API_BASE` and `LOGISMATA_API_TOKEN` (**gitignored**, don't commit) |

## API access

- **Provider:** Logismata (Swiss pension and tax calculation engine), set up for the hackathon. The official Logismata calculator UIs are at https://services.logismata.ch/rso-internetrechner/app/
- **Base URL:** `https://baselhackathon2026.azurewebsites.net/viper`
- **Auth:** `Authorization: Bearer <token>`. The token is a JWT (issuer `Logismata`, subject `hackathon`, custno 99999). It is published in plain text on the hub's Tools page, and a copy is in `api/.env`.
- **Token expiry:** `exp` = 2026-11-03 22:59:59 UTC. After that, get a fresh token from the hub's Tools page.
- **Scopes (API keys) in the token:** `calc.tax.purchasep2`, `calc.tax.estategain`, `calc.tax.income`, `calc.tax.inheritance`, `calc.tax.corporateentity`, `calc.tax.capital`, `calc.saving`, `calc.check.retirement`, `calc.check.risk`, `calc.tax.saving3a`. Basic functions need `calc.*`, which the token also satisfies.
- **Call pattern:** every operation is `POST {base}/operation/standard/<operationId>` with a JSON body, plus an optional query param `tenant` ("Mandant"). The result is wrapped as `{"response": ...}`.
- **Errors:** 400 / 401 (missing API key) / 403 / 404 / 500.
- **Tax location:** most tax calls need a `TaxLocationID`. Look it up with `APICalc_searchLocation` (`{"Search":"Basel","Language":1}`) or `APICalc_searchLocationGeo`. Example: `400100000` = 4001 Basel (BS).
- **Common enums:** `Sex` 1=male, 2=female · `Language` 1=DE, 2=FR, 3=IT, 4=EN · see the operation tables below for `Relationship`, `Confession`, `IncomeType` etc.

```bash
curl -X POST "https://baselhackathon2026.azurewebsites.net/viper/operation/standard/APICalc_getSaving3aLimits" \
  -H "Authorization: Bearer $LOGISMATA_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
# → {"response":{"Max3aSaving":7258,"Max3aSavingWithoutP2":36288}}
```

> **Privacy / legal:** the challenge legal framework says customer, financial and health data must never be sent to external services uncontrolled. Logismata is an external API. Send only the minimal calculation inputs (birth year, income, canton, etc.) and never names or identifiers. See [CHALLENGE.md](CHALLENGE.md).

## Existing calculators (reference implementations on the hub)

The hub implements all 24 APICalc operations as working calculators at `https://pax-hackathon-2026.vercel.app/rechner/<slug>` (login required). Each one shows its raw request and response. They cover the Swiss tax domain; the API itself is language-agnostic.

**Most relevant for the advisor (3 pillars):**
- **Risk check** (`APICalc_calculateRisk`): income gap on disability or death per scenario, split into 1st pillar (AHV/IV), 2nd pillar (BVG) and partner income. Use it to size risk insurance (Pax disability income, term life).
- **Retirement check** (`APICalc_calculateRetirement`): income and capital need in retirement versus 1st and 2nd pillar plus savings. Gives the gap a 3rd-pillar product should close.
- **Pillar 3a** (`APICalc_calculateSaving3a`), **pension-fund buy-in** (`APICalc_calculatePurchaseP2`) and **lump-sum tax** (`APICalc_calculateCapitalTax`): the tax side of the recommendation.
- **Budget proposal** (`APICalc_calculateBudgetProposal`): household budget from income and life situation. Gives an affordability check.

### Taxes

| Calculator | What it does | Operation | API key | Example |
|---|---|---|---|---|
| [Convert income](https://pax-hackathon-2026.vercel.app/rechner/einkommen-umrechnen) | Convert between gross, taxable and net income. | `APICalc_calculateIncome` | `calc.*` | [req](api/examples/APICalc_calculateIncome.request.json) · [resp](api/examples/APICalc_calculateIncome.response.json) |
| [Real-estate capital gains tax](https://pax-hackathon-2026.vercel.app/rechner/grundstueckgewinnsteuer) | The tax on the gain from selling a property. | `APICalc_calculateEstateGainTax` | `calc.tax.estategain` | [req](api/examples/APICalc_calculateEstateGainTax.request.json) · [resp](api/examples/APICalc_calculateEstateGainTax.response.json) |
| [Income & wealth tax](https://pax-hackathon-2026.vercel.app/rechner/einkommens-vermoegenssteuer) | The ordinary tax on income and wealth at a Swiss place of residence. | `APICalc_calculateIncomeFortuneTax` | `calc.tax.income` | [req](api/examples/APICalc_calculateIncomeFortuneTax.request.json) · [resp](api/examples/APICalc_calculateIncomeFortuneTax.response.json) |
| [Lump-sum benefit tax](https://pax-hackathon-2026.vercel.app/rechner/kapitalleistungssteuer) | The separate tax on a lump-sum payout from pension savings. | `APICalc_calculateCapitalTax` | `calc.tax.capital` | [req](api/examples/APICalc_calculateCapitalTax.request.json) · [resp](api/examples/APICalc_calculateCapitalTax.response.json) |
| [Corporate tax](https://pax-hackathon-2026.vercel.app/rechner/unternehmenssteuer) | Profit and capital tax of a legal entity. | `APICalc_calculateCorporateEntityTax` | `calc.tax.corporateentity` | [req](api/examples/APICalc_calculateCorporateEntityTax.request.json) · [resp](api/examples/APICalc_calculateCorporateEntityTax.response.json) |

### Inheritance & gift

| Calculator | What it does | Operation | API key | Example |
|---|---|---|---|---|
| [Inheritance tax – overview](https://pax-hackathon-2026.vercel.app/rechner/erbschaftssteuer-uebersicht) | The tax on an amount for all relationship degrees at a glance. | `APICalc_calculateAllInheritanceDonationTaxes` | `calc.tax.inheritance` | [req](api/examples/APICalc_calculateAllInheritanceDonationTaxes.request.json) · [resp](api/examples/APICalc_calculateAllInheritanceDonationTaxes.response.json) |
| [Inheritance tax – by group](https://pax-hackathon-2026.vercel.app/rechner/erbschaftssteuer-gruppe) | The tax for a relationship group – such as children or siblings. | `APICalc_calculateGroupInheritanceDonationTaxes` | `calc.tax.inheritance` | [req](api/examples/APICalc_calculateGroupInheritanceDonationTaxes.request.json) · [resp](api/examples/APICalc_calculateGroupInheritanceDonationTaxes.response.json) |
| [Inheritance tax – beneficiary](https://pax-hackathon-2026.vercel.app/rechner/erbschaftssteuer-beguenstigter) | The tax for a specifically named beneficiary. | `APICalc_calculateBeneficiaryInheritanceDonationTax` | `calc.tax.inheritance` | [req](api/examples/APICalc_calculateBeneficiaryInheritanceDonationTax.request.json) · [resp](api/examples/APICalc_calculateBeneficiaryInheritanceDonationTax.response.json) |

### Saving & investing

| Calculator | What it does | Operation | API key | Example |
|---|---|---|---|---|
| [Pillar 3a – saving & taxes](https://pax-hackathon-2026.vercel.app/rechner/saeule-3a) | Final capital and tax saving of a 3a contribution over the years. | `APICalc_calculateSaving3a` | `calc.tax.saving3a` | [req](api/examples/APICalc_calculateSaving3a.request.json) · [resp](api/examples/APICalc_calculateSaving3a.response.json) |
| [Pension-fund buy-in](https://pax-hackathon-2026.vercel.app/rechner/pk-einkauf) | The tax saving of a voluntary buy-in into the 2nd pillar. | `APICalc_calculatePurchaseP2` | `calc.tax.purchasep2` | [req](api/examples/APICalc_calculatePurchaseP2.request.json) · [resp](api/examples/APICalc_calculatePurchaseP2.response.json) |
| [Savings calculator](https://pax-hackathon-2026.vercel.app/rechner/sparen) | How an initial capital grows with regular deposits and interest. | `APICalc_calculateSaving` | `calc.saving` | [req](api/examples/APICalc_calculateSaving.request.json) · [resp](api/examples/APICalc_calculateSaving.response.json) |
| [Withdrawal calculator](https://pax-hackathon-2026.vercel.app/rechner/entnahme) | How long a capital lasts with regular withdrawals and interest. | `APICalc_calculateConsumption` | `calc.saving` | [req](api/examples/APICalc_calculateConsumption.request.json) · [resp](api/examples/APICalc_calculateConsumption.response.json) |
| [Budget proposal](https://pax-hackathon-2026.vercel.app/rechner/budget) | A household budget from income and life situation. | `APICalc_calculateBudgetProposal` | `calc.saving` | [req](api/examples/APICalc_calculateBudgetProposal.request.json) · [resp](api/examples/APICalc_calculateBudgetProposal.response.json) |

### Pension check

| Calculator | What it does | Operation | API key | Example |
|---|---|---|---|---|
| [Risk – base data](https://pax-hackathon-2026.vercel.app/rechner/risiko-grunddaten) | The base values of the risk check without need assumptions. | `APICalc_calculateRiskBase` | `calc.check.risk` | [req](api/examples/APICalc_calculateRiskBase.request.json) · [resp](api/examples/APICalc_calculateRiskBase.response.json) |
| [Risk check](https://pax-hackathon-2026.vercel.app/rechner/risiko-check) | The income gap on disability and death – with scenarios. | `APICalc_calculateRisk` | `calc.check.risk` | [req](api/examples/APICalc_calculateRisk.request.json) · [resp](api/examples/APICalc_calculateRisk.response.json) |
| [Retirement – base data](https://pax-hackathon-2026.vercel.app/rechner/pensionierung-grunddaten) | The base values of the retirement check without need assumptions. | `APICalc_calculateRetirementBase` | `calc.check.retirement` | [req](api/examples/APICalc_calculateRetirementBase.request.json) · [resp](api/examples/APICalc_calculateRetirementBase.response.json) |
| [Retirement check](https://pax-hackathon-2026.vercel.app/rechner/pensionierungs-check) | Income and capital need in retirement – and the remaining gap. | `APICalc_calculateRetirement` | `calc.check.retirement` | [req](api/examples/APICalc_calculateRetirement.request.json) · [resp](api/examples/APICalc_calculateRetirement.response.json) |

### Basics & lookup

| Calculator | What it does | Operation | API key | Example |
|---|---|---|---|---|
| [Pillar 3a limits](https://pax-hackathon-2026.vercel.app/rechner/3a-limiten) | The maximum 3a contribution with and without a pension fund. | `APICalc_getSaving3aLimits` | `calc.*` | [req](api/examples/APICalc_getSaving3aLimits.request.json) · [resp](api/examples/APICalc_getSaving3aLimits.response.json) |
| [Age limits](https://pax-hackathon-2026.vercel.app/rechner/altersgrenzen) | The relevant age limits by sex and birth year. | `APICalc_getAgeLimits` | `calc.*` | [req](api/examples/APICalc_getAgeLimits.request.json) · [resp](api/examples/APICalc_getAgeLimits.response.json) |
| [Tax-base status](https://pax-hackathon-2026.vercel.app/rechner/steuerstand) | Version and date of the stored tax-base data. | `APICalc_getTaxBaseInfo` | `calc.*` | [req](api/examples/APICalc_getTaxBaseInfo.request.json) · [resp](api/examples/APICalc_getTaxBaseInfo.response.json) |
| [Search location](https://pax-hackathon-2026.vercel.app/rechner/standort-suche) | Find tax locations by postcode or town. | `APICalc_searchLocation` | `calc.*` | [req](api/examples/APICalc_searchLocation.request.json) · [resp](api/examples/APICalc_searchLocation.response.json) |
| [Search location (geo)](https://pax-hackathon-2026.vercel.app/rechner/standort-suche-geo) | Find tax locations within a radius of coordinates. | `APICalc_searchLocationGeo` | `calc.*` | [req](api/examples/APICalc_searchLocationGeo.request.json) · [resp](api/examples/APICalc_searchLocationGeo.response.json) |
| [Look up location](https://pax-hackathon-2026.vercel.app/rechner/standort) | The details of a tax location by its ID. | `APICalc_getLocation` | `calc.*` | [req](api/examples/APICalc_getLocation.request.json) · [resp](api/examples/APICalc_getLocation.response.json) |
| [Real-estate capital gain – extra fields](https://pax-hackathon-2026.vercel.app/rechner/grundstueckgewinn-zusatzfelder) | Which cantonal extra fields a location has for the real-estate capital gains tax. | `APICalc_getAdditionalEstateGainFields` | `calc.tax.estategain` | [req](api/examples/APICalc_getAdditionalEstateGainFields.request.json) · [resp](api/examples/APICalc_getAdditionalEstateGainFields.response.json) |

## Other tools on the hub

- **Sales tool, Quicksale:** https://portal.pax.ch/quicksale/edu/. A public demo of Pax's sales and conclusion flow with the real product overview. It's the reference for the end-to-end path (recommendation → contract → policy).
- **Design:** [ui.pax.ch](https://ui.pax.ch) → [DESIGN.md](DESIGN.md) · [brand.pax.ch](https://brand.pax.ch) → [BRAND.md](BRAND.md)

## Material (hub `/material`, German PDFs)

The hub calls these "inspiration and context", optional to use. All are German only. Now in this repo under [`material/`](material/), with text extracts and summaries in [MATERIAL.md](MATERIAL.md).

| Document | Pages | What it is | Hub path |
|---|---|---|---|
| **All documents (ZIP, 10 PDFs, ~5 MB)** | | | `/material/pax-challenge-material.zip` |
| Personas | 3 | Example customers (single person, couple with baby, affluent couple): marital status, assets, income, workload | `/material/personas.pdf` |
| Legal framework | 3 | Data protection, traceability of AI recommendations, human review, secure implementation | `/material/legal-framework.pdf` |
| Pension analysis: single person | 12 | Completed Vorsorgecheck for a single person | `/material/pax-vorsorgeanalyse-einzelperson.pdf` |
| Pension analysis: couple with child | 20 | Completed Vorsorgecheck for a married couple with child, all three pillars | `/material/pax-vorsorgeanalyse-paar.pdf` |
| Suitability assessment | 7 | Appropriateness-check form for qualified life insurance (investment profile, risk capacity) | `/material/pax-angemessenheitspruefung.pdf` |
| Sample offer: LifeStar | 64 | Savings life insurance (TerzaLifeStarPlanInvest) | `/material/offerten/pax-lifestar.pdf` |
| Sample offer: FondsStar | 63 | Savings life insurance (TerzaFondsStarPlanInvest) | `/material/offerten/pax-fondsstar.pdf` |
| Sample offer: payout plan (AZP) | 34 | Auszahlungsplan with a defined payout phase | `/material/offerten/pax-auszahlungsplan.pdf` |
| Sample offer: disability income | 33 | Risk insurance, Erwerbsunfähigkeit (EU pension) | `/material/offerten/pax-erwerbsunfaehigkeit.pdf` |
| Sample offer: term life | 29 | Risk insurance, death benefit (Todesfall) | `/material/offerten/pax-todesfall.pdf` |

## Operation reference (generated from the Swagger file)

### Tag: Basisfunktionen


#### `APICalc_getSaving3aLimits`

- `POST https://baselhackathon2026.azurewebsites.net/viper/operation/standard/APICalc_getSaving3aLimits`
- required apikeys: calc.*


**Request body**

`{}` (no fields)


**Response** (`response` → APICalc_Saving3aLimits)

| Field | Type | | Description |
|---|---|---|---|
| `Max3aSaving` | number |  | max. 3a Sparbetrag pro Jahr für Personen mit BVG |
| `Max3aSavingWithoutP2` | number |  | max. 3a Sparbetrag pro Jahr für Personen ohne BVG |


#### `APICalc_getAgeLimits`

ermittelt Altersgrenzen

- `POST https://baselhackathon2026.azurewebsites.net/viper/operation/standard/APICalc_getAgeLimits`
- required apikeys: calc.*


**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `Sex` | integer | yes | 1=Male, 2=Female |
| `BirthYear` | integer | yes |  |


**Response** (`response` → APICalc_AgeLimits)

| Field | Type | | Description |
|---|---|---|---|
| `BirthYear` | integer |  |  |
| `CurrentAge` | integer |  |  |
| `MinimumAge` | integer |  |  |
| `MaximumAge` | integer |  |  |
| `RegularPensionAge` | integer |  |  |
| `YearsToRegularPensionAge` | integer |  |  |
| `MinimumAHVAge` | integer |  |  |
| `MaximumAHVAge` | integer |  |  |
| `MinimumPensionAge` | integer |  |  |
| `MaximumPensionAge` | integer |  |  |
| `MinimumSaving3aAge` | integer |  |  |
| `MaximumSaving3aAge` | integer |  |  |
| `MaximumSaving3aDuration` | integer |  |  |
| `AllowedForSaving3a` | boolean |  |  |
| `MaximumPurchaseP2Age` | integer |  |  |
| `MaximumPurchaseP2Duration` | integer |  |  |
| `AllowedForPurchaseP2` | boolean |  |  |


#### `APICalc_getTaxBaseInfo`

- `POST https://baselhackathon2026.azurewebsites.net/viper/operation/standard/APICalc_getTaxBaseInfo`
- required apikeys: calc.*


**Request body**

`{}` (no fields)


**Response** (`response` → APICalc_TaxBaseInfo)

| Field | Type | | Description |
|---|---|---|---|
| `TaxBaseVersion` | string |  |  |
| `TaxBaseDate` | string |  |  |


#### `APICalc_searchLocation`

Suche Steuerort, ignoriert Umlaute und Gross-/Kleinschreibweise, max. 200 Treffer

- `POST https://baselhackathon2026.azurewebsites.net/viper/operation/standard/APICalc_searchLocation`
- required apikeys: calc.*


**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `Search` | string |  | Suche: [PLZ ] Ort[, Kt] |
| `Language` | integer |  | 1=DE, 2=FR, 3=IT, 4=EN |


**Response** (`response` → APICalc_TaxLocation)

| Field | Type | | Description |
|---|---|---|---|
| `[]LocationID` | integer |  |  |
| `[]ZipCode` | string |  |  |
| `[]City` | string |  |  |
| `[]Canton` | string |  |  |
| `[]Location` | string |  |  |


#### `APICalc_searchLocationGeo`

Suche Steuerort anhand Position, max. 200 Treffer

- `POST https://baselhackathon2026.azurewebsites.net/viper/operation/standard/APICalc_searchLocationGeo`
- required apikeys: calc.*


**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `Latitude` | number |  |  |
| `Longitude` | number |  |  |
| `RadiusKm` | number |  |  |
| `Language` | integer |  | 1=DE, 2=FR, 3=IT, 4=EN |


**Response** (`response` → APICalc_TaxLocation)

| Field | Type | | Description |
|---|---|---|---|
| `[]LocationID` | integer |  |  |
| `[]ZipCode` | string |  |  |
| `[]City` | string |  |  |
| `[]Canton` | string |  |  |
| `[]Location` | string |  |  |


#### `APICalc_getLocation`

- `POST https://baselhackathon2026.azurewebsites.net/viper/operation/standard/APICalc_getLocation`
- required apikeys: calc.*


**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `TaxLocationID` | integer | yes |  |


**Response** (`response` → APICalc_TaxLocation)

| Field | Type | | Description |
|---|---|---|---|
| `LocationID` | integer |  |  |
| `ZipCode` | string |  |  |
| `City` | string |  |  |
| `Canton` | string |  |  |
| `Location` | string |  |  |


#### `APICalc_calculateIncome`

ermittelt das gewünschte Einkommen (Brutto, Netto, Steuerbar) einer Einzelperson anhand eines gegebenen Einkommens (Brutto, Netto, Steuerbar). Mindestbetrag ist 10000

- `POST https://baselhackathon2026.azurewebsites.net/viper/operation/standard/APICalc_calculateIncome`
- required apikeys: calc.*


**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `TaxLocationID` | integer | yes |  |
| `Relationship` | integer | yes | 1=Single, 2=Married, 3=Concubinage, 4=RegistredPartnership |
| `NumberOfChildren` | integer | yes | unterstützungspflichtige Kinder |
| `BirthYear` | integer | yes |  |
| `Income` | number | yes |  |
| `IncomeType` | integer | yes | 1=Gross, 2=Taxable, 3=Net |
| `CalculateIncomeType` | integer | yes | 1=Gross, 2=Taxable, 3=Net |


**Response** (`response` → inline)




### Tag: Steuern - Grundstücksgewinnsteuer


#### `APICalc_getAdditionalEstateGainFields`

Ermittelt die möglichen Zusatzwerte für die Berechnung der Grundstücksgewinnsteuer

- `POST https://baselhackathon2026.azurewebsites.net/viper/operation/standard/APICalc_getAdditionalEstateGainFields`
- required apikeys: calc.tax.estategain


**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `TaxLocationID` | integer | yes |  |


**Response** (`response` → APICalc_AdditionalEstateGainFields)

| Field | Type | | Description |
|---|---|---|---|
| `Confession` | boolean |  | braucht Konfession |
| `Revenues` | boolean |  | braucht Verkaufserlös |
| `FirstCost` | boolean |  | braucht Anlagekosten |
| `BuildingInvest` | boolean |  | braucht Bauinvestionen |
| `HasBuilding` | boolean |  | braucht ob überbaut |
| `SelfInhabitated` | boolean |  | braucht ob selbstbewohnt |
| `SelfInhabYears` | boolean |  | braucht Jahre selbstbewohnt |
| `HasDiscount` | boolean |  | braucht ob Eigentumsrabatt |


#### `APICalc_calculateEstateGainTax`

- `POST https://baselhackathon2026.azurewebsites.net/viper/operation/standard/APICalc_calculateEstateGainTax`
- required apikeys: calc.tax.estategain


**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `TaxLocationID` | integer | yes |  |
| `Relationship` | integer | yes | 1=Single, 2=Married, 3=Concubinage, 4=RegistredPartnership |
| `Confession1` | integer | yes | 1=Protestant, 2=RomanCatholic, 3=ChristCatholic, 4=None, 9=Other |
| `Confession2` | integer |  | 1=Protestant, 2=RomanCatholic, 3=ChristCatholic, 4=None, 9=Other |
| `ConfessionPart1` | integer |  | Anteil Konfession 1 (wie viele in Prozent der Familie haben diese Konfession, 0=automatisch) |
| `TaxableGain` | number |  | steuerbarer Gewinn |
| `OwnerYears` | integer |  | in Besitz seit wie vielen Jahren |
| `OwnerMonths` | integer |  | ... und Monaten |
| `Revenues` | number |  | Zusatzwert: Verkaufserlös |
| `FirstCosts` | number |  | Zusatzwert: Anlagekosten |
| `BuildingInvest` | number |  | Zusatzwert: Bauinvestionen |
| `HasBuilding` | boolean |  | Zusatzwert: ist überbaut |
| `SelfInhabited` | boolean |  | Zusatzwert: ist selbstbewohnt |
| `SelfInhabYears` | integer |  | Zusatzwert: selbstbewohnt seit wie vielen Jahren |
| `HasDiscount` | boolean |  | Zusatzwert: hat Eigentumsrabatt |


**Response** (`response` → APICalc_EstateGainTaxResult)

| Field | Type | | Description |
|---|---|---|---|
| `FederalTax` | number |  |  |
| `StateTax` | number |  |  |
| `CommunityTax` | number |  |  |
| `ChurchTax` | number |  |  |
| `TotalTaxes` | number |  |  |


### Tag: Steuern - Einkommens-/Vermögenssteuern


#### `APICalc_calculateIncomeFortuneTax`

- `POST https://baselhackathon2026.azurewebsites.net/viper/operation/standard/APICalc_calculateIncomeFortuneTax`
- required apikeys: calc.tax.income


**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `IncomeType` | integer | yes | 1=Gross, 2=Taxable, 3=Net |
| `Income` | number | yes |  |
| `Fortune` | number |  |  |
| `TaxRateDecisiveIncomeCanton` | number |  | Kanton, satzbestimmendes Einkommen, kann angegeben bei IncomeType=Taxable |
| `TaxRateDecisiveFortuneCanton` | number |  | Kanton, satzbestimmendes Vermögen, kann angegeben bei IncomeType=Taxable |
| `TaxableIncomeConf` | number |  | Bund, steuerbares Einkommen, kann angegeben bei IncomeType=Taxable |
| `TaxRateDecisiveIncomeConf` | number |  | Bund, satzbestimmendes Einkommen, kann angegeben bei IncomeType=Taxable |
| `TaxLocationID` | integer | yes |  |
| `Relationship` | integer | yes | 1=Single, 2=Married, 3=Concubinage, 4=RegistredPartnership |
| `Confession1` | integer | yes | 1=Protestant, 2=RomanCatholic, 3=ChristCatholic, 4=None, 9=Other |
| `Confession2` | integer |  | 1=Protestant, 2=RomanCatholic, 3=ChristCatholic, 4=None, 9=Other |
| `ConfessionPart1` | integer |  | Anteil Konfession 1 (wie viele in Prozent der Familie haben diese Konfession, 0=automatisch) |
| `NumberOfChildren` | integer | yes | unterstützungspflichtige Kinder |
| `BirthYear` | integer | yes |  |


**Response** (`response` → APICalc_IncomeFortuneTaxResult)

| Field | Type | | Description |
|---|---|---|---|
| `CommunityTax` | number |  | Gemeindesteuer |
| `ChurchTax` | number |  | Kirchensteuer |
| `StateTax` | number |  | Staatssteuer (Kanton) |
| `FederalTax` | number |  | Bundessteuer |
| `FortuneTax` | number |  | Vermögenssteuer |
| `PollTax` | number |  | Personalsteuer |
| `TotalTaxes` | number |  |  |
| `TaxFreedomDay` | integer |  |  |
| `MarginalTaxRate` | number |  |  |


### Tag: Steuern - Kapitalleistungssteuern


#### `APICalc_calculateCapitalTax`

- `POST https://baselhackathon2026.azurewebsites.net/viper/operation/standard/APICalc_calculateCapitalTax`
- required apikeys: calc.tax.capital


**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `CapitalPayment` | number | yes |  |
| `PaymentAge` | integer | yes |  |
| `TaxLocationID` | integer | yes |  |
| `Relationship` | integer | yes | 1=Single, 2=Married, 3=Concubinage, 4=RegistredPartnership |
| `Confession1` | integer | yes | 1=Protestant, 2=RomanCatholic, 3=ChristCatholic, 4=None, 9=Other |
| `Confession2` | integer |  | 1=Protestant, 2=RomanCatholic, 3=ChristCatholic, 4=None, 9=Other |
| `ConfessionPart1` | integer |  | Anteil Konfession 1 (wie viele in Prozent der Familie haben diese Konfession, 0=automatisch) |
| `NumberOfChildren` | integer | yes | unterstützungspflichtige Kinder |
| `Sex` | integer | yes | 1=Male, 2=Female |
| `BirthYear` | integer | yes |  |


**Response** (`response` → APICalc_CapitalTaxResult)

| Field | Type | | Description |
|---|---|---|---|
| `CapitalTaxes` | number |  | Total Kapitalleistungssteuern |
| `CommunityTax` | number |  | Gemeindesteuer |
| `ChurchTax` | number |  | Kirchensteuer |
| `StateTax` | number |  | Staatssteuer (Kanton) |
| `FederalTax` | number |  | Bundessteuer |
| `NetCapital` | number |  |  |
| `TaxPercentage` | number |  |  |


### Tag: Steuern - Erbschafts-/Schenkungssteuern


#### `APICalc_calculateAllInheritanceDonationTaxes`

- `POST https://baselhackathon2026.azurewebsites.net/viper/operation/standard/APICalc_calculateAllInheritanceDonationTaxes`
- required apikeys: calc.tax.inheritance


**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `TaxLocationID` | integer | yes |  |
| `Amount` | number |  |  |


**Response** (`response` → APICalc_InheritanceDonationTaxResult)

| Field | Type | | Description |
|---|---|---|---|
| `[]Group` | integer |  | 100=Spouse, 200=Partner, 300=Children, 400=Parents, 500=Grandparents, 600=Siblings, 700=UncleAunt, 800=Other |
| `[]Beneficiary` | integer |  | 101=Spouse, 201=LifePartner, 202=Fiance, 203=LifePartnerWithChild, 301=Children, 302=DescendantChildren, 303=FullOrphans, 304=FosterChildren, 305=DescendantFostgerChildren, 306=StepChildren, 307=DescendantStepChildren, 308=GodChildren, 401=Parents, 402=FosterParents, 403=StepParents, 501=Grandparents, 502=FosterGrandparents, 503=StepGrandparents, 504=GreatGrandparents, 601=Siblings, 602=StepSiblings, 701=Uncle, 702=GreatUncle, 703=Nephew, 704=GreatNephew, 705=GreatGreatNephew, 706=Cousin, 707=DescendantCousin, 801=Other, 802=Employed, 803=ParentsInLaw, 804=SonInLaw, 805=PersonsRelatedByMarriage, 806=Restricted, 807=NeedsPermanentCare, 808=IllegitimateChildren, 809=AssociationsOfPersons, 810=Foundations, 811=CharitableInstitutions |
| `[]InheritanceTaxes` | number |  | Erbschaftssteuern |
| `[]InheritanceExemption` | number |  | Freibetrag |
| `[]InheritanceDeduction` | number |  | Abzug |
| `[]DonationTaxes` | number |  | Schenkungssteuern |
| `[]DonationExemption` | number |  | Freibetrag |
| `[]DonationDeduction` | number |  | Abzug |


#### `APICalc_calculateGroupInheritanceDonationTaxes`

- `POST https://baselhackathon2026.azurewebsites.net/viper/operation/standard/APICalc_calculateGroupInheritanceDonationTaxes`
- required apikeys: calc.tax.inheritance


**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `TaxLocationID` | integer | yes |  |
| `Amount` | number |  |  |
| `Group` | integer | yes | 100=Spouse, 200=Partner, 300=Children, 400=Parents, 500=Grandparents, 600=Siblings, 700=UncleAunt, 800=Other |


**Response** (`response` → APICalc_InheritanceDonationTaxResult)

| Field | Type | | Description |
|---|---|---|---|
| `[]Group` | integer |  | 100=Spouse, 200=Partner, 300=Children, 400=Parents, 500=Grandparents, 600=Siblings, 700=UncleAunt, 800=Other |
| `[]Beneficiary` | integer |  | 101=Spouse, 201=LifePartner, 202=Fiance, 203=LifePartnerWithChild, 301=Children, 302=DescendantChildren, 303=FullOrphans, 304=FosterChildren, 305=DescendantFostgerChildren, 306=StepChildren, 307=DescendantStepChildren, 308=GodChildren, 401=Parents, 402=FosterParents, 403=StepParents, 501=Grandparents, 502=FosterGrandparents, 503=StepGrandparents, 504=GreatGrandparents, 601=Siblings, 602=StepSiblings, 701=Uncle, 702=GreatUncle, 703=Nephew, 704=GreatNephew, 705=GreatGreatNephew, 706=Cousin, 707=DescendantCousin, 801=Other, 802=Employed, 803=ParentsInLaw, 804=SonInLaw, 805=PersonsRelatedByMarriage, 806=Restricted, 807=NeedsPermanentCare, 808=IllegitimateChildren, 809=AssociationsOfPersons, 810=Foundations, 811=CharitableInstitutions |
| `[]InheritanceTaxes` | number |  | Erbschaftssteuern |
| `[]InheritanceExemption` | number |  | Freibetrag |
| `[]InheritanceDeduction` | number |  | Abzug |
| `[]DonationTaxes` | number |  | Schenkungssteuern |
| `[]DonationExemption` | number |  | Freibetrag |
| `[]DonationDeduction` | number |  | Abzug |


#### `APICalc_calculateBeneficiaryInheritanceDonationTax`

- `POST https://baselhackathon2026.azurewebsites.net/viper/operation/standard/APICalc_calculateBeneficiaryInheritanceDonationTax`
- required apikeys: calc.tax.inheritance


**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `TaxLocationID` | integer | yes |  |
| `Amount` | number |  |  |
| `Beneficiary` | integer | yes | 101=Spouse, 201=LifePartner, 202=Fiance, 203=LifePartnerWithChild, 301=Children, 302=DescendantChildren, 303=FullOrphans, 304=FosterChildren, 305=DescendantFostgerChildren, 306=StepChildren, 307=DescendantStepChildren, 308=GodChildren, 401=Parents, 402=FosterParents, 403=StepParents, 501=Grandparents, 502=FosterGrandparents, 503=StepGrandparents, 504=GreatGrandparents, 601=Siblings, 602=StepSiblings, 701=Uncle, 702=GreatUncle, 703=Nephew, 704=GreatNephew, 705=GreatGreatNephew, 706=Cousin, 707=DescendantCousin, 801=Other, 802=Employed, 803=ParentsInLaw, 804=SonInLaw, 805=PersonsRelatedByMarriage, 806=Restricted, 807=NeedsPermanentCare, 808=IllegitimateChildren, 809=AssociationsOfPersons, 810=Foundations, 811=CharitableInstitutions |


**Response** (`response` → APICalc_InheritanceDonationTaxResult)

| Field | Type | | Description |
|---|---|---|---|
| `Group` | integer |  | 100=Spouse, 200=Partner, 300=Children, 400=Parents, 500=Grandparents, 600=Siblings, 700=UncleAunt, 800=Other |
| `Beneficiary` | integer |  | 101=Spouse, 201=LifePartner, 202=Fiance, 203=LifePartnerWithChild, 301=Children, 302=DescendantChildren, 303=FullOrphans, 304=FosterChildren, 305=DescendantFostgerChildren, 306=StepChildren, 307=DescendantStepChildren, 308=GodChildren, 401=Parents, 402=FosterParents, 403=StepParents, 501=Grandparents, 502=FosterGrandparents, 503=StepGrandparents, 504=GreatGrandparents, 601=Siblings, 602=StepSiblings, 701=Uncle, 702=GreatUncle, 703=Nephew, 704=GreatNephew, 705=GreatGreatNephew, 706=Cousin, 707=DescendantCousin, 801=Other, 802=Employed, 803=ParentsInLaw, 804=SonInLaw, 805=PersonsRelatedByMarriage, 806=Restricted, 807=NeedsPermanentCare, 808=IllegitimateChildren, 809=AssociationsOfPersons, 810=Foundations, 811=CharitableInstitutions |
| `InheritanceTaxes` | number |  | Erbschaftssteuern |
| `InheritanceExemption` | number |  | Freibetrag |
| `InheritanceDeduction` | number |  | Abzug |
| `DonationTaxes` | number |  | Schenkungssteuern |
| `DonationExemption` | number |  | Freibetrag |
| `DonationDeduction` | number |  | Abzug |


### Tag: Steuern - Kapital- und Gewinnsteuer juristischer Personen


#### `APICalc_calculateCorporateEntityTax`

- `POST https://baselhackathon2026.azurewebsites.net/viper/operation/standard/APICalc_calculateCorporateEntityTax`
- required apikeys: calc.tax.corporateentity


**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `TaxLocationID` | integer | yes |  |
| `ProfitBeforeTaxes` | boolean |  | Berechnung vor(true) oder nach(false) Steuern |
| `TaxableProfitConf` | number |  | Steuerbarer Gewinn Bund |
| `TaxableProfitCanton` | number |  | Steuerbarer Gewinn Kanton |
| `TaxableCapital` | number |  | Steuerbares Kapital (Ende Jahr, inkl Gewinn) |
| `ShareCapital` | number |  | Aktienkapital |
| `NetProfitParticipationConf` | number |  | Nettoertrag qualifizierte Beteiligungen Bund |
| `NetProfitParticipationCanton` | number |  | Nettoertrag qualifizierte Beteiligungen Kanton |
| `InnovationsDeduction` | number |  | Abzug/Ermässigung für Innovationen (Patentbox, F&E) |
| `NotionalInterestDeduction` | number |  | Abzug Eigenfinanzierung |
| `TotalAssets` | number |  | Total Aktiven |
| `TotalBeneficiaryParticipation` | number |  | Total Anteile an qualifizierte Beteiligungen, Kapital an Patenten und Vergleichbar |


**Response** (`response` → APICalc_CorporateEntityTaxResult)

| Field | Type | | Description |
|---|---|---|---|
| `ProfitSimpleTaxState` | number |  |  |
| `ProfitSimpleTaxCommunity` | number |  |  |
| `ProfitCommunityTax` | number |  |  |
| `ProfitChurchTax` | number |  |  |
| `ProfitStateTax` | number |  |  |
| `ProfitFederalTax` | number |  |  |
| `TotalProfitTaxes` | number |  |  |
| `CapitalSimpleTaxState` | number |  |  |
| `CapitalSimpleTaxCommunity` | number |  |  |
| `CapitalCommunityTax` | number |  |  |
| `CapitalChurchTax` | number |  |  |
| `CapitalStateTax` | number |  |  |
| `TotalCapitalTaxes` | number |  |  |
| `MinimalTaxesCanton` | number |  |  |
| `TotalTaxes` | number |  |  |


### Tag: Steuern - Sparen 3a


#### `APICalc_calculateSaving3a`

- `POST https://baselhackathon2026.azurewebsites.net/viper/operation/standard/APICalc_calculateSaving3a`
- required apikeys: calc.tax.saving3a


**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `Duration` | integer | yes |  |
| `InitialInvestment` | number |  |  |
| `YearlyInvestment` | number |  |  |
| `InterestRate` | number |  |  |
| `IncomeType` | integer | yes | 1=Gross, 2=Taxable, 3=Net |
| `Income` | number | yes |  |
| `TaxRateDecisiveIncomeCanton` | number |  | Kanton, satzbestimmendes Einkommen, kann angegeben bei IncomeType=Taxable |
| `TaxableIncomeConf` | number |  | Bund, steuerbares Einkommen, kann angegeben bei IncomeType=Taxable |
| `TaxRateDecisiveIncomeConf` | number |  | Bund, satzbestimmendes Einkommen, kann angegeben bei IncomeType=Taxable |
| `TaxLocationID` | integer | yes |  |
| `Relationship` | integer | yes | 1=Single, 2=Married, 3=Concubinage, 4=RegistredPartnership |
| `Confession1` | integer | yes | 1=Protestant, 2=RomanCatholic, 3=ChristCatholic, 4=None, 9=Other |
| `Confession2` | integer |  | 1=Protestant, 2=RomanCatholic, 3=ChristCatholic, 4=None, 9=Other |
| `ConfessionPart1` | integer |  | Anteil Konfession 1 (wie viele in Prozent der Familie haben diese Konfession, 0=automatisch) |
| `NumberOfChildren` | integer | yes | unterstützungspflichtige Kinder |
| `Sex` | integer | yes | 1=Male, 2=Female |
| `BirthYear` | integer | yes |  |


**Response** (`response` → APICalc_Saving3aResult)

| Field | Type | | Description |
|---|---|---|---|
| `YearlyTaxBefore` | number |  | Steuern ohne Sparen 3a |
| `YearlyTaxAfter` | number |  | Steuern mit Sparen 3a |
| `YearlyTaxSavings` | number |  | jährliche Steuereinsparung durch Sparen 3a |
| `OverallTaxSavings` | number |  |  |
| `Deposits` | number |  |  |
| `Interest` | number |  |  |
| `GrossCapital` | number |  |  |
| `CapitalTax` | number |  |  |
| `NetCapital` | number |  |  |
| `NetYield` | number |  |  |
| `AlternativeGrossYield` | number |  | Notwendige Rendite für alternative Produkte |
| `DetailsDeposits` | object (APICalc_ResultDetail) |  |  |
| `DetailsDeposits.Periods` | integer |  | Anzahl Einträge/Perioden in Data |
| `DetailsDeposits.Data1` | array<number> |  | Anfangsbetrag einer Periode |
| `DetailsDeposits.Data2` | array<number> |  | Endbetrag einer Periode |
| `DetailsInterest` | object (APICalc_ResultDetail) |  |  |
| `DetailsInterest.Periods` | integer |  | Anzahl Einträge/Perioden in Data |
| `DetailsInterest.Data1` | array<number> |  | Anfangsbetrag einer Periode |
| `DetailsInterest.Data2` | array<number> |  | Endbetrag einer Periode |
| `DetailsTaxSaving` | object (APICalc_ResultDetail) |  |  |
| `DetailsTaxSaving.Periods` | integer |  | Anzahl Einträge/Perioden in Data |
| `DetailsTaxSaving.Data1` | array<number> |  | Anfangsbetrag einer Periode |
| `DetailsTaxSaving.Data2` | array<number> |  | Endbetrag einer Periode |


### Tag: Steuern - Einkauf in PK


#### `APICalc_calculatePurchaseP2`

- `POST https://baselhackathon2026.azurewebsites.net/viper/operation/standard/APICalc_calculatePurchaseP2`
- required apikeys: calc.tax.purchasep2


**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `Investment` | number | yes | Gesamter Einkauf, unabhängig der Einzahldauer |
| `PaymentDuration` | integer | yes | über wie viele Jahre einzahlen (Investition wird dabei aufgeteilt) |
| `InterestRate` | number | yes |  |
| `ConversionRate` | number |  | Umwandlungssatz |
| `IncomeType` | integer | yes | 1=Gross, 2=Taxable, 3=Net |
| `Income` | number | yes |  |
| `TaxRateDecisiveIncomeCanton` | number |  | Kanton, satzbestimmendes Einkommen, kann angegeben bei IncomeType=Taxable |
| `TaxableIncomeConf` | number |  | Bund, steuerbares Einkommen, kann angegeben bei IncomeType=Taxable |
| `TaxRateDecisiveIncomeConf` | number |  | Bund, satzbestimmendes Einkommen, kann angegeben bei IncomeType=Taxable |
| `TaxLocationID` | integer | yes |  |
| `Relationship` | integer | yes | 1=Single, 2=Married, 3=Concubinage, 4=RegistredPartnership |
| `Confession1` | integer | yes | 1=Protestant, 2=RomanCatholic, 3=ChristCatholic, 4=None, 9=Other |
| `Confession2` | integer |  | 1=Protestant, 2=RomanCatholic, 3=ChristCatholic, 4=None, 9=Other |
| `ConfessionPart1` | integer |  | Anteil Konfession 1 (wie viele in Prozent der Familie haben diese Konfession, 0=automatisch) |
| `NumberOfChildren` | integer | yes | unterstützungspflichtige Kinder |
| `Sex` | integer | yes | 1=Male, 2=Female |
| `BirthYear` | integer | yes |  |


**Response** (`response` → APICalc_PurchaseP2Result)

| Field | Type | | Description |
|---|---|---|---|
| `TaxSavings` | number |  |  |
| `NetInvestment` | number |  |  |
| `TaxSavingsPercentage` | number |  |  |
| `YearsToRetirement` | integer |  |  |
| `AdditionalCapital` | number |  |  |
| `AdditionalPension` | number |  |  |
| `NetYield` | number |  |  |
| `ConversionRate` | number |  |  |
| `DetailsCapital` | object (APICalc_ResultDetail) |  |  |
| `DetailsCapital.Periods` | integer |  | Anzahl Einträge/Perioden in Data |
| `DetailsCapital.Data1` | array<number> |  | Anfangsbetrag einer Periode |
| `DetailsCapital.Data2` | array<number> |  | Endbetrag einer Periode |


### Tag: Sparen/Verzehren


#### `APICalc_calculateSaving`

- `POST https://baselhackathon2026.azurewebsites.net/viper/operation/standard/APICalc_calculateSaving`
- required apikeys: calc.saving


**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `SavingGoal` | integer | yes | 1=EndCapital, 2=Investment, 3=Duration, 4=InterestRate |
| `Duration` | integer |  | Spardauer in Jahren (SavingGoal != Duration) |
| `InitialInvestment` | number |  | Ersteinlage/Startkapital |
| `InvestmentMonthly` | boolean |  | Einzahlung monatlich(true) oder jährlich(false) |
| `PeriodicInvestment` | number |  | Regelmässige Einzalung (SavingGoal != Investment) |
| `InterestRate` | number |  | Zinssatz (SavingGoal != InterestRate) |
| `EndCapital` | number |  | Endkapital (SavingGoal != EndCapital) |


**Response** (`response` → APICalc_SavingResult)

| Field | Type | | Description |
|---|---|---|---|
| `Deposits` | number |  | Summe der Einlagen |
| `Interest` | number |  | Summe der Zinsen |
| `GrossCapital` | number |  | Endkapital |
| `PeriodicInvestment` | number |  | Periodische Einlage |
| `DurationYears` | integer |  | Dauer in ganze Jahren |
| `DurationMonths` | integer |  | Restdauer in Monaten im letzten Jahr |
| `InterestRate` | number |  | Zinssatz |
| `DetailsDeposits` | object (APICalc_ResultDetail) |  |  |
| `DetailsDeposits.Periods` | integer |  | Anzahl Einträge/Perioden in Data |
| `DetailsDeposits.Data1` | array<number> |  | Anfangsbetrag einer Periode |
| `DetailsDeposits.Data2` | array<number> |  | Endbetrag einer Periode |
| `DetailsInterest` | object (APICalc_ResultDetail) |  |  |
| `DetailsInterest.Periods` | integer |  | Anzahl Einträge/Perioden in Data |
| `DetailsInterest.Data1` | array<number> |  | Anfangsbetrag einer Periode |
| `DetailsInterest.Data2` | array<number> |  | Endbetrag einer Periode |


#### `APICalc_calculateConsumption`

- `POST https://baselhackathon2026.azurewebsites.net/viper/operation/standard/APICalc_calculateConsumption`
- required apikeys: calc.saving


**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `ConsumptionGoal` | integer | yes | 1=Withdrawal, 2=Duration, 3=EndCapital, 4=InterestRate |
| `StartCapital` | number |  |  |
| `InterestRate` | number |  | Zinssatz (ConsumptionGoal != InterestRate) |
| `WithdrawalMonthly` | boolean |  | Bezug monatlich(true) oder jährlich(false) |
| `Withdrawal` | number |  | Regelmässiger Bezug (ConsumptionGoal != Withdrawal) |
| `Duration` | integer |  | Bezugsdauer in Jahren (ConsumptionGoal != Duration) |
| `EndCapital` | number |  | Endkapital (ConsumptionGoal != EndCapital) |


**Response** (`response` → APICalc_ConsumptionResult)

| Field | Type | | Description |
|---|---|---|---|
| `Withdrawal` | number |  | Periodischer Bezug |
| `DurationYears` | integer |  | Dauer in ganze Jahren |
| `DurationMonths` | integer |  | Restdauer in Monaten im letzten Jahr |
| `EndCapital` | number |  | Verbleibendes Endkapital |
| `InterestRate` | number |  | Zinssatz |
| `DetailsCapital` | object (APICalc_ResultDetail) |  |  |
| `DetailsCapital.Periods` | integer |  | Anzahl Einträge/Perioden in Data |
| `DetailsCapital.Data1` | array<number> |  | Anfangsbetrag einer Periode |
| `DetailsCapital.Data2` | array<number> |  | Endbetrag einer Periode |


#### `APICalc_calculateBudgetProposal`

- `POST https://baselhackathon2026.azurewebsites.net/viper/operation/standard/APICalc_calculateBudgetProposal`
- required apikeys: calc.saving


**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `BudgetMonthly` | boolean |  | Budgetangaben monatlich(true) oder jährlich(false), für Input als auch Output |
| `IncomeType` | integer | yes | 1=Gross, 3=Net |
| `Income` | number | yes | Haushaltseinkommen |
| `Relationship` | integer | yes | 1=Single, 2=Married, 3=Concubinage, 4=RegistredPartnership |
| `NumberOfChildren` | integer |  | unterstützungspflichtige Kinder |
| `UseEffectiveTax` | boolean |  | verwende effektive/erfasste Steuern (anstelle statistischem Steuerwert) |
| `EffectiveTaxValue` | number |  | effektive Steuern |
| `Language` | integer |  | Ausgabesprache der Budgetpositionen, default DE — 1=DE, 2=FR, 3=IT, 4=EN |


**Response** (`response` → APICalc_BudgetResult)

| Field | Type | | Description |
|---|---|---|---|
| `Categories` | array<object> (APICalc_BudgetCategory) |  |  |
| `Categories[].[]Description` | string |  |  |
| `Categories[].[]Amount` | number |  |  |
| `Categories[].[]Details` | array<object> (APICalc_BudgetCategoryDetail) |  |  |
| `Categories[].[]Details[].[]Description` | string |  |  |
| `Categories[].[]Details[].[]Amount` | number |  |  |
| `SumExpenses` | number |  | Total Ausgaben |
| `IncomeNet` | number |  | Haushaltseinkommen netto (nach Sozialleistungsabzügen) |
| `SavingQuote` | number |  | Sparquote (positiv), sonst Ausgabenüberschuss (negativ) |


### Tag: Vorsorge-Check


#### `APICalc_calculateRiskBase`

berechnet die Rentengrundlagen der 2. Säule im Risikofall

- `POST https://baselhackathon2026.azurewebsites.net/viper/operation/standard/APICalc_calculateRiskBase`
- required apikeys: calc.check.risk


**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `Relationship` | integer | yes | 1=Single, 2=Married, 3=Concubinage, 4=RegistredPartnership |
| `RelationshipSinceYear` | integer | yes |  |
| `Person1` | object (APICalc_RiskPerson) | yes |  |
| `Person1.Sex` | integer | yes | 1=Male, 2=Female |
| `Person1.BirthYear` | integer | yes |  |
| `Person1.GrossIncome` | number |  |  |
| `Person1.NumberOfChildren` | integer |  | Kinder mit alleinigem Sorgerecht |
| `Person1.WithBVG` | boolean | yes |  |
| `Person1.Pillar2Pensions` | object (APICalc_RiskPensionPillar2) |  | Leistungen aus der 2. Säule |
| `Person1.Pillar2Pensions.CoverageCapital` | number |  | Aktuelles Deckungskapital fuer Subsidiaerleistung bei Unfall. Falls 0: keine Subsidiaerleistungen. |
| `Person1.Pillar2Pensions.Disability` | number | yes | IV-Rente, nur bei Krankheit |
| `Person1.Pillar2Pensions.DisabilityChildren` | number | yes | IV-Kinderrente, nur bei Krankheit |
| `Person1.Pillar2Pensions.Widow` | number | yes | Witwen-/Witwerrente, nur bei Krankheit |
| `Person1.Pillar2Pensions.Orphan` | number | yes | Waisenrente, nur bei Krankheit |
| `Person1.NeedInPcDisability` | boolean |  | Bedarf IV in Prozent (sonst als Betrag) |
| `Person1.NeedDisability` | number |  | Bedarf IV |
| `Person1.NeedInPcDeath` | boolean |  | Bedarf Todesfall in Prozent (sonst als Betrag) |
| `Person1.NeedDeath` | number |  | Bedarf Todesfall |
| `Person2` | object (APICalc_RiskPerson) |  |  |
| `Person2.Sex` | integer | yes | 1=Male, 2=Female |
| `Person2.BirthYear` | integer | yes |  |
| `Person2.GrossIncome` | number |  |  |
| `Person2.NumberOfChildren` | integer |  | Kinder mit alleinigem Sorgerecht |
| `Person2.WithBVG` | boolean | yes |  |
| `Person2.Pillar2Pensions` | object (APICalc_RiskPensionPillar2) |  | Leistungen aus der 2. Säule |
| `Person2.Pillar2Pensions.CoverageCapital` | number |  | Aktuelles Deckungskapital fuer Subsidiaerleistung bei Unfall. Falls 0: keine Subsidiaerleistungen. |
| `Person2.Pillar2Pensions.Disability` | number | yes | IV-Rente, nur bei Krankheit |
| `Person2.Pillar2Pensions.DisabilityChildren` | number | yes | IV-Kinderrente, nur bei Krankheit |
| `Person2.Pillar2Pensions.Widow` | number | yes | Witwen-/Witwerrente, nur bei Krankheit |
| `Person2.Pillar2Pensions.Orphan` | number | yes | Waisenrente, nur bei Krankheit |
| `Person2.NeedInPcDisability` | boolean |  | Bedarf IV in Prozent (sonst als Betrag) |
| `Person2.NeedDisability` | number |  | Bedarf IV |
| `Person2.NeedInPcDeath` | boolean |  | Bedarf Todesfall in Prozent (sonst als Betrag) |
| `Person2.NeedDeath` | number |  | Bedarf Todesfall |
| `NumberOfChildren` | integer |  | gemeinsame Kinder |


**Response** (`response` → APICalc_RiskBaseResult)

| Field | Type | | Description |
|---|---|---|---|
| `Person1` | object (APICalc_RiskPensionPillar2) |  |  |
| `Person1.CoverageCapital` | number |  | Aktuelles Deckungskapital fuer Subsidiaerleistung bei Unfall. Falls 0: keine Subsidiaerleistungen. |
| `Person1.Disability` | number | yes | IV-Rente, nur bei Krankheit |
| `Person1.DisabilityChildren` | number | yes | IV-Kinderrente, nur bei Krankheit |
| `Person1.Widow` | number | yes | Witwen-/Witwerrente, nur bei Krankheit |
| `Person1.Orphan` | number | yes | Waisenrente, nur bei Krankheit |
| `Person2` | object (APICalc_RiskPensionPillar2) |  |  |
| `Person2.CoverageCapital` | number |  | Aktuelles Deckungskapital fuer Subsidiaerleistung bei Unfall. Falls 0: keine Subsidiaerleistungen. |
| `Person2.Disability` | number | yes | IV-Rente, nur bei Krankheit |
| `Person2.DisabilityChildren` | number | yes | IV-Kinderrente, nur bei Krankheit |
| `Person2.Widow` | number | yes | Witwen-/Witwerrente, nur bei Krankheit |
| `Person2.Orphan` | number | yes | Waisenrente, nur bei Krankheit |


#### `APICalc_calculateRisk`

berechnet die Risikosituationen

- `POST https://baselhackathon2026.azurewebsites.net/viper/operation/standard/APICalc_calculateRisk`
- required apikeys: calc.check.risk


**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `Relationship` | integer | yes | 1=Single, 2=Married, 3=Concubinage, 4=RegistredPartnership |
| `RelationshipSinceYear` | integer | yes |  |
| `Person1` | object (APICalc_RiskPerson) | yes |  |
| `Person1.Sex` | integer | yes | 1=Male, 2=Female |
| `Person1.BirthYear` | integer | yes |  |
| `Person1.GrossIncome` | number |  |  |
| `Person1.NumberOfChildren` | integer |  | Kinder mit alleinigem Sorgerecht |
| `Person1.WithBVG` | boolean | yes |  |
| `Person1.Pillar2Pensions` | object (APICalc_RiskPensionPillar2) |  | Leistungen aus der 2. Säule |
| `Person1.Pillar2Pensions.CoverageCapital` | number |  | Aktuelles Deckungskapital fuer Subsidiaerleistung bei Unfall. Falls 0: keine Subsidiaerleistungen. |
| `Person1.Pillar2Pensions.Disability` | number | yes | IV-Rente, nur bei Krankheit |
| `Person1.Pillar2Pensions.DisabilityChildren` | number | yes | IV-Kinderrente, nur bei Krankheit |
| `Person1.Pillar2Pensions.Widow` | number | yes | Witwen-/Witwerrente, nur bei Krankheit |
| `Person1.Pillar2Pensions.Orphan` | number | yes | Waisenrente, nur bei Krankheit |
| `Person1.NeedInPcDisability` | boolean |  | Bedarf IV in Prozent (sonst als Betrag) |
| `Person1.NeedDisability` | number |  | Bedarf IV |
| `Person1.NeedInPcDeath` | boolean |  | Bedarf Todesfall in Prozent (sonst als Betrag) |
| `Person1.NeedDeath` | number |  | Bedarf Todesfall |
| `Person2` | object (APICalc_RiskPerson) |  |  |
| `Person2.Sex` | integer | yes | 1=Male, 2=Female |
| `Person2.BirthYear` | integer | yes |  |
| `Person2.GrossIncome` | number |  |  |
| `Person2.NumberOfChildren` | integer |  | Kinder mit alleinigem Sorgerecht |
| `Person2.WithBVG` | boolean | yes |  |
| `Person2.Pillar2Pensions` | object (APICalc_RiskPensionPillar2) |  | Leistungen aus der 2. Säule |
| `Person2.Pillar2Pensions.CoverageCapital` | number |  | Aktuelles Deckungskapital fuer Subsidiaerleistung bei Unfall. Falls 0: keine Subsidiaerleistungen. |
| `Person2.Pillar2Pensions.Disability` | number | yes | IV-Rente, nur bei Krankheit |
| `Person2.Pillar2Pensions.DisabilityChildren` | number | yes | IV-Kinderrente, nur bei Krankheit |
| `Person2.Pillar2Pensions.Widow` | number | yes | Witwen-/Witwerrente, nur bei Krankheit |
| `Person2.Pillar2Pensions.Orphan` | number | yes | Waisenrente, nur bei Krankheit |
| `Person2.NeedInPcDisability` | boolean |  | Bedarf IV in Prozent (sonst als Betrag) |
| `Person2.NeedDisability` | number |  | Bedarf IV |
| `Person2.NeedInPcDeath` | boolean |  | Bedarf Todesfall in Prozent (sonst als Betrag) |
| `Person2.NeedDeath` | number |  | Bedarf Todesfall |
| `NumberOfChildren` | integer |  | gemeinsame Kinder |
| `WithChildren` | boolean |  |  |


**Response** (`response` → APICalc_RiskResult)

| Field | Type | | Description |
|---|---|---|---|
| `RiskScenarioSummaries` | array<object> (APICalc_RiskScenarioSummary) |  |  |
| `RiskScenarioSummaries[].[]Scenario` | integer |  | 1=Disability_Sickness_P1, 2=Disability_Accident_P1, 3=Death_Sickness_P1, 4=Death_Accident_P1, 5=Disability_Sickness_P2, 6=Disability_Accident_P2, 7=Death_Sickness_P2, 8=Death_Accident_P2 |
| `RiskScenarioSummaries[].[]ErrorCode` | integer |  | 1=OK, 2=InternalError, 8=Person1_already_retired_or_retired_soon, 9=Person2_already_retired_or_retired_soon |
| `RiskScenarioSummaries[].[]GrossIncome` | number |  | Bruttoeinkommen (als Referenz) |
| `RiskScenarioSummaries[].[]IncomeNeed` | number |  | Bedarf |
| `RiskScenarioSummaries[].[]IncomeGap` | number |  | Einkommenslücke |
| `RiskScenarioSummaries[].[]IncomeSurplus` | number |  | Einnahmenüberschuss |
| `RiskScenarioSummaries[].[]IncomeTotal` | number |  | Total Renteneinkommen und Einkommen Partner bei Pension |
| `RiskScenarioSummaries[].[]IncomePillar1` | number |  | Renten aus 1. Säule |
| `RiskScenarioSummaries[].[]IncomePillar2` | number |  | Renten aus 2. Säule |
| `RiskScenarioSummaries[].[]IncomePartner` | number |  | Beim 1. Rentenfall Pension. Einkommen vom Partner der noch arbeitet |
| `RiskScenarioSummaries[].[]CapitalGap` | number |  | Kapitalisierte Lücke |


### Tag: Pension-Check


#### `APICalc_calculateRetirementBase`

berechnet die Rentengrundlagen der 2. Säule für die Altersvorsorge (reguläres Pensionsalter)

- `POST https://baselhackathon2026.azurewebsites.net/viper/operation/standard/APICalc_calculateRetirementBase`
- required apikeys: calc.check.retirement


**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `Relationship` | integer | yes | 1=Single, 2=Married, 3=Concubinage, 4=RegistredPartnership |
| `RelationshipSinceYear` | integer | yes |  |
| `Person1` | object (APICalc_RetirementPerson) | yes |  |
| `Person1.Sex` | integer | yes | 1=Male, 2=Female |
| `Person1.BirthYear` | integer | yes |  |
| `Person1.GrossIncome` | number |  |  |
| `Person1.WithBVG` | boolean | yes |  |
| `Person1.RetirementPillar2` | object (APICalc_RetirementPillar2) |  | Leistungen aus der 2. Säule |
| `Person1.RetirementPillar2.Pension` | number | yes | Altersrente |
| `Person1.RetirementPillar2.CurrentCapital` | number |  | Aktuelles Guthaben. Wird approximiert falls nicht vorhanden (0) |
| `Person1.DesiredRetirementAge` | integer |  | Alter Erwerbsaufgabe |
| `Person2` | object (APICalc_RetirementPerson) |  |  |
| `Person2.Sex` | integer | yes | 1=Male, 2=Female |
| `Person2.BirthYear` | integer | yes |  |
| `Person2.GrossIncome` | number |  |  |
| `Person2.WithBVG` | boolean | yes |  |
| `Person2.RetirementPillar2` | object (APICalc_RetirementPillar2) |  | Leistungen aus der 2. Säule |
| `Person2.RetirementPillar2.Pension` | number | yes | Altersrente |
| `Person2.RetirementPillar2.CurrentCapital` | number |  | Aktuelles Guthaben. Wird approximiert falls nicht vorhanden (0) |
| `Person2.DesiredRetirementAge` | integer |  | Alter Erwerbsaufgabe |


**Response** (`response` → APICalc_RetirementBaseResult)

| Field | Type | | Description |
|---|---|---|---|
| `Person1` | object (APICalc_RetirementPillar2) |  |  |
| `Person1.Pension` | number | yes | Altersrente |
| `Person1.CurrentCapital` | number |  | Aktuelles Guthaben. Wird approximiert falls nicht vorhanden (0) |
| `Person2` | object (APICalc_RetirementPillar2) |  |  |
| `Person2.Pension` | number | yes | Altersrente |
| `Person2.CurrentCapital` | number |  | Aktuelles Guthaben. Wird approximiert falls nicht vorhanden (0) |


#### `APICalc_calculateRetirement`

berechnet die Altersvorsorge

- `POST https://baselhackathon2026.azurewebsites.net/viper/operation/standard/APICalc_calculateRetirement`
- required apikeys: calc.check.retirement


**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `Relationship` | integer | yes | 1=Single, 2=Married, 3=Concubinage, 4=RegistredPartnership |
| `RelationshipSinceYear` | integer | yes |  |
| `Person1` | object (APICalc_RetirementPerson) | yes |  |
| `Person1.Sex` | integer | yes | 1=Male, 2=Female |
| `Person1.BirthYear` | integer | yes |  |
| `Person1.GrossIncome` | number |  |  |
| `Person1.WithBVG` | boolean | yes |  |
| `Person1.RetirementPillar2` | object (APICalc_RetirementPillar2) |  | Leistungen aus der 2. Säule |
| `Person1.RetirementPillar2.Pension` | number | yes | Altersrente |
| `Person1.RetirementPillar2.CurrentCapital` | number |  | Aktuelles Guthaben. Wird approximiert falls nicht vorhanden (0) |
| `Person1.DesiredRetirementAge` | integer |  | Alter Erwerbsaufgabe |
| `Person2` | object (APICalc_RetirementPerson) |  |  |
| `Person2.Sex` | integer | yes | 1=Male, 2=Female |
| `Person2.BirthYear` | integer | yes |  |
| `Person2.GrossIncome` | number |  |  |
| `Person2.WithBVG` | boolean | yes |  |
| `Person2.RetirementPillar2` | object (APICalc_RetirementPillar2) |  | Leistungen aus der 2. Säule |
| `Person2.RetirementPillar2.Pension` | number | yes | Altersrente |
| `Person2.RetirementPillar2.CurrentCapital` | number |  | Aktuelles Guthaben. Wird approximiert falls nicht vorhanden (0) |
| `Person2.DesiredRetirementAge` | integer |  | Alter Erwerbsaufgabe |
| `CurrentFortune` | number |  | heutiges Vermögen |
| `InterestRate` | number |  | Zinssatz (Aufbau und Verzehr) |
| `Saving` | number |  | Sparquote |
| `NeedInPcRetirement` | boolean |  | Bedarf im Alter in Prozent (sonst als Betrag) |
| `NeedRetirement` | number |  | Bedarf im Alter |
| `LiveSpan` | integer |  | Lebensspanne (Default: 88) |


**Response** (`response` → APICalc_RetirementResult)

| Field | Type | | Description |
|---|---|---|---|
| `ErrorCode` | integer |  | 1=OK, 2=InternalError, 8=Person1_already_retired_or_retired_soon, 9=Person2_already_retired_or_retired_soon |
| `GrossIncome` | number |  | Bruttoeinkommen (als Referenz) |
| `IncomeNeed` | number |  | Bedarf |
| `IncomeGap` | number |  | Einkommenslücke |
| `IncomeTotal` | number |  | Total Renteneinkommen |
| `IncomePillar1` | number |  | Renten aus 1. Säule |
| `IncomePillar2` | number |  | Renten aus 2. Säule |
| `IncomeWithdrawal` | number |  | Vermögensverzehr |
| `AvailableFortune` | number |  | Verfügbares Vermögen per 1. Rentenfall |
| `CapitalNeed` | number |  | Notwendiges Vermögen per 1. Rentenfall |
| `CapitalGap` | number |  | Kapitalisierte Lücke per 1. Rentenfall |


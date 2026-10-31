# Pax Challenge Material

> Source: `pax-challenge-material.zip` from https://pax-hackathon-2026.vercel.app/material (hub login), received 2026-10-30.
> The hub describes it as "inspiration and context, optional to use". All documents are in German.
> - Original PDFs: [`material/`](material/) and [`material/offerten/`](material/offerten/)
> - Full text extracts (`pdftotext -layout`, searchable): [`material/text/`](material/text/)
>
> The summaries below are what the documents state. Numbers are CHF per year unless noted.

| Document | Pages | Text extract |
|---|---|---|
| [Personas](material/personas.pdf) | 3 | [personas.txt](material/text/personas.txt) |
| [Legal framework](material/legal-framework.pdf) | 3 | [legal-framework.txt](material/text/legal-framework.txt) |
| [Vorsorgecheck: single person](material/pax-vorsorgeanalyse-einzelperson.pdf) | 12 | [txt](material/text/pax-vorsorgeanalyse-einzelperson.txt) |
| [Vorsorgecheck: couple with child](material/pax-vorsorgeanalyse-paar.pdf) | 20 | [txt](material/text/pax-vorsorgeanalyse-paar.txt) |
| [Angemessenheitsprüfung (suitability check)](material/pax-angemessenheitspruefung.pdf) | 7 | [txt](material/text/pax-angemessenheitspruefung.txt) |
| [Offer: LifeStar](material/offerten/pax-lifestar.pdf) | 64 | [txt](material/text/offerten/pax-lifestar.txt) |
| [Offer: FondsStar](material/offerten/pax-fondsstar.pdf) | 63 | [txt](material/text/offerten/pax-fondsstar.txt) |
| [Offer: Auszahlungsplan](material/offerten/pax-auszahlungsplan.pdf) | 34 | [txt](material/text/offerten/pax-auszahlungsplan.txt) |
| [Offer: Erwerbsunfähigkeit](material/offerten/pax-erwerbsunfaehigkeit.pdf) | 33 | [txt](material/text/offerten/pax-erwerbsunfaehigkeit.txt) |
| [Offer: Todesfall](material/offerten/pax-todesfall.pdf) | 29 | [txt](material/text/offerten/pax-todesfall.txt) |

---

## 1. Personas (test customers for the advisor)

Transcribed from the slide (page 2):

| Persona | People | Marital status | Assets | Income / workload |
|---|---|---|---|---|
| **Young family** | Mrs. Jane Müller (01.06.1986), Mr. May Müller (16.09.1984) | Married | CHF 20'000 | CHF 100'000; Mr. Müller 100%. Ms. Müller does not work; **baby is 5 months old** |
| **Affluent couple** | Mrs. Lily Smith (08.08.1976), Mr. Wilson Smith (16.09.1967) | Married | CHF 500'000 | Husband 100% / CHF 200'000; wife 80% / CHF 80'000 *(the slide says "Mr./Ms. Müller", which looks like a copy-paste slip for the Smiths)* |
| **Single professional** | Mr. Taylor Johnson (16.09.1995) | Single | CHF 500'000 | 90% / CHF 100'000 |

## 2. Legal framework (non-exhaustive, written for the challenge)

1. **Data protection and information to the customer:** process customer, financial and health data transparently, with advance information. Personal data must not be sent to external AI models or cloud services in an uncontrolled way.
2. **Traceability of AI recommendations:** recommendations must be explainable, documented and auditable for customers and for internal and external auditors. Each one must rest on traceable criteria.
3. **Human verification before critical decisions:** the AI advisor must not replace human review in complex cases or where the customer faces significant implications. Both cases are triggered by predefined criteria.
4. **Secure, compliant implementation:** access protection, logging and encryption. Comply with insurance law and contractual requirements (information duties, formal requirements, anti-money laundering).

## 3. Vorsorgecheck: what a real Pax pension analysis looks like

Both analyses use the same structure, and a digital advisor could reproduce it. For each risk, the document compares **today's income**, the **Vorsorgebedarf** (pension need) and the **income from the 1st pillar (AHV/IV), the 2nd pillar (BVG/UVG) and other sources**. It then shows the **Lücke** (gap) or surplus over time.

Sections: Grundlagen (personal data) → Erwerbsunfähigkeit (disability) by illness and by accident → Tod (death) by illness and by accident → Erleben (retirement) → Annahmen (assumptions) → Rechtliche Bestimmungen (legal notes).

Timeline for disability: day 1 → day 2–360 (salary continuation / daily allowance, LFZ/Taggeld) → day 361–720 → day 721 to age 65 (IV and BVG/UVG pensions). Need is assumed at about **80% of gross income** in the long run (100% short term). For death the analysis looks at survivors' needs.

### 3a. Single person (born 1967, single, employed, gross CHF 89'700)

| Risk | Need | Income | Gap |
|---|---|---|---|
| Disability, illness (year 3+) | 71'760 | 64'560 (IV 26'616 + BVG 37'944) | **−7'200** |
| Disability, accident (year 3+) | 71'760 | 80'730 (IV 26'616 + UVG 54'114) | 0 (surplus) |
| Short-term disability (day 2–720) | 89'700 | 71'760 | **−17'940** |
| Death | 0 (no dependants) | 0 | 0 |
| Retirement (65) | 71'760 | 48'119 (AHV 29'354 + BVG 18'765) | **−23'641** |

Assumption: BVG interest rate 1.00%.

### 3b. Married couple with child (married since 26.09.2025, child born 03.11.2025, education ends 2043)

Person A (born 1987, gross 89'516) and person B (born 1991, gross 84'000), both employed.

| Risk | Need | Income | Gap |
|---|---|---|---|
| A disability, illness: until 2043 / after | 71'613 | 73'934 / 57'584 | +2'321 / **−14'029** |
| A death, illness: until 2043 / after | 62'661 | 58'555 / 42'001 | **−4'106 / −20'660** |
| A death, accident | 62'661 | 80'564 / 68'146 | surplus |
| B disability, illness: until 2043 / to 60 / to 65 | 67'200 | 75'600 / 65'712 / 64'680 | +8'400 / **−1'488 / −2'520** |
| B death, illness: until 2043 / after | 58'800 | 64'080 / 45'516 | +5'280 / **−13'284** |
| **Retirement (household)** | 138'813 | 104'986 (AHV 49'140 + BVG 55'846) | **−33'827** |

Takeaway: accidents are well covered by UVG, while illness is the gap that matters. The partner's need for death cover grows once the child's orphan's pension ends (2043). Both cases show a large retirement gap, which is where the 3rd pillar comes in.

## 4. Angemessenheitsprüfung (suitability check for qualified life insurance)

This is required by law **before recommending** a unit-linked savings life insurance, where the customer carries investment risk. It's a good candidate for an in-app flow with transparent, auditable scoring.

**A. Affordability / risk capacity** (bracket answers, no points). The form also asks for the planned annual premium and the one-off investment.
- A1 net income: < 75k / 75–150k / 150–250k / > 250k
- A2 net assets: < 10k / 10–50k / 50–150k / 150–300k / > 300k
- A3 extra annual saving capacity after all costs: < 1k / 1–3k / 3–7k / > 7k
- A4 possible one-off investment: < 10k / 10–50k / 50–150k / 150–300k / > 300k

**B. Goal and horizon**
- B1 goal: minimise loss risk (0 points) · some risk for moderate gains (15) · high risk for high gains (30)
- B2 horizon: 10–15 years (15) · > 15 years (30)

**C. Knowledge and risk tolerance**
- C1 securities knowledge: none (0) · knowledge, no purchases (10) · knowledge and experience (20) · very experienced (30)
- C2 reaction to a −30% drop: sell all (0) · sell part (10) · do nothing (20) · buy more (30)

**D. Guaranteed share:** total = `points × (100% − g) + 120 × g`, where g is the guaranteed share of the premium.

**Result: investment strategy**

| Profile | Points | Pax funds |
|---|---|---|
| Konservativ | ≤ 44 | Pax (CH) Sustainable Portfolio Target Return ALV T (max. 25% equities) |
| Ausgewogen | 45–84 | Sustainable Portfolio 25 / 50 / 75 ALV T (max. 30% / 50% / 90% equities) |
| Dynamisch | ≥ 85 | Sustainable Portfolio 100 ALV T; Quality Select ALV T (Auszahlungsplan only); Sustainable Equity Switzerland Small & Mid Cap ALV T and UBS MSCI World Selection UCITS ETF (not for Auszahlungsplan) |

The form ends with the chosen product, premium and fund, and with signatures. See the text extract for pages 5–7.

## 5. Sample offers (Pax product portfolio, sample customer "Max Muster", born 01.01.1987)

All offers are dated 21.10.2026, contract 01.11.2026 → 01.11.2051, and come from an advisor in Basel. Common features of the risk riders: a **Krisencoach** (support service up to CHF 2'500 after 90 days of disability), **premium waiver** after 3 months, a **disability pension** after a 24-month waiting period, and continued cover when moving within Europe. There is a 14-day right of withdrawal.

| Product | Pillar | What it is | Key figures in the sample |
|---|---|---|---|
| **Pax Spar-Lebensversicherung, LifeStar** (TerzaLifeStarPlanInvest) | 3a (gebunden) | Savings plus life cover. Hybrid: periodic premium 50% guaranteed (0.35% p.a.) and 50% fund; one-off premium 80% guaranteed (0.05%) and 20% fund. Fund: Pax (CH) Sustainable Equity Switzerland Small & Mid Cap | Premium 7'258/yr (the 3a maximum) plus 50'000 one-off. Maturity value (medium scenario) 294'079, of which 117'696 guaranteed. Death benefit min. 221'449.50. Disability pension 6'000/yr |
| **Pax Spar-Lebensversicherung, FondsStar** (TerzaFondsStarPlanInvest) | 3a | Savings plus life cover, 100% fund. Annual fund rebalancing from 2046. Premium waiver for 4 months when a child is born | Premium 7'258/yr plus 50'000 one-off. Maturity value (medium scenario) 409'946. Death benefit min. 195'041 or fund value +5%. Disability pension 6'000/yr |
| **Pax Auszahlungsplan** | 3b (frei) | Payout plan: invest a lump sum, receive staged annual payouts. 50% guaranteed (0%), 20% Sustainable Portfolio 25, 30% Portfolio 100 | Investment 90'000 in 3 stages (50k / 20k / 20k). Payouts 2031–2051, for example stage 1: 2'261.90 guaranteed + 3'889.30 unit-linked = 6'151.20/yr (medium scenario) |
| **Pax Risikoversicherung, Erwerbsunfähigkeit** | 3b | Disability income insurance (occupational group 3) | Pension up to 10'000/yr after 24 months. Premium 811.50 gross, **704.70** net of surplus |
| **Pax Risikoversicherung, Todesfall** | 3b | Term life (non-smoker) | Guaranteed death capital 10'000. Premium **111.20/yr** net of surplus |

How this maps to the gaps in section 3:
- **Death gap:** Todesfall (term life).
- **Disability gap from illness:** Erwerbsunfähigkeit.
- **Retirement gap or tax-efficient saving:** LifeStar or FondsStar (3a, choose by risk profile from section 4).
- **Turning capital into retirement income:** Auszahlungsplan.

The offers' full text (benefit tables, scenarios, costs, conditions) is in [`material/text/offerten/`](material/text/offerten/).

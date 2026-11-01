# Pax Clara: architecture

BaselHack 2026, Pax challenge "AI that makes life insurance simple". Team A4.
Diagrams of the flows and both views: [`DIAGRAMS.md`](DIAGRAMS.md).

## Product in one paragraph

A self-service pension advisor that first gets to know the person (family, work, plans, worries),
then builds their picture across all three pillars with real Swiss calculations (Logismata),
lets them simulate life scenarios, and only then recommends fitting Pax products with explicit
criteria and real Pax premiums (Quicksale). The flow runs end to end: advisory → recommendation →
mocked application and signature → policy in the customer's Vorsorge-Cockpit. Uploading existing
documents (pension certificate, policies, salary certificate) removes repetitive questions and
fills the cockpit. Every conversation is classified for Pax: topics, FAQ, pain points, funnel
stage, leads (new business, upsell, switch, service) and human handovers driven by
natural-language rules the company edits itself.

## Two user interfaces

| Customer (PWA, DE/FR/IT/EN) | Company (`/[locale]/firma`, password + advisor pick) |
|---|---|
| `/[locale]`: entry. "Beratung starten" or "Ich bin bereits Pax-Kunde" (demo picker) | `/firma`: KPIs, live count, funnel and drop-off, top topics, top FAQ, sentiment |
| `/[locale]/chat/[id]`: advisor chat with generative UI and the live Vorsorgebild | `/firma/live`: running conversations with stage updates (SSE) |
| `/[locale]/portal`: Vorsorge-Cockpit: all policies (Pax and external), documents, hints, conversations | `/firma/leads`: pipeline (table + kanban), filters by type, score, topic, simulated |
| | `/firma/gespraeche/[id]`: transcript, profile, analysis, calculations, recommendations, documents, audit trail, notes |
| | `/firma/uebergaben`: handover queue |
| | `/firma/regeln`: versioned natural-language rules and lead hints |
| | `/firma/simulation`: run N simulated customers against the real advisor |

## Conversation design

1. **Getting to know you.** The advisor asks about the person before any numbers or products.
2. **Numbers, with a shortcut.** Once it knows who it talks to, it offers document upload
   ("Vorsorgeausweis, Policen, Lohnausweis") so it does not have to ask for figures. Extracted
   values are shown in a confirmation card; nothing is used until the customer confirms.
3. **Analysis.** Logismata risk check (disability, death) and retirement check, shown as the
   square-unit Vorsorgebild and gap charts, plus 3a tax savings.
4. **Scenarios.** Child, home purchase with 3a/2nd-pillar withdrawal, early retirement, 3a amount.
5. **Recommendation.** Gap → product, with criteria, alternatives and a Quicksale premium.
   Unit-linked products require the suitability check (Angemessenheitsprüfung) first.
6. **Application.** Offer summary → consent → typed-name signature → policy in the cockpit.
7. **Handover** whenever an active company rule says so; **NPS** at the end.

Existing customers (seeded demo clients) start in `existing_customer` mode: the advisor knows
their policies and focuses on life changes and gaps.

## Data model (SQLite + Drizzle, `code/src/lib/db/schema.ts`)

| Table | Purpose |
|---|---|
| `customers` | `anonymous` → `prospect` → `client`; demo and simulated flags |
| `profiles` / `profile_events` | `LifeSituation` JSON + append-only provenance per field (chat, form, document, crm, advisor) |
| `policies` | Pax and external policies, any category; notice dates for the cockpit |
| `applications` | Offer snapshot, suitability result, signature; signing creates a policy |
| `conversations` / `messages` | AI SDK UI messages persisted as parts; funnel stage, mode, rule-set version |
| `calculations` | Every Logismata / Quicksale call with input, output, duration |
| `recommendations` | Product, gap, rationale, criteria, premium + source, alternatives |
| `analyses` | Classifier output per conversation (topics, life events, intent, sentiment, gaps, handover verdict) |
| `faq_questions` / `conversation_faqs` | Canonical questions for "top questions" |
| `leads` / `lead_activities` | Typed, scored leads with reason to call and talking points; pipeline history |
| `handovers` | Human review queue with triggering rule ids |
| `rule_sets` / `rules` | Versioned natural-language rules (`handover`, `flag`, `block_product`) + lead hints |
| `documents` / `extractions` | Encrypted uploads (AES-256-GCM) and field-level extractions with confidence and source quote |
| `hints` | Cockpit optimisation hints (cheaper equivalent, mismatch, double cover, 3a, buy-in, contract ending) |
| `feedback`, `simulation_runs`, `audit_log` | NPS, simulation bookkeeping, generic audit trail |

## Services

| Concern | Module | Notes |
|---|---|---|
| LLM | `lib/ai/models.ts` | `getModel(role)`, roles chat / analysis / extraction / simulation. Anthropic Claude Opus 5.5 in fast mode (Sonnet 5.5 when fast mode is busy), background analysis on Sonnet 5.5; `LLM_PROVIDER=openai-compatible` for self-hosted vLLM on Nebius |
| Calculations | `lib/logismata` | Logismata APICalc (risk, retirement, 3a, buy-in, tax location) |
| Pricing | `lib/pricing` | Pax Quicksale live tariff (server-side session, one change per request), fitted estimate fallback |
| Speech | `/api/transcribe` | Proxy to the Swiss-German Nemotron server (`STT_BASE_URL`, OpenAI-style `/v1/audio/transcriptions`) |
| Insights | `lib/insights` | Debounced background classification and lead scoring after each turn |
| Live updates | `lib/events/bus.ts` + `/api/events` | In-process event bus → SSE |

## Privacy and compliance

**Products only after the analysis.** The challenge's main no-go is product-first selling, so it
is enforced in code, not only in the prompt: `recommendProducts` returns `needs_analysis` until a
stored Logismata result backs each gap (risk check for death and disability, retirement check for
retirement and payout, 3a calculation for tax), and Clara then runs that analysis first. A customer
who asks to skip it still gets cover sized from their own figures. The gap amounts are still passed
in by the model from that result; reading them from the stored calculation is the next step.

**Every recommendation can be traced.** Each one is stored with its gap, criteria, alternatives,
premium and source, the model id and the rule-set version it ran under; every Logismata and
Quicksale call is in `calculations` with input and output. Company rules (`handover`, `flag`,
`block_product`) are versioned, so a later review sees which rules applied at the time.

**The customer controls their data.** "Meine Daten" in the portal lists what is stored, exports it
as JSON and erases it (`lib/privacy`). Signed Pax contracts are kept because an insurer must keep
them; everything the advisor collected or derived goes, and one pseudonymous audit entry records
the erasure. Documents are encrypted at rest (AES-256-GCM), deletable one by one, and extracted
values are only used after the customer confirms them.

**Where the data goes.** The full customer context goes to the model, because Clara needs names,
family and figures to advise; pseudonymising it would cost advice quality for little gain. That
makes the model's location the real decision, so Clara runs on our own model on a rented Nebius
GPU (`LLM_PROVIDER=openai-compatible`, see "Self-hosted mode" in the README) and customer data does
not go to an external AI provider. For the hackathon the GPU is in `us-central1` because of the
price; production rents it in an EU region. Logismata receives only the calculation inputs
(birth year, income, marital status, pension figures), Quicksale only the pricing inputs.

**Not production-ready, on purpose.** The company dashboard uses one shared password plus picking a
seeded advisor, so notes and status changes have an author; production would put Pax's SSO in
front of `lib/auth/advisor.ts` and keep the rest. Customers are recognised by a signed device
cookie, and the "Ich bin bereits Pax-Kunde" picker stands in for a real customer login.

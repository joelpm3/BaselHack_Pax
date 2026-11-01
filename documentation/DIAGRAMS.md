# Pax Clara: diagrams

Flow charts and sequence diagrams for the two sides of the app: the customer's view and the Pax
view. They complement [`ARCHITECTURE.md`](ARCHITECTURE.md), which has the tables, modules and
privacy rules. All diagrams are Mermaid and render on GitHub.

## Contents

1. [System overview](#1-system-overview)
2. [Customer view](#2-customer-view)
3. [Pax view](#3-pax-view)
4. [Conversation flow](#4-conversation-flow)
5. [Funnel stages](#5-funnel-stages)
6. [Sequence: one advisor turn](#6-sequence-one-advisor-turn)
7. [Sequence: document upload and confirmation](#7-sequence-document-upload-and-confirmation)
8. [Sequence: recommendation to signed policy](#8-sequence-recommendation-to-signed-policy)
9. [Sequence: background analysis, leads and handovers](#9-sequence-background-analysis-leads-and-handovers)
10. [Sequence: yearly check-in and Wiedervorlage](#10-sequence-yearly-check-in-and-wiedervorlage)

---

## 1. System overview

```mermaid
flowchart LR
    subgraph Customer["Customer (PWA, DE/FR/IT/EN)"]
        Home["/[locale]<br/>entry"]
        Chat["/chat/[id]<br/>Clara + Vorsorgebild"]
        Portal["/portal<br/>Vorsorge-Cockpit"]
    end

    subgraph Pax["Pax (/firma)"]
        Dash["Dashboard, live,<br/>leads, handovers"]
        Rules["Rules and knowledge"]
    end

    subgraph Server["Next.js server"]
        ChatAPI["/api/chat<br/>advisor engine"]
        DocAPI["/api/documents<br/>upload + extraction"]
        STT["/api/transcribe"]
        Insights["lib/insights<br/>background analysis"]
        FollowUps["lib/followups<br/>check-ins"]
        Bus["event bus → /api/events (SSE)"]
        DB[("SQLite<br/>Drizzle")]
    end

    subgraph External["Services"]
        LLM["LLM<br/>Claude or self-hosted on Nebius"]
        Logismata["Logismata APICalc<br/>risk, retirement, 3a, tax"]
        Quicksale["Pax Quicksale<br/>live premiums"]
        Whisper["Swiss-German STT<br/>(Nemotron)"]
    end

    Home --> Chat
    Chat <--> ChatAPI
    Chat --> DocAPI
    Chat --> STT --> Whisper
    Portal --> DocAPI
    ChatAPI <--> LLM
    ChatAPI --> Logismata
    ChatAPI --> Quicksale
    DocAPI --> LLM
    ChatAPI --> Insights --> LLM
    ChatAPI & DocAPI & Insights & FollowUps --> DB
    ChatAPI & Insights & FollowUps --> Bus --> Dash
    Rules --> DB
    DB --> Dash
    DB --> Portal
```

---

## 2. Customer view

What a customer sees and where each action leads.

```mermaid
flowchart LR
    subgraph Entry["/de: entry"]
        direction TB
        Start(["Customer opens /de"]) --> Choice{"Entry"}
        Choice -->|"Beratung starten"| NewConv["New conversation<br/>mode: new_business"]
        Choice -->|"Ich bin bereits Pax-Kunde"| Picker["/kunde<br/>demo customer picker"]
    end

    NewConv --> Chat
    Picker --> Portal

    subgraph Chat["/chat/[id]: conversation with Clara"]
        direction TB
        Input["Type, speak (Swiss German)<br/>or drop documents"]
        Widgets["Generative UI cards:<br/>profile, Vorsorgebild, risk analysis,<br/>scenarios, tax savings, savings plan"]
        Review["Document review card<br/>confirm or edit values"]
        Recs["Recommendation cards<br/>criteria, alternatives, premium"]
        Suit["Suitability check<br/>(unit-linked only)"]
        Offer["Offer card<br/>contact, consents, typed-name signature"]
        Handover["Handover card<br/>human advisor takes over"]
        NPS["Feedback / NPS"]
        Input --> Widgets
        Input --> Review --> Widgets
        Widgets --> Recs
        Recs --> Suit --> Offer
        Recs --> Offer
        Offer --> NPS
        Input -.-> Handover
    end

    subgraph Portal["/portal: Vorsorge-Cockpit"]
        direction TB
        Hints["Hints<br/>cheaper equivalent, double cover, 3a, buy-in"]
        Dates["Upcoming dates<br/>notice periods, contract end"]
        Policies["Policies<br/>Pax and external"]
        Docs["Documents<br/>encrypted, deletable"]
        Convs["Conversations"]
        Profile["Profile summary"]
        Checkin["Yearly check-in preferences"]
        MyData["Meine Daten<br/>export JSON, erase"]
        Hints ~~~ Dates ~~~ Policies ~~~ Docs ~~~ Convs ~~~ Profile ~~~ Checkin ~~~ MyData
    end

    Chat -->|"signed policy appears"| Portal
    Portal -->|"ask Clara about a hint,<br/>continue a conversation,<br/>upload a document"| Chat
```

---

## 3. Pax view

The company dashboard at `/firma` (shared password, then pick a seeded advisor). Each page and
what feeds it.

```mermaid
flowchart LR
    Login(["/firma/login<br/>password + advisor"]) --> Overview

    subgraph Nav["Pax dashboard"]
        direction TB
        Overview["Übersicht<br/>KPIs, funnel + drop-off,<br/>top topics, top FAQ, sentiment"]
        Live["Live<br/>running conversations (SSE)"]
        Gespraeche["Gespräche / [id]<br/>transcript, profile, analysis,<br/>calculations, recommendations,<br/>documents, audit trail, notes"]
        Kunden["Kunden / [id]<br/>history, documents,<br/>policies, emails"]
        Leads["Leads<br/>table + kanban, score, type"]
        Uebergaben["Übergaben<br/>handover queue,<br/>application approval"]
        Wiedervorlagen["Wiedervorlagen<br/>follow-ups, check-in emails"]
        Regeln["Regeln<br/>versioned natural-language rules,<br/>lead hints"]
        Simulation["Simulation<br/>N simulated customers"]
        Wissen["Wissen<br/>product knowledge files"]
        Verbesserungen["Verbesserungen<br/>improvement digest"]
    end

    Conversations[("conversations,<br/>messages")] --> Live & Gespraeche & Overview
    Analyses[("analyses, FAQ")] --> Overview & Gespraeche
    LeadsT[("leads,<br/>lead_activities")] --> Leads & Kunden
    HandoversT[("handovers")] --> Uebergaben
    Events[("future events,<br/>outbox emails")] --> Wiedervorlagen
    Audit[("calculations,<br/>recommendations,<br/>audit_log")] --> Gespraeche

    Regeln -->|"new rule-set version"| RuleSet[("rule_sets, rules")]
    RuleSet -->|"system prompt +<br/>block_product"| Clara["Clara (advisor)"]
    RuleSet -->|"handover / flag"| Classifier["Background classifier"]
    Wissen -->|"lookupProductInfo"| Clara
    Simulation -->|"runs real turns"| Clara
    Uebergaben -->|"approve"| Policy["Policy active,<br/>customer becomes client"]
```

---

## 4. Conversation flow

Clara's conversation design. The analysis gate before products is enforced in code
(`recommendProducts` returns `needs_analysis`), not only in the prompt.

```mermaid
flowchart TD
    A(["Greeting"]) --> B["1. Get to know the person<br/>family, work, plans, worries"]
    B -->|"updateProfile"| C{"Enough known<br/>for figures?"}
    C -->|"no"| B
    C -->|"yes"| D["2. Offer document upload<br/>suggestDocumentUpload"]
    D -->|"uploaded"| D2["Review card<br/>customer confirms values"]
    D -->|"no documents"| E
    D2 --> E["3. Analysis (Logismata)<br/>showPensionOverview, showRiskAnalysis,<br/>calculateTaxSavings"]
    E --> F["4. Scenarios<br/>simulateScenario, calculateSavingsPlan"]
    F --> G
    E --> G{"Customer wants<br/>a solution?"}
    G -->|"not yet"| F
    G -->|"yes"| H["5. recommendProducts"]
    H -->|"needs_analysis"| E
    H -->|"needs_info"| B
    H -->|"ok"| I{"Unit-linked?"}
    I -->|"yes"| J["startSuitabilityCheck"]
    J -->|"not suitable"| K["Explain, suggest alternative"] --> H
    J -->|"suitable"| L
    I -->|"no"| L["6. prepareOffer<br/>consent + typed-name signature"]
    L -->|"signed"| M["Policy in cockpit,<br/>review handover to Pax"]
    M --> N(["NPS"])

    B & E & H & L -.->|"rule or customer asks"| X["7. requestHandover<br/>human Pax advisor"]
```

---

## 5. Funnel stages

Stages only move forward (`advanceStage`). A turn reaches a stage through profile completeness or
the tools it completed (`lib/advisor/stage.ts`).

```mermaid
stateDiagram-v2
    direction LR
    [*] --> started
    started --> getting_to_know: first customer message
    getting_to_know --> situation_captured: profile ≥ 70 %
    situation_captured --> analysis_shown: pension overview, risk,<br/>tax or capital payout
    analysis_shown --> scenario_explored: scenario or savings plan
    analysis_shown --> recommendation_shown: recommendProducts
    scenario_explored --> recommendation_shown: recommendProducts /<br/>suitability check
    recommendation_shown --> offer_viewed: prepareOffer
    offer_viewed --> application_started: contact / consent
    application_started --> signed: signature
    signed --> [*]
```

---

## 6. Sequence: one advisor turn

`POST /api/chat` → `streamAdvisorTurn` (`lib/advisor/engine.ts`). The stream is teed so the turn
finishes and persists even when the browser leaves mid-answer.

```mermaid
sequenceDiagram
    autonumber
    actor C as Customer
    participant UI as Chat (browser)
    participant API as /api/chat
    participant E as Advisor engine
    participant DB as SQLite
    participant LLM as LLM (chat)
    participant T as Tools
    participant X as Logismata / Quicksale
    participant Bus as Event bus
    participant I as Insights

    C->>UI: Types or speaks a message
    opt Voice
        UI->>API: /api/transcribe (audio)
        API-->>UI: Swiss-German transcript
    end
    UI->>API: POST message (id, inputMode)
    API->>API: Check customer owns conversation
    API->>E: streamAdvisorTurn
    E->>DB: Save user message
    E->>Bus: conversation.message (user)
    E->>DB: Load history, profile, policies,<br/>active rule set, hints, applications
    E->>LLM: streamText(instructions, history, tools)
    loop Up to 8 steps, until Clara waits for the customer
        LLM->>T: Tool call (e.g. showRiskAnalysis)
        T->>X: Calculation / premium
        X-->>T: Result
        T->>DB: Store calculation / recommendation
        T-->>LLM: Tool result
        LLM-->>UI: Text + widget parts (streamed)
    end
    API-->>UI: data-mood (Clara's face)
    E->>DB: Save assistant message, stage,<br/>message count, rule-set id
    E->>Bus: conversation.message + conversation.updated
    E->>I: scheduleAnalysis (debounced)
    opt First exchange
        E->>LLM: generateTitle
    end
```

---

## 7. Sequence: document upload and confirmation

Nothing extracted is used until the customer confirms it in the review card.

```mermaid
sequenceDiagram
    autonumber
    actor C as Customer
    participant UI as Chat / Cockpit
    participant D as /api/documents
    participant S as Document service
    participant FS as Encrypted storage
    participant LLM as LLM (extraction)
    participant DB as SQLite
    participant Clara as Advisor engine

    C->>UI: Drops Vorsorgeausweis.pdf
    UI->>D: POST multipart (files, conversationId)
    D->>S: storeUploads
    S->>S: Validate type, size, page count
    S->>FS: Write AES-256-GCM encrypted file
    S->>DB: documents (status: uploaded)
    D-->>UI: 201 document ids
    D->>S: after(): extractDocument
    S->>LLM: Extract fields with confidence + source quote
    LLM-->>S: Fields
    S->>DB: extractions
    UI->>Clara: Message with documentIds (inputMode: upload)
    Clara-->>UI: reviewDocuments → review card
    C->>UI: Checks values, picks the person (e.g. May), confirms
    UI->>S: confirmExtractionAction(edits, subject)
    S->>DB: Profile changes (source: document)
    S->>DB: Create or update policy (if a policy)
    S->>DB: Extraction confirmedAt, audit document.confirmed
    Note over Clara: Next turn gets a note of what was<br/>applied or discarded per document
    Clara-->>UI: Continues with the analysis
```

---

## 8. Sequence: recommendation to signed policy

```mermaid
sequenceDiagram
    autonumber
    actor C as Customer
    participant LLM as Clara (LLM)
    participant R as recommendProducts
    participant DB as SQLite
    participant Q as Quicksale
    participant A as Application service
    actor P as Pax advisor

    LLM->>R: gaps (CHF / year, person)
    R->>DB: Stored Logismata result for each gap?
    alt Analysis missing
        R-->>LLM: needs_analysis (tools to run first)
    else Profile fields missing
        R-->>LLM: needs_info (missing fields)
    else Ready
        R->>R: Size cover, check entry age,<br/>apply block_product rules
        R->>Q: Price each product
        Q-->>R: Premium (or labelled estimate)
        R->>DB: recommendations (criteria, alternatives,<br/>premium source, rule-set version)
        R-->>LLM: Recommendation cards (+ excluded)
    end
    LLM-->>C: Gap, why this product, one alternative

    C->>LLM: "Offerte ansehen"
    opt Unit-linked product
        LLM->>A: startSuitabilityCheck
        A-->>C: Suitability form (A1–D)
        C->>A: submitSuitabilityAction
        A->>DB: Score → investment profile
    end
    LLM->>A: prepareOffer
    A->>DB: applications (draft, offer snapshot)
    A-->>C: Offer card
    C->>A: Contact details, consents, typed name
    A->>A: Name matches? Suitable? Offer still current?
    A->>DB: Policy (status: offer), application signed
    A->>DB: Review handover
    A-->>C: Policy appears in the cockpit
    P->>A: Approve in Übergaben
    A->>DB: Policy active, customer → client, handover done
```

---

## 9. Sequence: background analysis, leads and handovers

After every turn the conversation is classified in the background (`lib/insights`). The rules
the company writes in `/firma/regeln` decide handovers.

```mermaid
sequenceDiagram
    autonumber
    participant E as Advisor engine
    participant I as Insights (debounced)
    participant LLM as LLM (analysis)
    participant DB as SQLite
    participant Bus as Event bus
    participant SSE as /api/events
    actor P as Pax dashboard

    E->>I: scheduleAnalysis(conversationId)
    I->>I: Wait for quiet, one run per conversation
    I->>DB: Load transcript, profile, active rules, lead hints
    par
        I->>LLM: Classify: topics, life events, intent,<br/>sentiment, gaps, triggered rules, lead
    and
        I->>LLM: Extract FAQ from new customer messages
    and
        I->>LLM: Update future events (child, wedding, retirement…)
    end
    I->>DB: analyses (upsert), FAQ links
    opt Handover rule triggered
        I->>DB: handovers (open, rule ids)
    end
    I->>DB: Upsert lead (type, score, reason to call, talking points)
    I->>Bus: analysis.updated, lead.upserted
    Bus->>SSE: Push event
    SSE-->>P: Live, leads, handover queue refresh
```

---

## 10. Sequence: yearly check-in and Wiedervorlage

`runFollowUps` (`lib/followups/engine.ts`) is idempotent for a given day, so the dashboard can run
it on demand, also with a simulated date for the demo.

```mermaid
sequenceDiagram
    autonumber
    actor P as Pax advisor
    participant W as /firma/wiedervorlagen
    participant F as Follow-up engine
    participant DB as SQLite
    participant LLM as LLM
    participant O as Outbox (email)
    actor C as Customer

    P->>W: Pick date, "Wiedervorlagen jetzt prüfen"
    W->>F: runFollowUps(today)
    F->>DB: Due future events, check-ins due
    loop Each due event
        F->>LLM: Write personalised email<br/>(last conversation summary, event)
        F->>DB: Lead (Wiedervorlage) + activity
        F->>O: Store email
    end
    opt No answer after reminder days
        F->>LLM: Write reminder
        F->>O: Store reminder
        Note over F: After the last email: lead lost
    end
    O-->>C: "Hat sich bei Ihnen etwas verändert?"
    C->>C: Opens chat, tells Clara what changed
    Note over F,DB: Customer writes again → next run reopens the lead
```

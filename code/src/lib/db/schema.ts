import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import {
  CONVERSATION_FLAG_STATUSES,
  IMPROVEMENT_CATEGORIES,
  IMPROVEMENT_KINDS,
  IMPROVEMENT_WINDOWS,
  KNOWLEDGE_KINDS,
  KNOWLEDGE_STATUSES,
  type KnowledgeSection,
  PROPOSAL_STATUSES,
} from "@/lib/domain/learning";
import { PRODUCT_CODES } from "@/lib/domain/products";
import type { LifeSituation } from "@/lib/domain/profile";
import {
  ACTOR_TYPES,
  CONTACT_CHANNELS,
  CONVERSATION_MODES,
  CONVERSATION_STATUSES,
  CUSTOMER_LIFECYCLES,
  DATA_SOURCES,
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  FUNNEL_STAGES,
  GAP_TYPES,
  HANDOVER_STATUSES,
  HINT_SEVERITIES,
  HINT_STATUSES,
  HINT_TYPES,
  INTENT_STAGES,
  LEAD_STATUSES,
  LEAD_TYPES,
  type LifeEvent,
  LOCALES,
  POLICY_CATEGORIES,
  POLICY_STATUSES,
  PRIORITIES,
  RULE_ACTIONS,
  SENTIMENTS,
  type Topic,
} from "@/lib/domain/taxonomy";
import {
  DATE_PRECISIONS,
  FUTURE_EVENT_KINDS,
  FUTURE_EVENT_STATUSES,
  OUTBOX_KINDS,
} from "@/lib/followups/taxonomy";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());
const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date());
const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });
const json = <T>(name: string) => text(name, { mode: "json" }).$type<T>();
const bool = (name: string) => integer(name, { mode: "boolean" });

// ─── People ─────────────────────────────────────────────────────────────────

export const advisors = sqliteTable("advisors", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  team: text("team").notNull(),
  createdAt: createdAt(),
});

/**
 * One row per person talking to the advisor. A new visitor is an `anonymous` customer
 * identified by a signed device cookie; giving contact details makes them a `prospect`,
 * holding a policy makes them a `client`.
 */
export const customers = sqliteTable(
  "customers",
  {
    id: id(),
    lifecycle: text("lifecycle", { enum: CUSTOMER_LIFECYCLES }).notNull().default("anonymous"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    email: text("email"),
    phone: text("phone"),
    birthDate: text("birth_date"),
    locale: text("locale", { enum: LOCALES }).notNull().default("de"),
    isSimulated: bool("is_simulated").notNull().default(false),
    /** Seeded demo customers selectable in the "Ich bin bereits Pax-Kunde" picker. */
    isDemo: bool("is_demo").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    lastSeenAt: timestamp("last_seen_at"),
  },
  (t) => [index("customers_lifecycle_idx").on(t.lifecycle)],
);

export const profiles = sqliteTable("profiles", {
  customerId: text("customer_id")
    .primaryKey()
    .references(() => customers.id, { onDelete: "cascade" }),
  data: json<LifeSituation>("data").notNull(),
  completeness: integer("completeness").notNull().default(0),
  updatedAt: updatedAt(),
});

/** Append-only provenance for every profile change ("where did this number come from?"). */
export const profileEvents = sqliteTable(
  "profile_events",
  {
    id: id(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    messageId: text("message_id"),
    documentId: text("document_id").references(() => documents.id, { onDelete: "set null" }),
    path: text("path").notNull(),
    oldValue: json<unknown>("old_value"),
    newValue: json<unknown>("new_value"),
    source: text("source", { enum: DATA_SOURCES }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("profile_events_customer_idx").on(t.customerId, t.createdAt)],
);

// ─── Contracts ──────────────────────────────────────────────────────────────

export const policies = sqliteTable(
  "policies",
  {
    id: id(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    policyNumber: text("policy_number"),
    insurer: text("insurer").notNull().default("Pax"),
    isExternal: bool("is_external").notNull().default(false),
    category: text("category", { enum: POLICY_CATEGORIES }).notNull(),
    productCode: text("product_code", { enum: PRODUCT_CODES }),
    productName: text("product_name").notNull(),
    /** Pillar 3a vs 3b where applicable. */
    pillar: text("pillar", { enum: ["3a", "3b"] }),
    status: text("status", { enum: POLICY_STATUSES }).notNull().default("active"),
    startDate: text("start_date"),
    endDate: text("end_date"),
    /** Last day to give notice (cockpit reminder). */
    noticeDate: text("notice_date"),
    premiumAnnual: real("premium_annual"),
    sumInsured: real("sum_insured"),
    annuityAnnual: real("annuity_annual"),
    insuredPerson: text("insured_person"),
    details: json<Record<string, unknown>>("details"),
    source: text("source", { enum: ["seed", "chat", "document", "advisor"] }).notNull(),
    documentId: text("document_id").references(() => documents.id, { onDelete: "set null" }),
    applicationId: text("application_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("policies_customer_idx").on(t.customerId)],
);

export const applications = sqliteTable("applications", {
  id: id(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  conversationId: text("conversation_id").references(() => conversations.id, {
    onDelete: "set null",
  }),
  recommendationId: text("recommendation_id").references(() => recommendations.id, {
    onDelete: "set null",
  }),
  productCode: text("product_code", { enum: PRODUCT_CODES }).notNull(),
  /** Snapshot of the offer as shown (premium, sums, riders, price source). */
  offer: json<Record<string, unknown>>("offer").notNull(),
  /** Angemessenheitsprüfung answers, points and resulting investment profile. */
  suitability: json<Record<string, unknown>>("suitability"),
  premiumAnnual: real("premium_annual"),
  status: text("status", { enum: ["draft", "signed", "cancelled"] })
    .notNull()
    .default("draft"),
  signatureName: text("signature_name"),
  signedAt: timestamp("signed_at"),
  policyId: text("policy_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ─── Conversations ──────────────────────────────────────────────────────────

export const conversations = sqliteTable(
  "conversations",
  {
    id: id(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    locale: text("locale", { enum: LOCALES }).notNull().default("de"),
    mode: text("mode", { enum: CONVERSATION_MODES }).notNull(),
    status: text("status", { enum: CONVERSATION_STATUSES }).notNull().default("active"),
    stage: text("stage", { enum: FUNNEL_STAGES }).notNull().default("started"),
    title: text("title"),
    isSimulated: bool("is_simulated").notNull().default(false),
    simulationRunId: text("simulation_run_id").references(() => simulationRuns.id, {
      onDelete: "set null",
    }),
    ruleSetId: text("rule_set_id").references(() => ruleSets.id),
    messageCount: integer("message_count").notNull().default(0),
    createdAt: createdAt(),
    lastMessageAt: timestamp("last_message_at"),
  },
  (t) => [
    index("conversations_customer_idx").on(t.customerId),
    index("conversations_last_message_idx").on(t.lastMessageAt),
  ],
);

/** AI SDK UIMessages, persisted as-is (parts JSON) so a chat can be resumed and audited. */
export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["system", "user", "assistant"] }).notNull(),
    parts: json<unknown[]>("parts").notNull(),
    metadata: json<Record<string, unknown>>("metadata"),
    inputMode: text("input_mode", { enum: ["text", "voice", "upload", "widget"] }),
    model: text("model"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    createdAt: createdAt(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.createdAt)],
);

/** Every external calculation (Logismata, Quicksale) for traceability. */
export const calculations = sqliteTable(
  "calculations",
  {
    id: id(),
    customerId: text("customer_id").references(() => customers.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").references(() => conversations.id, {
      onDelete: "cascade",
    }),
    toolCallId: text("tool_call_id"),
    provider: text("provider", { enum: ["logismata", "quicksale", "estimate"] }).notNull(),
    operation: text("operation").notNull(),
    input: json<unknown>("input").notNull(),
    output: json<unknown>("output"),
    status: text("status", { enum: ["ok", "error"] }).notNull(),
    error: text("error"),
    durationMs: integer("duration_ms"),
    createdAt: createdAt(),
  },
  (t) => [index("calculations_conversation_idx").on(t.conversationId)],
);

export interface RecommendationCriterion {
  criterion: string;
  value: string;
  met: boolean;
}

export const recommendations = sqliteTable("recommendations", {
  id: id(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  productCode: text("product_code", { enum: PRODUCT_CODES }).notNull(),
  pillar: text("pillar", { enum: ["3a", "3b"] }),
  gap: text("gap", { enum: GAP_TYPES }).notNull(),
  headline: text("headline").notNull(),
  rationale: text("rationale").notNull(),
  criteria: json<RecommendationCriterion[]>("criteria").notNull(),
  /** Offer parameters used for the price (sum insured, pension, premium, duration...). */
  parameters: json<Record<string, unknown>>("parameters"),
  premiumAnnual: real("premium_annual"),
  premiumSource: text("premium_source", { enum: ["quicksale", "estimate"] }),
  alternatives: json<Array<{ productCode: string; reason: string }>>("alternatives"),
  status: text("status", { enum: ["shown", "accepted", "declined"] })
    .notNull()
    .default("shown"),
  ruleSetId: text("rule_set_id").references(() => ruleSets.id),
  model: text("model"),
  createdAt: createdAt(),
});

// ─── Insights (written by the classifier) ───────────────────────────────────

export interface ProductInterest {
  productCode: string;
  strength: "low" | "medium" | "high";
}
export interface HandoverVerdict {
  required: boolean;
  ruleIds: string[];
  reason: string | null;
}
export interface IdentifiedGap {
  gap: string;
  amountAnnual: number | null;
  note: string;
}

export const analyses = sqliteTable("analyses", {
  conversationId: text("conversation_id")
    .primaryKey()
    .references(() => conversations.id, { onDelete: "cascade" }),
  topics: json<Topic[]>("topics").notNull(),
  lifeEvents: json<LifeEvent[]>("life_events").notNull(),
  productInterest: json<ProductInterest[]>("product_interest").notNull(),
  intentStage: text("intent_stage", { enum: INTENT_STAGES }).notNull(),
  sentiment: text("sentiment", { enum: SENTIMENTS }).notNull(),
  painPoints: json<string[]>("pain_points").notNull(),
  gaps: json<IdentifiedGap[]>("gaps").notNull(),
  handover: json<HandoverVerdict>("handover").notNull(),
  summary: text("summary").notNull(),
  nextBestAction: text("next_best_action"),
  model: text("model"),
  ruleSetId: text("rule_set_id").references(() => ruleSets.id),
  messageCountAnalyzed: integer("message_count_analyzed").notNull(),
  updatedAt: updatedAt(),
});

/** Canonical customer questions (English canonical text, translated for display). */
export const faqQuestions = sqliteTable(
  "faq_questions",
  {
    id: id(),
    key: text("key").notNull(),
    canonicalText: text("canonical_text").notNull(),
    translations: json<Partial<Record<(typeof LOCALES)[number], string>>>("translations"),
    topic: text("topic").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("faq_questions_key_idx").on(t.key)],
);

export const conversationFaqs = sqliteTable(
  "conversation_faqs",
  {
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    faqId: text("faq_id")
      .notNull()
      .references(() => faqQuestions.id, { onDelete: "cascade" }),
    askedText: text("asked_text").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.faqId] })],
);

export interface ScoreBreakdown {
  factor: string;
  points: number;
  note: string;
}

export const leads = sqliteTable(
  "leads",
  {
    id: id(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    type: text("type", { enum: LEAD_TYPES }).notNull(),
    status: text("status", { enum: LEAD_STATUSES }).notNull().default("new"),
    score: integer("score").notNull(),
    scoreBreakdown: json<ScoreBreakdown[]>("score_breakdown").notNull(),
    priority: text("priority", { enum: PRIORITIES }).notNull(),
    reasonToCall: text("reason_to_call").notNull(),
    talkingPoints: json<string[]>("talking_points").notNull(),
    productInterest: json<ProductInterest[]>("product_interest").notNull(),
    estimatedAnnualPremium: real("estimated_annual_premium"),
    assignedAdvisorId: text("assigned_advisor_id").references(() => advisors.id),
    nextActionAt: timestamp("next_action_at"),
    isSimulated: bool("is_simulated").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("leads_status_idx").on(t.status),
    uniqueIndex("leads_conversation_type_idx").on(t.conversationId, t.type),
  ],
);

export const leadActivities = sqliteTable(
  "lead_activities",
  {
    id: id(),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    advisorId: text("advisor_id").references(() => advisors.id),
    type: text("type", { enum: ["status_change", "note", "call", "email", "system"] }).notNull(),
    body: text("body"),
    data: json<Record<string, unknown>>("data"),
    createdAt: createdAt(),
  },
  (t) => [index("lead_activities_lead_idx").on(t.leadId)],
);

export const handovers = sqliteTable("handovers", {
  id: id(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  ruleIds: json<string[]>("rule_ids").notNull(),
  urgency: text("urgency", { enum: ["normal", "high"] })
    .notNull()
    .default("normal"),
  preferredChannel: text("preferred_channel", { enum: CONTACT_CHANNELS }),
  preferredTime: text("preferred_time"),
  status: text("status", { enum: HANDOVER_STATUSES }).notNull().default("open"),
  assignedAdvisorId: text("assigned_advisor_id").references(() => advisors.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ─── Company rules (versioned, natural language) ────────────────────────────

export const ruleSets = sqliteTable("rule_sets", {
  id: id(),
  version: integer("version").notNull().unique(),
  /** Free text: what makes a good lead for us. Fed into lead scoring. */
  leadHints: text("lead_hints").notNull().default(""),
  isActive: bool("is_active").notNull().default(false),
  createdByAdvisorId: text("created_by_advisor_id").references(() => advisors.id),
  createdAt: createdAt(),
});

export const rules = sqliteTable("rules", {
  id: id(),
  ruleSetId: text("rule_set_id")
    .notNull()
    .references(() => ruleSets.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  action: text("action", { enum: RULE_ACTIONS }).notNull(),
  /** Only for `block_product`. */
  productCode: text("product_code", { enum: PRODUCT_CODES }),
  active: bool("active").notNull().default(true),
  position: integer("position").notNull(),
});

// ─── Documents ──────────────────────────────────────────────────────────────

export const documents = sqliteTable(
  "documents",
  {
    id: id(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    /** Path of the AES-256-GCM encrypted file, relative to DATA_DIR. */
    storagePath: text("storage_path").notNull(),
    docType: text("doc_type", { enum: DOCUMENT_TYPES }),
    status: text("status", { enum: DOCUMENT_STATUSES }).notNull().default("uploaded"),
    error: text("error"),
    pageCount: integer("page_count"),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => [index("documents_customer_idx").on(t.customerId)],
);

export interface ExtractedField {
  /** Dot path into the extraction schema, e.g. `pillar2.insuredSalary`. */
  path: string;
  value: unknown;
  confidence: number;
  page: number | null;
  quote: string | null;
}

export const extractions = sqliteTable("extractions", {
  id: id(),
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  docType: text("doc_type", { enum: DOCUMENT_TYPES }).notNull(),
  schemaVersion: integer("schema_version").notNull(),
  fields: json<ExtractedField[]>("fields").notNull(),
  /** Customer corrections in the "Das habe ich gelesen" card: path → value. */
  edits: json<Record<string, unknown>>("edits"),
  model: text("model"),
  confirmedAt: timestamp("confirmed_at"),
  createdAt: createdAt(),
});

export const hints = sqliteTable(
  "hints",
  {
    id: id(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    type: text("type", { enum: HINT_TYPES }).notNull(),
    severity: text("severity", { enum: HINT_SEVERITIES }).notNull(),
    policyId: text("policy_id").references(() => policies.id, { onDelete: "cascade" }),
    locale: text("locale", { enum: LOCALES }).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    data: json<Record<string, unknown>>("data"),
    status: text("status", { enum: HINT_STATUSES }).notNull().default("new"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("hints_customer_type_policy_idx").on(t.customerId, t.type, t.policyId)],
);

// ─── Feedback, simulation, audit ────────────────────────────────────────────

export const feedback = sqliteTable("feedback", {
  id: id(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  nps: integer("nps").notNull(),
  comment: text("comment"),
  createdAt: createdAt(),
});

export const simulationRuns = sqliteTable("simulation_runs", {
  id: id(),
  size: integer("size").notNull(),
  concurrency: integer("concurrency").notNull(),
  status: text("status", { enum: ["running", "completed", "failed", "cancelled"] })
    .notNull()
    .default("running"),
  personaMix: json<Record<string, unknown>>("persona_mix"),
  stats: json<Record<string, unknown>>("stats"),
  startedByAdvisorId: text("started_by_advisor_id").references(() => advisors.id),
  startedAt: createdAt(),
  finishedAt: timestamp("finished_at"),
});

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: id(),
    actorType: text("actor_type", { enum: ACTOR_TYPES }).notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    data: json<Record<string, unknown>>("data"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_log_entity_idx").on(t.entityType, t.entityId)],
);

// ─── Follow-ups (future life events, outbox, yearly check-in) ───────────────

/**
 * Dated future life events the classifier extracted from a conversation ("in zwei Jahren bin
 * ich fertig"). About a week before `expectedDate` the follow-up engine turns one into a
 * Wiedervorlage lead and a personalised (mocked) email.
 */
export const futureEvents = sqliteTable(
  "future_events",
  {
    id: id(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    kind: text("kind", { enum: FUTURE_EVENT_KINDS }).notNull(),
    /** Who it concerns when not the customer, e.g. "Tochter Lena". */
    subject: text("subject"),
    /** First day of the expected month (or the exact day), ISO yyyy-mm-dd. */
    expectedDate: text("expected_date").notNull(),
    precision: text("precision", { enum: DATE_PRECISIONS }).notNull(),
    confidence: real("confidence").notNull(),
    /** The customer's own words, e.g. "in zwei Jahren bin ich fertig". */
    sourceQuote: text("source_quote").notNull(),
    /** Short German note on what the customer plans. */
    note: text("note"),
    status: text("status", { enum: FUTURE_EVENT_STATUSES }).notNull().default("upcoming"),
    leadId: text("lead_id").references(() => leads.id, { onDelete: "set null" }),
    isSimulated: bool("is_simulated").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("future_events_customer_idx").on(t.customerId),
    index("future_events_status_date_idx").on(t.status, t.expectedDate),
  ],
);

/** Mocked outbox: generated emails are stored and shown, never sent. */
export const outboxEmails = sqliteTable(
  "outbox_emails",
  {
    id: id(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: OUTBOX_KINDS }).notNull(),
    futureEventId: text("future_event_id").references(() => futureEvents.id, {
      onDelete: "cascade",
    }),
    leadId: text("lead_id").references(() => leads.id, { onDelete: "set null" }),
    /** 1 = first email, 2 = reminder. */
    sequence: integer("sequence").notNull().default(1),
    toAddress: text("to_address").notNull(),
    locale: text("locale", { enum: LOCALES }).notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    /** Business date the email went out (may be a simulated "today"), ISO yyyy-mm-dd. */
    sentOn: text("sent_on").notNull(),
    repliedAt: timestamp("replied_at"),
    model: text("model"),
    createdAt: createdAt(),
  },
  (t) => [
    index("outbox_emails_customer_idx").on(t.customerId),
    index("outbox_emails_event_idx").on(t.futureEventId),
  ],
);

/** Contact preferences the customer controls in the cockpit (the company can see and change them). */
export const contactPreferences = sqliteTable("contact_preferences", {
  customerId: text("customer_id")
    .primaryKey()
    .references(() => customers.id, { onDelete: "cascade" }),
  yearlyCheckin: bool("yearly_checkin").notNull().default(true),
  updatedBy: text("updated_by", { enum: ACTOR_TYPES }).notNull(),
  updatedAt: updatedAt(),
});
// ─── Company product knowledge (uploaded product sheets, terms, tariff info) ─

/**
 * One row per uploaded version. Versions of the same document share `entryId` (the first
 * version's id); at most one version per entry is `active`, and only active versions reach the
 * advisor. The original PDF is stored encrypted like customer documents.
 */
export const knowledgeDocuments = sqliteTable(
  "knowledge_documents",
  {
    id: id(),
    entryId: text("entry_id").notNull(),
    version: integer("version").notNull(),
    productCode: text("product_code", { enum: PRODUCT_CODES }).notNull(),
    kind: text("kind", { enum: KNOWLEDGE_KINDS }).notNull(),
    title: text("title").notNull(),
    filename: text("filename").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    /** Path of the AES-256-GCM encrypted file, relative to DATA_DIR. */
    storagePath: text("storage_path").notNull(),
    pageCount: integer("page_count"),
    status: text("status", { enum: KNOWLEDGE_STATUSES }).notNull().default("processing"),
    sections: json<KnowledgeSection[]>("sections"),
    error: text("error"),
    model: text("model"),
    uploadedByAdvisorId: text("uploaded_by_advisor_id").references(() => advisors.id),
    createdAt: createdAt(),
    activatedAt: timestamp("activated_at"),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => [
    index("knowledge_documents_product_idx").on(t.productCode, t.status),
    uniqueIndex("knowledge_documents_entry_version_idx").on(t.entryId, t.version),
  ],
);

// ─── Learning loop: advisor flags and human-approved improvement proposals ───

/** An advisor marks a conversation as "not good"; open flags feed the improvement analysis. */
export const conversationFlags = sqliteTable(
  "conversation_flags",
  {
    id: id(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    advisorId: text("advisor_id").references(() => advisors.id),
    note: text("note").notNull(),
    status: text("status", { enum: CONVERSATION_FLAG_STATUSES }).notNull().default("open"),
    createdAt: createdAt(),
    resolvedAt: timestamp("resolved_at"),
  },
  (t) => [index("conversation_flags_conversation_idx").on(t.conversationId)],
);

export const improvementRuns = sqliteTable("improvement_runs", {
  id: id(),
  window: text("window", { enum: IMPROVEMENT_WINDOWS }).notNull(),
  status: text("status", { enum: ["running", "completed", "failed"] })
    .notNull()
    .default("running"),
  conversationCount: integer("conversation_count").notNull().default(0),
  /** Facts computed without the model (drop-off by stage, NPS, flags). */
  stats: json<Record<string, unknown>>("stats"),
  summary: text("summary"),
  model: text("model"),
  error: text("error"),
  startedByAdvisorId: text("started_by_advisor_id").references(() => advisors.id),
  startedAt: createdAt(),
  finishedAt: timestamp("finished_at"),
});

export interface ProposalEvidence {
  conversationId: string;
  note: string;
}

export interface ProposedRule {
  text: string;
  action: (typeof RULE_ACTIONS)[number];
  productCode: (typeof PRODUCT_CODES)[number] | null;
}

export const improvementProposals = sqliteTable(
  "improvement_proposals",
  {
    id: id(),
    runId: text("run_id")
      .notNull()
      .references(() => improvementRuns.id, { onDelete: "cascade" }),
    category: text("category", { enum: IMPROVEMENT_CATEGORIES }).notNull(),
    kind: text("kind", { enum: IMPROVEMENT_KINDS }).notNull(),
    title: text("title").notNull(),
    problem: text("problem").notNull(),
    proposal: text("proposal").notNull(),
    /** For `rule` proposals: the rule as it would be added in the rule editor. */
    rule: json<ProposedRule>("rule"),
    evidence: json<ProposalEvidence[]>("evidence").notNull(),
    occurrences: integer("occurrences").notNull(),
    status: text("status", { enum: PROPOSAL_STATUSES }).notNull().default("open"),
    decidedByAdvisorId: text("decided_by_advisor_id").references(() => advisors.id),
    decidedAt: timestamp("decided_at"),
    /** Rule-set version that first contained the accepted rule. */
    appliedRuleSetVersion: integer("applied_rule_set_version"),
    createdAt: createdAt(),
  },
  (t) => [index("improvement_proposals_run_idx").on(t.runId)],
);

/**
 * Pure helpers for the customer view: one chronological story across all conversations, and
 * the contact log (emails and calls). Kept free of DB access so it can be unit-tested.
 *
 * Email convention for other features (e.g. automated follow-up emails): store an email either as
 * a lead activity with `type: "email"` or as an audit entry whose `action` is `email` or starts
 * with `email.` (e.g. `email.sent`) or whose `data.type` is `"email"`, on an entity of the
 * customer (customer, conversation, lead or handover id). Optional `data` fields that are shown:
 * `subject`, `body`, `to`, `direction` (`"outbound"` | `"inbound"`).
 */

export const TIMELINE_KINDS = [
  "conversation",
  "handover",
  "lead",
  "communication",
  "offer",
  "document",
  "feedback",
  "other",
] as const;
export type TimelineKind = (typeof TIMELINE_KINDS)[number];

/** The `event` is a message key under `firmaCustomers.timeline.event`. */
export const TIMELINE_EVENTS = [
  "conversationStarted",
  "handoverCreated",
  "handoverStatus",
  "handoverAssigned",
  "leadCreated",
  "leadStatus",
  "leadAssigned",
  "leadNote",
  "call",
  "email",
  "recommendation",
  "recommendationDeclined",
  "suitabilityCompleted",
  "offerPrepared",
  "applicationSigned",
  "policyCreated",
  "documentUploaded",
  "documentConfirmed",
  "documentDeleted",
  "contactSaved",
  "feedback",
  "other",
] as const;
export type TimelineEvent = (typeof TIMELINE_EVENTS)[number];

export interface TimelineEntry {
  id: string;
  at: Date;
  kind: TimelineKind;
  event: TimelineEvent;
  /** Values for the event message (already language-neutral). */
  params: Record<string, string | number>;
  /** Free text shown below the event line (reason, note body, summary). */
  text: string | null;
  actor: string | null;
  conversationId: string | null;
}

export type Channel = "email" | "call";

export interface Communication {
  id: string;
  at: Date;
  channel: Channel;
  direction: "outbound" | "inbound" | null;
  subject: string | null;
  body: string | null;
  to: string | null;
  actor: string | null;
  leadId: string | null;
}

export interface TimelineInput {
  conversations: Array<{ id: string; title: string | null; createdAt: Date }>;
  handovers: Array<{ id: string; conversationId: string; reason: string; createdAt: Date }>;
  leads: Array<{
    id: string;
    conversationId: string | null;
    type: string;
    score: number;
    createdAt: Date;
  }>;
  activities: Array<{
    id: string;
    leadId: string;
    type: "status_change" | "note" | "call" | "email" | "system";
    body: string | null;
    data: Record<string, unknown> | null;
    createdAt: Date;
    advisorName: string | null;
  }>;
  recommendations: Array<{
    id: string;
    conversationId: string;
    productCode: string;
    headline: string;
    createdAt: Date;
  }>;
  applications: Array<{
    id: string;
    conversationId: string | null;
    productCode: string;
    status: string;
    signedAt: Date | null;
  }>;
  policies: Array<{
    id: string;
    productName: string;
    source: string;
    createdAt: Date;
  }>;
  documents: Array<{
    id: string;
    filename: string;
    conversationId: string | null;
    createdAt: Date;
  }>;
  feedback: Array<{
    id: string;
    conversationId: string;
    nps: number;
    comment: string | null;
    createdAt: Date;
  }>;
  audit: Array<{
    id: string;
    action: string;
    actorName: string | null;
    entityId: string;
    data: Record<string, unknown> | null;
    createdAt: Date;
  }>;
}

const str = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;

export function isEmailAudit(entry: { action: string; data: Record<string, unknown> | null }) {
  return (
    entry.action === "email" || entry.action.startsWith("email.") || entry.data?.type === "email"
  );
}

function direction(data: Record<string, unknown> | null): Communication["direction"] {
  const d = data?.direction;
  return d === "outbound" || d === "inbound" ? d : null;
}

/** Emails and calls from lead activities and email audit entries, newest first. */
export function buildCommunications(
  input: Pick<TimelineInput, "activities" | "audit">,
): Communication[] {
  const fromActivities = input.activities.flatMap((a): Communication[] =>
    a.type === "email" || a.type === "call"
      ? [
          {
            id: a.id,
            at: a.createdAt,
            channel: a.type,
            direction: direction(a.data),
            subject: str(a.data?.subject),
            body: a.body ?? str(a.data?.body),
            to: str(a.data?.to),
            actor: a.advisorName,
            leadId: a.leadId,
          },
        ]
      : [],
  );
  const fromAudit = input.audit.filter(isEmailAudit).map(
    (e): Communication => ({
      id: e.id,
      at: e.createdAt,
      channel: "email",
      direction: direction(e.data),
      subject: str(e.data?.subject),
      body: str(e.data?.body),
      to: str(e.data?.to),
      actor: e.actorName,
      leadId: null,
    }),
  );
  return [...fromActivities, ...fromAudit].sort((a, b) => b.at.getTime() - a.at.getTime());
}

/**
 * Audit actions already told by a primary table or a lead activity; skipping them keeps every
 * step in the timeline exactly once.
 */
const COVERED_AUDIT_ACTIONS = new Set([
  "lead.created",
  "lead.status_changed",
  "lead.assigned",
  "lead.note_added",
  "handover.created",
  "handover.requested",
  "recommendation.created",
  "document.uploaded",
  "application.signed",
  "policy.created",
  // Bookkeeping that does not change the relationship.
  "fixture.created",
  "demo.customer_selected",
  "document.extracted",
  "document.extraction_failed",
  "document.viewed",
  "offer.repriced",
]);

const AUDIT_EVENTS: Record<string, { kind: TimelineKind; event: TimelineEvent }> = {
  "recommendation.declined": { kind: "offer", event: "recommendationDeclined" },
  "suitability.completed": { kind: "offer", event: "suitabilityCompleted" },
  "offer.prepared": { kind: "offer", event: "offerPrepared" },
  "document.confirmed": { kind: "document", event: "documentConfirmed" },
  "document.deleted": { kind: "document", event: "documentDeleted" },
  "document.discarded": { kind: "document", event: "documentDeleted" },
  "customer.contact_saved": { kind: "other", event: "contactSaved" },
};

/** `handover.updated` stores `{ from, to }`; a status change wins over a re-assignment. */
function handoverUpdate(
  data: Record<string, unknown> | null,
): Pick<TimelineEntry, "event" | "params"> {
  const to = (data?.to ?? {}) as Record<string, unknown>;
  const status = str(to.status);
  return status
    ? { event: "handoverStatus", params: { status } }
    : { event: "handoverAssigned", params: {} };
}

/** Every step of the customer relationship, newest first. */
export function buildTimeline(input: TimelineInput): TimelineEntry[] {
  const leadConversation = new Map(input.leads.map((l) => [l.id, l.conversationId]));
  const entries: TimelineEntry[] = [];
  const push = (e: Omit<TimelineEntry, "actor" | "text"> & Partial<TimelineEntry>) =>
    entries.push({ actor: null, text: null, ...e });

  for (const c of input.conversations) {
    push({
      id: `conversation-${c.id}`,
      at: c.createdAt,
      kind: "conversation",
      event: "conversationStarted",
      params: {},
      text: c.title,
      conversationId: c.id,
    });
  }
  for (const h of input.handovers) {
    push({
      id: `handover-${h.id}`,
      at: h.createdAt,
      kind: "handover",
      event: "handoverCreated",
      params: {},
      text: h.reason,
      conversationId: h.conversationId,
    });
  }
  // The lead row holds today's type and score; the creation entry shows them as first detected.
  const original = new Map<string, { type?: string; score?: number }>();
  for (const a of input.activities.toSorted(
    (x, y) => x.createdAt.getTime() - y.createdAt.getTime(),
  )) {
    if (a.type !== "system") continue;
    const first = original.get(a.leadId) ?? {};
    const score = a.data?.event === "created" ? a.data.score : a.data?.fromScore;
    if (first.score === undefined && typeof score === "number") first.score = score;
    if (
      first.type === undefined &&
      a.data?.event === "retyped" &&
      typeof a.data.fromType === "string"
    )
      first.type = a.data.fromType;
    original.set(a.leadId, first);
  }
  for (const l of input.leads) {
    const first = original.get(l.id);
    push({
      id: `lead-${l.id}`,
      at: l.createdAt,
      kind: "lead",
      event: "leadCreated",
      params: { type: first?.type ?? l.type, score: first?.score ?? l.score },
      conversationId: l.conversationId,
    });
  }
  for (const a of input.activities) {
    const conversationId = leadConversation.get(a.leadId) ?? null;
    const base = { id: `activity-${a.id}`, at: a.createdAt, actor: a.advisorName, conversationId };
    if (a.type === "status_change") {
      push({
        ...base,
        kind: "lead",
        event: "leadStatus",
        params: { from: String(a.data?.from ?? ""), to: String(a.data?.to ?? "") },
      });
    } else if (a.type === "note") {
      push({ ...base, kind: "lead", event: "leadNote", params: {}, text: a.body });
    } else if (a.type === "call" || a.type === "email") {
      const subject = str(a.data?.subject);
      push({
        ...base,
        kind: "communication",
        event: a.type,
        params: {},
        text: [subject, a.body].filter(Boolean).join(": ") || null,
      });
    } else if (a.data?.event === "assigned") {
      push({ ...base, kind: "lead", event: "leadAssigned", params: {} });
    }
    // Other system activities (created, rescored, retyped, merged) are lead bookkeeping.
  }
  for (const r of input.recommendations) {
    push({
      id: `recommendation-${r.id}`,
      at: r.createdAt,
      kind: "offer",
      event: "recommendation",
      params: { product: r.productCode },
      text: r.headline,
      conversationId: r.conversationId,
    });
  }
  for (const ap of input.applications) {
    if (ap.status !== "signed" || !ap.signedAt) continue;
    push({
      id: `application-${ap.id}`,
      at: ap.signedAt,
      kind: "offer",
      event: "applicationSigned",
      params: { product: ap.productCode },
      conversationId: ap.conversationId,
    });
  }
  for (const p of input.policies) {
    if (p.source === "seed") continue;
    push({
      id: `policy-${p.id}`,
      at: p.createdAt,
      kind: "offer",
      event: "policyCreated",
      params: { product: p.productName },
      conversationId: null,
    });
  }
  for (const d of input.documents) {
    push({
      id: `document-${d.id}`,
      at: d.createdAt,
      kind: "document",
      event: "documentUploaded",
      params: { filename: d.filename },
      conversationId: d.conversationId,
    });
  }
  for (const f of input.feedback) {
    push({
      id: `feedback-${f.id}`,
      at: f.createdAt,
      kind: "feedback",
      event: "feedback",
      params: { nps: f.nps },
      text: f.comment,
      conversationId: f.conversationId,
    });
  }
  for (const e of input.audit) {
    if (COVERED_AUDIT_ACTIONS.has(e.action)) continue;
    const base = { id: `audit-${e.id}`, at: e.createdAt, actor: e.actorName, conversationId: null };
    if (isEmailAudit(e)) {
      const subject = str(e.data?.subject);
      push({ ...base, kind: "communication", event: "email", params: {}, text: subject });
      continue;
    }
    if (e.action === "handover.updated") {
      push({ ...base, kind: "handover", ...handoverUpdate(e.data) });
      continue;
    }
    const known = AUDIT_EVENTS[e.action];
    if (known) {
      push({ ...base, ...known, params: {} });
    } else {
      push({ ...base, kind: "other", event: "other", params: { action: e.action } });
    }
  }
  return entries.sort((a, b) => b.at.getTime() - a.at.getTime());
}

import "server-only";
import { and, asc, count, eq, inArray, ne, notInArray, or } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { db, schema } from "@/lib/db";
import { removeStored } from "@/lib/documents/storage";
import { emptyLifeSituation } from "@/lib/domain/profile";
import { getProfile } from "@/lib/profile/service";
import { type ErasureScope, erasurePlan } from "./plan";

/** "Meine Daten" in the portal: what is stored, a full JSON export, and erasure. */

function conversationIdsOf(customerId: string): string[] {
  return db
    .select({ id: schema.conversations.id })
    .from(schema.conversations)
    .where(eq(schema.conversations.customerId, customerId))
    .all()
    .map((row) => row.id);
}

// ─── Inventory ──────────────────────────────────────────────────────────────

export interface DataInventory {
  conversations: number;
  messages: number;
  documents: number;
  /** Filled values in the profile (names, income, family, pension figures...). */
  profileFields: number;
  /** Classifier analyses and leads: what the advisor concluded about the customer. */
  assessments: number;
  /** Pax policies and signed applications, which stay after erasure. */
  contracts: number;
}

function filledValues(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  if (Array.isArray(value)) return value.reduce((sum: number, item) => sum + filledValues(item), 0);
  if (typeof value === "object")
    return Object.values(value).reduce((sum: number, item) => sum + filledValues(item), 0);
  return 1;
}

export function dataInventory(customerId: string): DataInventory {
  const conversationIds = conversationIdsOf(customerId);
  const countOf = (rows: { n: number }[]) => rows[0]?.n ?? 0;
  const messages = conversationIds.length
    ? countOf(
        db
          .select({ n: count() })
          .from(schema.messages)
          .where(inArray(schema.messages.conversationId, conversationIds))
          .all(),
      )
    : 0;
  const analyses = conversationIds.length
    ? countOf(
        db
          .select({ n: count() })
          .from(schema.analyses)
          .where(inArray(schema.analyses.conversationId, conversationIds))
          .all(),
      )
    : 0;
  const leads = countOf(
    db
      .select({ n: count() })
      .from(schema.leads)
      .where(eq(schema.leads.customerId, customerId))
      .all(),
  );
  const documents = countOf(
    db
      .select({ n: count() })
      .from(schema.documents)
      .where(
        and(eq(schema.documents.customerId, customerId), ne(schema.documents.status, "deleted")),
      )
      .all(),
  );
  const plan = loadPlan(customerId);
  return {
    conversations: conversationIds.length,
    messages,
    documents,
    profileFields: filledValues(getProfile(customerId)),
    assessments: analyses + leads,
    contracts: plan.keepPolicyIds.length + plan.keepApplicationIds.length,
  };
}

// ─── Export ─────────────────────────────────────────────────────────────────

/** Everything stored about the customer, as one JSON document (DSG right of access). */
export function exportCustomerData(customerId: string) {
  const customer = db
    .select()
    .from(schema.customers)
    .where(eq(schema.customers.id, customerId))
    .get();
  if (!customer) return null;
  const conversationIds = conversationIdsOf(customerId);
  const ofConversations = <R extends { conversationId: string | null }>(
    rows: R[],
    conversationId: string,
  ) => rows.filter((row) => row.conversationId === conversationId);

  const conversations = db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.customerId, customerId))
    .orderBy(asc(schema.conversations.createdAt))
    .all();
  const messages = conversationIds.length
    ? db
        .select({
          id: schema.messages.id,
          conversationId: schema.messages.conversationId,
          role: schema.messages.role,
          inputMode: schema.messages.inputMode,
          parts: schema.messages.parts,
          createdAt: schema.messages.createdAt,
        })
        .from(schema.messages)
        .where(inArray(schema.messages.conversationId, conversationIds))
        .orderBy(asc(schema.messages.createdAt))
        .all()
    : [];
  const analyses = conversationIds.length
    ? db
        .select()
        .from(schema.analyses)
        .where(inArray(schema.analyses.conversationId, conversationIds))
        .all()
    : [];
  const feedback = db
    .select()
    .from(schema.feedback)
    .where(eq(schema.feedback.customerId, customerId))
    .all();
  const recommendations = db
    .select()
    .from(schema.recommendations)
    .where(eq(schema.recommendations.customerId, customerId))
    .all();
  const handovers = db
    .select()
    .from(schema.handovers)
    .where(eq(schema.handovers.customerId, customerId))
    .all();

  const documents = db
    .select({
      id: schema.documents.id,
      conversationId: schema.documents.conversationId,
      filename: schema.documents.filename,
      mimeType: schema.documents.mimeType,
      sizeBytes: schema.documents.sizeBytes,
      docType: schema.documents.docType,
      status: schema.documents.status,
      createdAt: schema.documents.createdAt,
      deletedAt: schema.documents.deletedAt,
    })
    .from(schema.documents)
    .where(eq(schema.documents.customerId, customerId))
    .all();
  const documentIds = documents.map((d) => d.id);
  const extractions = documentIds.length
    ? db
        .select()
        .from(schema.extractions)
        .where(inArray(schema.extractions.documentId, documentIds))
        .all()
    : [];

  const leads = db.select().from(schema.leads).where(eq(schema.leads.customerId, customerId)).all();
  const leadIds = leads.map((l) => l.id);
  const leadActivities = leadIds.length
    ? db
        .select()
        .from(schema.leadActivities)
        .where(inArray(schema.leadActivities.leadId, leadIds))
        .all()
    : [];

  const where = <T extends { customerId: Parameters<typeof eq>[0] }>(table: T) =>
    eq(table.customerId, customerId);

  return {
    format: "pax-meine-daten/1",
    exportedAt: new Date().toISOString(),
    customer,
    profile: getProfile(customerId),
    profileHistory: db
      .select()
      .from(schema.profileEvents)
      .where(where(schema.profileEvents))
      .orderBy(asc(schema.profileEvents.createdAt))
      .all(),
    contactPreferences:
      db.select().from(schema.contactPreferences).where(where(schema.contactPreferences)).get() ??
      null,
    conversations: conversations.map((conversation) => ({
      ...conversation,
      messages: ofConversations(messages, conversation.id),
      analysis: analyses.find((a) => a.conversationId === conversation.id) ?? null,
      recommendations: ofConversations(recommendations, conversation.id),
      handovers: ofConversations(handovers, conversation.id),
      feedback: ofConversations(feedback, conversation.id),
    })),
    calculations: db
      .select()
      .from(schema.calculations)
      .where(where(schema.calculations))
      .orderBy(asc(schema.calculations.createdAt))
      .all(),
    documents: documents.map((document) => ({
      ...document,
      // The files themselves are downloadable one by one in the portal.
      file: document.status === "deleted" ? null : `/api/documents/${document.id}/file`,
      extractions: extractions.filter((e) => e.documentId === document.id),
    })),
    policies: db.select().from(schema.policies).where(where(schema.policies)).all(),
    applications: db.select().from(schema.applications).where(where(schema.applications)).all(),
    hints: db.select().from(schema.hints).where(where(schema.hints)).all(),
    leads: leads.map((lead) => ({
      ...lead,
      activities: leadActivities.filter((a) => a.leadId === lead.id),
    })),
    futureEvents: db.select().from(schema.futureEvents).where(where(schema.futureEvents)).all(),
    emails: db.select().from(schema.outboxEmails).where(where(schema.outboxEmails)).all(),
    auditLog: db
      .select()
      .from(schema.auditLog)
      .where(
        or(
          and(eq(schema.auditLog.actorType, "customer"), eq(schema.auditLog.actorId, customerId)),
          eq(schema.auditLog.entityId, customerId),
        ),
      )
      .orderBy(asc(schema.auditLog.createdAt))
      .all(),
  };
}

export type CustomerExport = NonNullable<ReturnType<typeof exportCustomerData>>;

// ─── Erasure ────────────────────────────────────────────────────────────────

function loadPlan(customerId: string) {
  return erasurePlan(
    db
      .select({ id: schema.policies.id, isExternal: schema.policies.isExternal })
      .from(schema.policies)
      .where(eq(schema.policies.customerId, customerId))
      .all(),
    db
      .select({
        id: schema.applications.id,
        status: schema.applications.status,
        policyId: schema.applications.policyId,
      })
      .from(schema.applications)
      .where(eq(schema.applications.customerId, customerId))
      .all(),
  );
}

const idsOf = (rows: { id: string }[]) => rows.map((row) => row.id);

/**
 * Deletes everything the advisor collected or produced for the customer: conversations
 * (messages, analyses, recommendations, handovers, feedback), profile and its history,
 * documents with their files and extractions, calculations, leads, hints, follow-ups and
 * emails, plus the audit entries about them. Pax contracts stay (see `erasurePlan`); without
 * any, the customer row goes too. One pseudonymous audit entry records that it happened.
 */
export async function eraseCustomerData(customerId: string): Promise<ErasureScope> {
  const plan = loadPlan(customerId);
  const { keepPolicyIds, keepApplicationIds } = plan;
  const documents = db
    .select({ id: schema.documents.id, storagePath: schema.documents.storagePath })
    .from(schema.documents)
    .where(eq(schema.documents.customerId, customerId))
    .all();
  const owned = {
    policies: idsOf(
      db
        .select({ id: schema.policies.id })
        .from(schema.policies)
        .where(eq(schema.policies.customerId, customerId))
        .all(),
    ),
    applications: idsOf(
      db
        .select({ id: schema.applications.id })
        .from(schema.applications)
        .where(eq(schema.applications.customerId, customerId))
        .all(),
    ),
    leads: idsOf(
      db
        .select({ id: schema.leads.id })
        .from(schema.leads)
        .where(eq(schema.leads.customerId, customerId))
        .all(),
    ),
    handovers: idsOf(
      db
        .select({ id: schema.handovers.id })
        .from(schema.handovers)
        .where(eq(schema.handovers.customerId, customerId))
        .all(),
    ),
    recommendations: idsOf(
      db
        .select({ id: schema.recommendations.id })
        .from(schema.recommendations)
        .where(eq(schema.recommendations.customerId, customerId))
        .all(),
    ),
    hints: idsOf(
      db
        .select({ id: schema.hints.id })
        .from(schema.hints)
        .where(eq(schema.hints.customerId, customerId))
        .all(),
    ),
    futureEvents: idsOf(
      db
        .select({ id: schema.futureEvents.id })
        .from(schema.futureEvents)
        .where(eq(schema.futureEvents.customerId, customerId))
        .all(),
    ),
    emails: idsOf(
      db
        .select({ id: schema.outboxEmails.id })
        .from(schema.outboxEmails)
        .where(eq(schema.outboxEmails.customerId, customerId))
        .all(),
    ),
  };
  const removedPolicyIds = owned.policies.filter((id) => !keepPolicyIds.includes(id));
  const removedApplicationIds = owned.applications.filter((id) => !keepApplicationIds.includes(id));
  // Audit entries that point at something being deleted.
  const entityIds = [
    ...(plan.scope === "full" ? [customerId] : []),
    ...conversationIdsOf(customerId),
    ...idsOf(documents),
    ...owned.leads,
    ...owned.handovers,
    ...owned.recommendations,
    ...owned.hints,
    ...owned.futureEvents,
    ...owned.emails,
    ...removedPolicyIds,
    ...removedApplicationIds,
  ];

  db.transaction((tx) => {
    tx.delete(schema.auditLog)
      .where(
        and(eq(schema.auditLog.actorType, "customer"), eq(schema.auditLog.actorId, customerId)),
      )
      .run();
    if (entityIds.length)
      tx.delete(schema.auditLog).where(inArray(schema.auditLog.entityId, entityIds)).run();

    if (plan.scope === "full") {
      // Every customer table cascades from the customer row.
      tx.delete(schema.customers).where(eq(schema.customers.id, customerId)).run();
      return;
    }
    tx.delete(schema.conversations).where(eq(schema.conversations.customerId, customerId)).run();
    tx.delete(schema.calculations).where(eq(schema.calculations.customerId, customerId)).run();
    tx.delete(schema.profileEvents).where(eq(schema.profileEvents.customerId, customerId)).run();
    tx.delete(schema.hints).where(eq(schema.hints.customerId, customerId)).run();
    tx.delete(schema.futureEvents).where(eq(schema.futureEvents.customerId, customerId)).run();
    tx.delete(schema.outboxEmails).where(eq(schema.outboxEmails.customerId, customerId)).run();
    tx.delete(schema.leads).where(eq(schema.leads.customerId, customerId)).run();
    tx.delete(schema.documents).where(eq(schema.documents.customerId, customerId)).run();
    tx.delete(schema.policies)
      .where(
        and(
          eq(schema.policies.customerId, customerId),
          notInArray(schema.policies.id, keepPolicyIds),
        ),
      )
      .run();
    tx.delete(schema.applications)
      .where(
        and(
          eq(schema.applications.customerId, customerId),
          notInArray(schema.applications.id, keepApplicationIds),
        ),
      )
      .run();
    tx.update(schema.profiles)
      .set({ data: emptyLifeSituation(), completeness: 0 })
      .where(eq(schema.profiles.customerId, customerId))
      .run();
  });

  // Files go after the rows, so a failed transaction never leaves rows without their file.
  await Promise.all(documents.map((doc) => removeStored(doc.storagePath)));
  audit({
    actorType: "customer",
    actorId: null,
    action: "customer.data_erased",
    entityType: "customer",
    entityId: customerId,
    data: {
      scope: plan.scope,
      keptPolicies: keepPolicyIds.length,
      keptApplications: keepApplicationIds.length,
    },
  });
  return plan.scope;
}

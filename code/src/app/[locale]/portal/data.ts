import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { visiblePolicies } from "@/components/portal/cockpit";
import type { PortalDocument } from "@/components/portal/document-list";
import { db, schema } from "@/lib/db";
import { toIsoDate } from "@/lib/documents/dates";
import { getExtractionSummary, listCustomerDocuments } from "@/lib/documents/service";
import { getProfile } from "@/lib/profile/service";

const REVIEW_STATUSES = new Set(["uploaded", "extracting", "extracted", "failed"]);

/** Everything the cockpit shows for one customer (synchronous SQLite reads). */
export function loadCockpit(customerId: string) {
  const profile = getProfile(customerId);
  const policies = visiblePolicies(
    db.select().from(schema.policies).where(eq(schema.policies.customerId, customerId)).all(),
  );

  const documents: PortalDocument[] = listCustomerDocuments(customerId).map((doc) => {
    const review = REVIEW_STATUSES.has(doc.status) ? getExtractionSummary(doc.id) : null;
    return {
      id: doc.id,
      filename: doc.filename,
      docType: doc.docType,
      status: doc.status,
      uploadedAt: toIsoDate(doc.createdAt),
      pageCount: doc.pageCount,
      // "Other" documents are only filed; there is nothing to confirm.
      review:
        review && !(review.status === "extracted" && review.docType === "other") ? review : null,
    };
  });

  const conversations = db
    .select()
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.customerId, customerId),
        eq(schema.conversations.isSimulated, false),
      ),
    )
    .orderBy(desc(schema.conversations.lastMessageAt))
    .limit(6)
    .all();

  // Latest source per profile path, to mark values that came from a document.
  const events = db
    .select({ path: schema.profileEvents.path, source: schema.profileEvents.source })
    .from(schema.profileEvents)
    .where(eq(schema.profileEvents.customerId, customerId))
    .orderBy(desc(schema.profileEvents.createdAt))
    .all();
  const latest = new Map<string, string>();
  for (const event of events) if (!latest.has(event.path)) latest.set(event.path, event.source);
  const documentPaths = [...latest].filter(([, source]) => source === "document").map(([p]) => p);

  return { profile, policies, documents, conversations, documentPaths };
}

import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { PRODUCTS } from "@/lib/domain/products";

/**
 * What really happened to the offers of a conversation, from the database. The advisor gets
 * this every turn so it never takes the customer's word for a signature.
 */
export interface ApplicationState {
  productName: string;
  status: "draft" | "signed" | "cancelled";
  /** True once the offer was priced (a draft may only carry the suitability check). */
  offerShown: boolean;
  policyNumber: string | null;
  /** Signed but not yet released by a Pax advisor (policy status `offer`). */
  inReview: boolean;
  signedAt: string | null;
}

export function applicationStates(conversationId: string): ApplicationState[] {
  return db
    .select({
      productCode: schema.applications.productCode,
      status: schema.applications.status,
      offer: schema.applications.offer,
      signedAt: schema.applications.signedAt,
      policyNumber: schema.policies.policyNumber,
      policyStatus: schema.policies.status,
    })
    .from(schema.applications)
    .leftJoin(schema.policies, eq(schema.policies.id, schema.applications.policyId))
    .where(eq(schema.applications.conversationId, conversationId))
    .orderBy(asc(schema.applications.createdAt))
    .all()
    .map((row) => ({
      productName: PRODUCTS[row.productCode].name,
      status: row.status,
      offerShown: "price" in row.offer,
      policyNumber: row.policyNumber,
      inReview: row.policyStatus === "offer",
      signedAt: row.signedAt ? row.signedAt.toISOString().slice(0, 10) : null,
    }));
}

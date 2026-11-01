import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { toIsoDate } from "@/lib/documents/dates";
import { getProfile } from "@/lib/profile/service";
import { contractDocument } from "./mapping";
import type { ContractDocument, ContractDocumentKind } from "./types";

export function getPolicy(policyId: string) {
  return db.select().from(schema.policies).where(eq(schema.policies.id, policyId)).get();
}

type Policy = NonNullable<ReturnType<typeof getPolicy>>;

/** Reads everything one contract document shows (synchronous SQLite reads). */
export function loadContractDocument(
  policy: Policy,
  kind: ContractDocumentKind,
): ContractDocument | null {
  const customer = db
    .select()
    .from(schema.customers)
    .where(eq(schema.customers.id, policy.customerId))
    .get();
  if (!customer) return null;
  const application = policy.applicationId
    ? (db
        .select()
        .from(schema.applications)
        .where(eq(schema.applications.id, policy.applicationId))
        .get() ?? null)
    : null;
  const recommendation =
    kind === "offer" && application?.recommendationId
      ? (db
          .select()
          .from(schema.recommendations)
          .where(eq(schema.recommendations.id, application.recommendationId))
          .get() ?? null)
      : null;
  const approvedBy = policy.details?.approvedBy;
  const advisor =
    typeof approvedBy === "string"
      ? db
          .select({ name: schema.advisors.name })
          .from(schema.advisors)
          .where(eq(schema.advisors.id, approvedBy))
          .get()
      : undefined;
  const { residence } = getProfile(customer.id);
  const place = [residence.zip, residence.city].filter(Boolean).join(" ") || null;

  return contractDocument(kind, {
    policy,
    customer,
    place,
    application,
    recommendation,
    advisorName: advisor?.name ?? null,
    today: toIsoDate(new Date()),
  });
}

import "server-only";
import { and, desc, eq, isNull, notLike, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { SCENARIO_SUFFIX } from "./checks";

/** The customer's latest successful Logismata call of one operation, what-if scenarios excluded. */
export function latestCalculation(customerId: string, operation: string) {
  return db
    .select()
    .from(schema.calculations)
    .where(
      and(
        eq(schema.calculations.customerId, customerId),
        eq(schema.calculations.operation, operation),
        eq(schema.calculations.status, "ok"),
        or(
          isNull(schema.calculations.toolCallId),
          notLike(schema.calculations.toolCallId, `%${SCENARIO_SUFFIX}`),
        ),
      ),
    )
    .orderBy(desc(schema.calculations.createdAt))
    .limit(1)
    .get();
}

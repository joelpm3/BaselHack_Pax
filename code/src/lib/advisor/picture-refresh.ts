import "server-only";
import { and, desc, eq, isNull, notLike, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { LifeSituation } from "@/lib/domain/profile";
import { getProfile } from "@/lib/profile/service";
import { runRetirementCheck, runRiskCheck, SCENARIO_SUFFIX } from "./logismata/checks";
import { affectsCalculations, missingForPicture } from "./logismata/mapping";

/**
 * Keeps the Vorsorgebild in step with the profile without waiting for the advisor to call a
 * tool: once every input is known, the retirement and risk check run again whenever a relevant
 * profile value changed after the last attempt. Logismata calls only (no model call), from the
 * Vorsorgebild route, so the chat never waits for them.
 */

export const PICTURE_CALCULATIONS = {
  retirement: "APICalc_calculateRetirement",
  risk: "APICalc_calculateRisk",
} as const;
type PictureCheck = keyof typeof PICTURE_CALCULATIONS;

/** Logged as the tool call id so the firm sees which calculations the picture triggered. */
const TOOL_CALL_ID = "vorsorgebild";

/** Latest attempt, failed ones included, so a failing check is not retried on every refresh. */
function lastAttemptAt(customerId: string, operation: string): number {
  const row = db
    .select({ createdAt: schema.calculations.createdAt })
    .from(schema.calculations)
    .where(
      and(
        eq(schema.calculations.customerId, customerId),
        eq(schema.calculations.operation, operation),
        or(
          isNull(schema.calculations.toolCallId),
          notLike(schema.calculations.toolCallId, `%${SCENARIO_SUFFIX}`),
        ),
      ),
    )
    .orderBy(desc(schema.calculations.createdAt))
    .limit(1)
    .get();
  return row?.createdAt.getTime() ?? 0;
}

function lastRelevantChangeAt(customerId: string): number {
  const events = db
    .select({ path: schema.profileEvents.path, createdAt: schema.profileEvents.createdAt })
    .from(schema.profileEvents)
    .where(eq(schema.profileEvents.customerId, customerId))
    .orderBy(desc(schema.profileEvents.createdAt))
    .limit(200)
    .all();
  return events.find((e) => affectsCalculations(e.path))?.createdAt.getTime() ?? 0;
}

/** Checks whose result is missing or older than the profile; empty while inputs are missing. */
export function outdatedChecks(customerId: string, profile: LifeSituation): PictureCheck[] {
  if (missingForPicture(profile).length > 0) return [];
  const changedAt = lastRelevantChangeAt(customerId);
  return (Object.keys(PICTURE_CALCULATIONS) as PictureCheck[]).filter((check) => {
    const attemptAt = lastAttemptAt(customerId, PICTURE_CALCULATIONS[check]);
    return attemptAt === 0 || attemptAt < changedAt;
  });
}

const running = new Map<string, Promise<void>>();

/** Runs the outdated checks once per customer at a time; failures leave the picture as it was. */
export function refreshPictureCalculations(
  customerId: string,
  conversationId: string,
): Promise<void> {
  const current = running.get(customerId);
  if (current) return current;
  const job = (async () => {
    const profile = getProfile(customerId);
    const checks = outdatedChecks(customerId, profile);
    const ctx = { customerId, conversationId, toolCallId: TOOL_CALL_ID };
    await Promise.allSettled([
      checks.includes("retirement") ? runRetirementCheck(profile, ctx) : null,
      checks.includes("risk") ? runRiskCheck(profile, ctx) : null,
    ]);
  })().finally(() => running.delete(customerId));
  running.set(customerId, job);
  return job;
}

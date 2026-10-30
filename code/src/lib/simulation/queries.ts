import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { customerColumns } from "@/lib/firma/common";
import { isRunInProcess, type RunStats } from "./engine";

/** Rows still "running" whose process is gone (server restart) are closed as cancelled. */
function closeStaleRuns(): void {
  const stale = db
    .select({ id: schema.simulationRuns.id })
    .from(schema.simulationRuns)
    .where(eq(schema.simulationRuns.status, "running"))
    .all()
    .filter((r) => !isRunInProcess(r.id));
  if (stale.length === 0) return;
  db.update(schema.simulationRuns)
    .set({ status: "cancelled", finishedAt: new Date() })
    .where(
      inArray(
        schema.simulationRuns.id,
        stale.map((r) => r.id),
      ),
    )
    .run();
}

export function listSimulationRuns(limit = 10) {
  closeStaleRuns();
  const runs = db
    .select({
      id: schema.simulationRuns.id,
      size: schema.simulationRuns.size,
      concurrency: schema.simulationRuns.concurrency,
      status: schema.simulationRuns.status,
      personaMix: schema.simulationRuns.personaMix,
      stats: schema.simulationRuns.stats,
      startedAt: schema.simulationRuns.startedAt,
      finishedAt: schema.simulationRuns.finishedAt,
      startedBy: schema.advisors.name,
    })
    .from(schema.simulationRuns)
    .leftJoin(schema.advisors, eq(schema.advisors.id, schema.simulationRuns.startedByAdvisorId))
    .orderBy(desc(schema.simulationRuns.startedAt))
    .limit(limit)
    .all();

  const runIds = runs.map((r) => r.id);
  const conversations = runIds.length
    ? db
        .select({
          id: schema.conversations.id,
          runId: schema.conversations.simulationRunId,
          stage: schema.conversations.stage,
          status: schema.conversations.status,
          locale: schema.conversations.locale,
          mode: schema.conversations.mode,
          title: schema.conversations.title,
          createdAt: schema.conversations.createdAt,
          ...customerColumns,
        })
        .from(schema.conversations)
        .innerJoin(schema.customers, eq(schema.customers.id, schema.conversations.customerId))
        .leftJoin(schema.profiles, eq(schema.profiles.customerId, schema.conversations.customerId))
        .where(inArray(schema.conversations.simulationRunId, runIds))
        .orderBy(schema.conversations.createdAt)
        .all()
    : [];

  return runs.map((run) => ({
    ...run,
    stats: (run.stats ?? null) as RunStats | null,
    conversations: conversations.filter((c) => c.runId === run.id),
  }));
}

export type SimulationRunItem = ReturnType<typeof listSimulationRuns>[number];

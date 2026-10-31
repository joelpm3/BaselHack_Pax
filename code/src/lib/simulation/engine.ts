import "server-only";
import { generateText, Output, type UIMessage } from "ai";
import { and, asc, eq, ne } from "drizzle-orm";
import { createConversation } from "@/lib/advisor/conversations";
import { runAdvisorTurn } from "@/lib/advisor/turn";
import { getModel } from "@/lib/ai/models";
import { audit } from "@/lib/audit";
import { db, schema } from "@/lib/db";
import { lifeSituationSchema, profileCompleteness } from "@/lib/domain/profile";
import type { ConversationStatus } from "@/lib/domain/taxonomy";
import { publish } from "@/lib/events/bus";
import { scheduleAnalysis } from "@/lib/insights";
import { compactJson, messageItems, messageText } from "@/lib/insights/transcript";
import { demoCast } from "./demo-personas";
import {
  buildCast,
  type DemoPersonaKey,
  personaEmail,
  type SimPersona,
  summariseCast,
} from "./personas";
import {
  type CustomerTurn,
  conversationSoFar,
  customerInstructions,
  customerTurnSchema,
  type SimTurn,
} from "./prompt";

export const SIMULATION_LIMITS = {
  size: { min: 1, max: 20, default: 8 },
  concurrency: { min: 1, max: 8, default: 5 },
  maxTurns: 12,
} as const;

type Outcome = "completed" | "abandoned" | "idle" | "failed" | "cancelled";

/** A type alias (not an interface) so it fits the JSON `stats` column. */
export type RunStats = {
  done: number;
  completed: number;
  abandoned: number;
  idle: number;
  failed: number;
  cancelled: number;
  turns: number;
  conversationIds: string[];
  errors: string[];
};

const emptyStats = (): RunStats => ({
  done: 0,
  completed: 0,
  abandoned: 0,
  idle: 0,
  failed: 0,
  cancelled: 0,
  turns: 0,
  conversationIds: [],
  errors: [],
});

// Running simulations of this server process, to cancel them and to spot stale "running" rows.
const globalForSim = globalThis as unknown as { paxSimulations?: Map<string, AbortController> };
const running = globalForSim.paxSimulations ?? new Map<string, AbortController>();
globalForSim.paxSimulations = running;

export function isRunInProcess(runId: string): boolean {
  return running.has(runId);
}

function saveStats(runId: string, stats: RunStats): void {
  db.update(schema.simulationRuns).set({ stats }).where(eq(schema.simulationRuns.id, runId)).run();
  publish({ type: "simulation.updated", runId });
}

/** New simulated customer. Existing clients get a copy of their CRM data (profile, policies). */
function createSimCustomer(persona: SimPersona): string {
  return db.transaction((tx) => {
    const isClient = persona.mode === "existing_customer";
    const customer = tx
      .insert(schema.customers)
      .values({
        lifecycle: isClient ? "client" : "anonymous",
        locale: persona.locale,
        isSimulated: true,
        ...(isClient
          ? {
              firstName: persona.firstName,
              lastName: persona.lastName,
              email: personaEmail(persona),
              birthDate: `${persona.birthYear}-01-01`,
            }
          : {}),
      })
      .returning()
      .get();

    let profileData = lifeSituationSchema.parse({});
    const demo = isClient
      ? tx
          .select()
          .from(schema.customers)
          .where(
            and(
              eq(schema.customers.isDemo, true),
              eq(schema.customers.firstName, persona.firstName),
            ),
          )
          .get()
      : undefined;
    if (demo) {
      const demoProfile = tx
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.customerId, demo.id))
        .get();
      if (demoProfile) profileData = lifeSituationSchema.parse(demoProfile.data);
      const demoPolicies = tx
        .select()
        .from(schema.policies)
        .where(eq(schema.policies.customerId, demo.id))
        .all();
      if (demoPolicies.length) {
        tx.insert(schema.policies)
          .values(
            demoPolicies.map(({ id: _id, createdAt: _c, updatedAt: _u, ...p }) => ({
              ...p,
              customerId: customer.id,
              source: "seed" as const,
            })),
          )
          .run();
      }
    }
    tx.insert(schema.profiles)
      .values({
        customerId: customer.id,
        data: profileData,
        completeness: profileCompleteness(profileData),
      })
      .run();
    return customer.id;
  });
}

/** The advisor's opening message(s), so the simulated customer answers the greeting. */
function openingTurns(conversationId: string): SimTurn[] {
  return db
    .select({ parts: schema.messages.parts })
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.conversationId, conversationId),
        eq(schema.messages.role, "assistant"),
      ),
    )
    .orderBy(asc(schema.messages.createdAt))
    .all()
    .map((m) => ({ role: "advisor" as const, text: messageText(m.parts) }))
    .filter((t) => t.text);
}

/** What the simulated customer "sees" of an advisor reply: text plus widget contents. */
function advisorView(message: UIMessage): string {
  return messageItems(message.parts)
    .map((item) => {
      if (item.kind === "text") return item.text;
      if (item.kind === "file") return `[file ${item.filename ?? ""}]`;
      if (item.tool.errorText) return `[${item.tool.name} could not be shown]`;
      return `[shows ${item.tool.name}: ${compactJson(item.tool.output ?? item.tool.input, 500)}]`;
    })
    .join("\n")
    .trim();
}

async function nextCustomerTurn(
  persona: SimPersona,
  turns: SimTurn[],
  currentYear: number,
  signal: AbortSignal,
): Promise<CustomerTurn> {
  const { output } = await generateText({
    model: getModel("simulation"),
    instructions: customerInstructions(persona, currentYear),
    prompt: conversationSoFar(turns),
    output: Output.object({ schema: customerTurnSchema, name: "customer_turn" }),
    maxRetries: 2,
    abortSignal: signal,
  });
  return output;
}

/**
 * Final status of a simulated chat; a handover the advisor already made is kept. Cancelled
 * runs end as "idle" so they do not count as customer drop-offs in the funnel.
 */
function finishConversation(conversationId: string, status: ConversationStatus): void {
  db.update(schema.conversations)
    .set({ status })
    .where(
      and(
        eq(schema.conversations.id, conversationId),
        ne(schema.conversations.status, "handed_over"),
      ),
    )
    .run();
  publish({ type: "conversation.updated", conversationId });
  scheduleAnalysis(conversationId);
}

async function simulateOne(
  persona: SimPersona,
  runId: string,
  signal: AbortSignal,
  onTurn: (conversationId: string) => void,
): Promise<{ outcome: Outcome; turns: number; error?: string }> {
  const currentYear = new Date().getFullYear();
  const customerId = createSimCustomer(persona);
  const { id: conversationId } = await createConversation({
    customerId,
    locale: persona.locale,
    mode: persona.mode,
    isSimulated: true,
    simulationRunId: runId,
  });
  onTurn(conversationId);

  const turns: SimTurn[] = openingTurns(conversationId);
  let advisorReplies = 0;
  try {
    for (let i = 0; i < SIMULATION_LIMITS.maxTurns; i++) {
      if (signal.aborted) {
        finishConversation(conversationId, "idle");
        return { outcome: "cancelled", turns: advisorReplies };
      }
      if (persona.patience !== null && advisorReplies >= persona.patience) {
        finishConversation(conversationId, "abandoned");
        return { outcome: "abandoned", turns: advisorReplies };
      }
      const next = await nextCustomerTurn(persona, turns, currentYear, signal);
      const text = next.message.trim();
      if (next.action === "drop_off" || !text) {
        finishConversation(conversationId, "abandoned");
        return { outcome: "abandoned", turns: advisorReplies };
      }

      turns.push({ role: "customer", text });
      const reply = await runAdvisorTurn({
        conversationId,
        userMessage: { id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text }] },
      });
      advisorReplies++;
      turns.push({ role: "advisor", text: advisorView(reply) });
      onTurn(conversationId);

      if (next.action === "end") {
        if (next.nps !== null) {
          db.insert(schema.feedback)
            .values({
              conversationId,
              customerId,
              nps: Math.max(0, Math.min(10, Math.round(next.nps))),
            })
            .run();
        }
        finishConversation(conversationId, "completed");
        return { outcome: "completed", turns: advisorReplies };
      }
    }
    finishConversation(conversationId, "idle");
    return { outcome: "idle", turns: advisorReplies };
  } catch (error) {
    if (signal.aborted) {
      finishConversation(conversationId, "idle");
      return { outcome: "cancelled", turns: advisorReplies };
    }
    finishConversation(conversationId, "idle");
    return {
      outcome: "failed",
      turns: advisorReplies,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function executeRun(
  runId: string,
  cast: SimPersona[],
  concurrency: number,
  controller: AbortController,
): Promise<void> {
  const stats = emptyStats();
  const queue = [...cast];

  const worker = async () => {
    while (queue.length > 0 && !controller.signal.aborted) {
      const persona = queue.shift() as SimPersona;
      const result = await simulateOne(persona, runId, controller.signal, (id) => {
        if (!stats.conversationIds.includes(id)) stats.conversationIds.push(id);
        saveStats(runId, stats);
      }).catch((error: unknown) => ({
        outcome: "failed" as const,
        turns: 0,
        error: error instanceof Error ? error.message : String(error),
      }));
      stats.done++;
      stats[result.outcome]++;
      stats.turns += result.turns;
      if (result.error && stats.errors.length < 5) stats.errors.push(result.error.slice(0, 300));
      saveStats(runId, stats);
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, cast.length) }, worker));
  } finally {
    running.delete(runId);
    const status = controller.signal.aborted
      ? "cancelled"
      : stats.failed === cast.length
        ? "failed"
        : "completed";
    db.update(schema.simulationRuns)
      .set({ status, stats, finishedAt: new Date() })
      .where(eq(schema.simulationRuns.id, runId))
      .run();
    publish({ type: "simulation.updated", runId });
  }
}

/**
 * Starts a run in the background and returns its id immediately. With `personas`, the run plays
 * exactly those hand-written demo personas (to test a feature with a known customer) and `size`
 * is ignored.
 */
export function startSimulationRun(input: {
  size: number;
  concurrency: number;
  advisorId: string | null;
  seed?: number;
  personas?: DemoPersonaKey[];
}): string {
  const seed = input.seed ?? Date.now();
  const cast = input.personas?.length
    ? demoCast(input.personas)
    : buildCast(input.size, seed, new Date().getFullYear());
  const run = db
    .insert(schema.simulationRuns)
    .values({
      size: cast.length,
      concurrency: input.concurrency,
      personaMix: { seed, ...summariseCast(cast) },
      stats: emptyStats(),
      startedByAdvisorId: input.advisorId,
    })
    .returning()
    .get();
  audit({
    actorType: input.advisorId ? "advisor" : "system",
    actorId: input.advisorId,
    action: "simulation.started",
    entityType: "simulation_run",
    entityId: run.id,
    data: { size: cast.length, concurrency: input.concurrency, seed, personas: input.personas },
  });
  const controller = new AbortController();
  running.set(run.id, controller);
  publish({ type: "simulation.updated", runId: run.id });
  void executeRun(run.id, cast, input.concurrency, controller).catch((error) =>
    console.error(`[simulation] run ${run.id} crashed`, error),
  );
  return run.id;
}

export function cancelSimulationRun(runId: string, advisorId: string | null): boolean {
  const controller = running.get(runId);
  if (controller) controller.abort();
  else {
    // Not in this process (e.g. after a server restart): just close the row.
    db.update(schema.simulationRuns)
      .set({ status: "cancelled", finishedAt: new Date() })
      .where(and(eq(schema.simulationRuns.id, runId), eq(schema.simulationRuns.status, "running")))
      .run();
    publish({ type: "simulation.updated", runId });
  }
  audit({
    actorType: advisorId ? "advisor" : "system",
    actorId: advisorId,
    action: "simulation.cancelled",
    entityType: "simulation_run",
    entityId: runId,
  });
  return Boolean(controller);
}

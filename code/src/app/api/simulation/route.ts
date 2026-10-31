import { z } from "zod";
import { getCurrentAdvisor } from "@/lib/auth/advisor";
import {
  cancelSimulationRun,
  SIMULATION_LIMITS,
  startSimulationRun,
} from "@/lib/simulation/engine";
import { DEMO_PERSONA_KEYS } from "@/lib/simulation/personas";

/**
 * Starts (POST) or cancels (DELETE ?runId=) a simulation run, for scripts and demos; the
 * dashboard uses the equivalent server actions. Requires the advisor cookie. `personas` plays
 * the named demo personas instead of a random cast, e.g.
 * `{ "personas": ["student_first_job", "self_employed_8165"] }`.
 */
const startSchema = z.object({
  size: z
    .number()
    .int()
    .min(SIMULATION_LIMITS.size.min)
    .max(SIMULATION_LIMITS.size.max)
    .default(SIMULATION_LIMITS.size.default),
  personas: z.array(z.enum(DEMO_PERSONA_KEYS)).min(1).max(SIMULATION_LIMITS.size.max).optional(),
  concurrency: z
    .number()
    .int()
    .min(SIMULATION_LIMITS.concurrency.min)
    .max(SIMULATION_LIMITS.concurrency.max)
    .default(SIMULATION_LIMITS.concurrency.default),
  seed: z.number().int().optional(),
});

export async function POST(request: Request): Promise<Response> {
  const advisor = await getCurrentAdvisor();
  if (!advisor) return new Response("Unauthorized", { status: 401 });
  const parsed = startSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues }, { status: 400 });
  const runId = startSimulationRun({ ...parsed.data, advisorId: advisor.id });
  return Response.json({ runId }, { status: 202 });
}

export async function DELETE(request: Request): Promise<Response> {
  const advisor = await getCurrentAdvisor();
  if (!advisor) return new Response("Unauthorized", { status: 401 });
  const runId = new URL(request.url).searchParams.get("runId");
  if (!runId) return Response.json({ error: "runId missing" }, { status: 400 });
  return Response.json({ cancelled: cancelSimulationRun(runId, advisor.id) });
}

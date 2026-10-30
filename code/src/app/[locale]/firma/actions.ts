"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { clearAdvisorCookie, setAdvisorCookie } from "@/lib/auth/advisor";
import { db, schema } from "@/lib/db";
import { HANDOVER_STATUSES, LEAD_STATUSES } from "@/lib/domain/taxonomy";
import { advisorOrThrow, isCompanyPassword } from "@/lib/firma/auth";
import * as mutations from "@/lib/firma/mutations";
import { draftFromVersion, ruleSetDraftSchema } from "@/lib/firma/rule-sets";
import { analyzeConversation } from "@/lib/insights";
import {
  cancelSimulationRun,
  SIMULATION_LIMITS,
  startSimulationRun,
} from "@/lib/simulation/engine";

export interface LoginState {
  error: "password" | "advisor" | null;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");
  const advisorId = String(formData.get("advisorId") ?? "");
  if (!isCompanyPassword(password)) return { error: "password" };
  const advisor = db
    .select({ id: schema.advisors.id })
    .from(schema.advisors)
    .where(eq(schema.advisors.id, advisorId))
    .get();
  if (!advisor) return { error: "advisor" };
  await setAdvisorCookie(advisor.id);
  return redirect({ href: "/firma", locale: await getLocale() });
}

export async function logout(): Promise<void> {
  await clearAdvisorCookie();
  return redirect({ href: "/firma/login", locale: await getLocale() });
}

const id = z.string().min(1).max(64);
const advisorRef = z.string().min(1).max(64).nullable();

export async function setLeadStatus(leadId: string, status: string): Promise<void> {
  const advisor = await advisorOrThrow();
  mutations.changeLeadStatus(advisor, id.parse(leadId), z.enum(LEAD_STATUSES).parse(status));
  refresh();
}

export async function assignLead(leadId: string, advisorId: string | null): Promise<void> {
  const advisor = await advisorOrThrow();
  mutations.assignLead(advisor, id.parse(leadId), advisorRef.parse(advisorId));
  refresh();
}

const noteSchema = z.object({
  leadId: id,
  type: z.enum(["note", "call", "email"]),
  body: z.string().trim().min(1).max(4000),
});

export async function addLeadNote(
  _prev: { ok: boolean },
  formData: FormData,
): Promise<{ ok: boolean }> {
  const advisor = await advisorOrThrow();
  const parsed = noteSchema.safeParse({
    leadId: formData.get("leadId"),
    type: formData.get("type") ?? "note",
    body: formData.get("body"),
  });
  if (!parsed.success) return { ok: false };
  mutations.addLeadNote(advisor, parsed.data.leadId, parsed.data);
  refresh();
  return { ok: true };
}

export async function setHandoverStatus(handoverId: string, status: string): Promise<void> {
  const advisor = await advisorOrThrow();
  mutations.updateHandover(advisor, id.parse(handoverId), {
    status: z.enum(HANDOVER_STATUSES).parse(status),
  });
  refresh();
}

export async function assignHandover(handoverId: string, advisorId: string | null): Promise<void> {
  const advisor = await advisorOrThrow();
  mutations.updateHandover(advisor, id.parse(handoverId), {
    assignedAdvisorId: advisorRef.parse(advisorId),
  });
  refresh();
}

export type SaveRulesResult =
  | { status: "created"; version: number }
  | { status: "unchanged" }
  | { status: "invalid"; issues: string[] };

export async function saveRuleSet(draft: unknown): Promise<SaveRulesResult> {
  const advisor = await advisorOrThrow();
  const parsed = ruleSetDraftSchema.safeParse(draft);
  if (!parsed.success) {
    return { status: "invalid", issues: parsed.error.issues.map((i) => i.path.join(".")) };
  }
  const result = mutations.saveRuleSet(advisor, parsed.data);
  refresh();
  return result;
}

/** Makes an old version current again by saving its content as a new version. */
export async function restoreRuleSet(ruleSetId: string): Promise<SaveRulesResult> {
  const advisor = await advisorOrThrow();
  const draft = draftFromVersion(db, id.parse(ruleSetId));
  if (!draft) return { status: "invalid", issues: ["ruleSetId"] };
  const result = mutations.saveRuleSet(advisor, draft);
  refresh();
  return result;
}

export async function rerunAnalysis(conversationId: string): Promise<{ ok: boolean }> {
  await advisorOrThrow();
  try {
    await analyzeConversation(id.parse(conversationId), { force: true });
    refresh();
    return { ok: true };
  } catch (error) {
    console.error("[firma] re-analysis failed", error);
    return { ok: false };
  }
}

const simulationSchema = z.object({
  size: z.coerce.number().int().min(SIMULATION_LIMITS.size.min).max(SIMULATION_LIMITS.size.max),
  concurrency: z.coerce
    .number()
    .int()
    .min(SIMULATION_LIMITS.concurrency.min)
    .max(SIMULATION_LIMITS.concurrency.max),
});

export async function startSimulation(
  _prev: { error: boolean },
  formData: FormData,
): Promise<{ error: boolean }> {
  const advisor = await advisorOrThrow();
  const parsed = simulationSchema.safeParse({
    size: formData.get("size"),
    concurrency: formData.get("concurrency"),
  });
  if (!parsed.success) return { error: true };
  startSimulationRun({ ...parsed.data, advisorId: advisor.id });
  refresh();
  return { error: false };
}

export async function cancelSimulation(runId: string): Promise<void> {
  const advisor = await advisorOrThrow();
  cancelSimulationRun(id.parse(runId), advisor.id);
  refresh();
}

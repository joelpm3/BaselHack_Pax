/**
 * The scripted advisor for the browser tests. Each persona is a list of turns: what the customer
 * does (types a message, or a card sends one) and the model steps Clara answers with (text plus
 * tool calls, exactly as the chat model would send them). The mock LLM server replays these; the
 * specs drive the browser through the same turns. The tools themselves run for real in the app.
 */

/** What the mock knows about the request it answers: earlier tool calls and their results. */
export interface StepContext {
  /** Parsed outputs of every earlier call of this tool in the conversation, oldest first. */
  outputs(tool: string): unknown[];
}

export type ToolArgs = Record<string, unknown>;

export interface ToolCallStep {
  name: string;
  args: ToolArgs | ((ctx: StepContext) => ToolArgs);
}

export interface Step {
  text?: string | ((ctx: StepContext) => string);
  tools?: ToolCallStep[];
}

export interface Turn {
  /** The customer's message; the mock checks that the conversation is where the script is. */
  user: RegExp;
  steps: Step[];
}

export interface PersonaScript {
  id: string;
  /** The first customer message, which tells the mock which script a request belongs to. */
  opening: RegExp;
  turns: Turn[];
}

interface RecommendationOutput {
  recommendations?: Array<{ id: string; productCode: string }>;
}

/** The id of the recommendation card for a product, from the latest recommendProducts result. */
export function recommendationId(ctx: StepContext, productCode: string): string {
  const latest = ctx.outputs("recommendProducts").at(-1) as RecommendationOutput | undefined;
  const rec = latest?.recommendations?.find((r) => r.productCode === productCode);
  if (!rec) throw new Error(`No ${productCode} recommendation in the transcript`);
  return rec.id;
}

interface RiskScenario {
  event: string;
  gapPerMonth: number;
}
interface RiskOutput {
  persons?: Array<{ person: number; scenarios: RiskScenario[] }>;
}

/**
 * The largest monthly gap the risk card shows for one person (1 = customer, 2 = partner) and
 * event, read off the latest showRiskAnalysis result, the way the real advisor reads it.
 */
export function riskGapPerMonth(
  ctx: StepContext,
  person: 1 | 2,
  event: "death" | "disability",
): number {
  const latest = ctx.outputs("showRiskAnalysis").at(-1) as RiskOutput | undefined;
  const scenarios = latest?.persons?.find((p) => p.person === person)?.scenarios ?? [];
  return Math.max(0, ...scenarios.filter((s) => s.event === event).map((s) => s.gapPerMonth));
}

interface PensionOutput {
  breakdown?: { gap?: number; need?: number };
}

/** The yearly retirement gap from the latest showPensionOverview result. */
export function retirementGapPerYear(ctx: StepContext): number {
  const latest = ctx.outputs("showPensionOverview").at(-1) as PensionOutput | undefined;
  return Math.max(0, Math.round(latest?.breakdown?.gap ?? 0));
}

/** CHF amounts the Swiss way, as Clara writes them: 1'234. */
export function chf(amount: number): string {
  return `CHF ${Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, "'")}`;
}

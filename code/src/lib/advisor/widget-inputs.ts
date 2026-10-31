import type { LifeSituation } from "@/lib/domain/profile";

/**
 * Values the customer sets in an interactive widget (sliders, option buttons) reach the advisor
 * in their next turn as a short note. Client-safe and pure: the state stored in the tool output,
 * change detection, which values might be the customer's real figures, and the note's wording.
 */

export const WIDGET_INPUT_TOOLS = [
  "explainCompoundInterest",
  "calculateSavingsPlan",
  "simulateScenario",
] as const;
export type WidgetInputTool = (typeof WIDGET_INPUT_TOOLS)[number];

export function isWidgetInputTool(name: string): name is WidgetInputTool {
  return (WIDGET_INPUT_TOOLS as readonly string[]).includes(name);
}

export type WidgetValues = Record<string, number>;

/** Stored in the tool output as `customerInputs`; the advisor never sees it there. */
export interface CustomerInputs {
  /** What the widget shows now. */
  values: WidgetValues;
  /** What the advisor has seen: the tool's own values, then each change it was told about. */
  reported: WidgetValues;
  updatedAt: number;
}

/** Profile fields a widget value can stand for. */
export type PersonalPath =
  | "assets.liquid"
  | "monthlySavings"
  | "pillar3a.balance"
  | "pillar3a.annualContribution";

/** A widget value that may be the customer's real figure and is not (or differently) stored. */
export interface SaveCandidate {
  key: string;
  path: PersonalPath;
  /** In the unit of the profile field (pillar3a.annualContribution: per year). */
  value: number;
  /** What the profile holds now. */
  stored: number | null;
}

/** One widget's changes since the advisor last saw it; kept on the user message it preceded. */
export interface WidgetChange {
  toolCallId: string;
  tool: WidgetInputTool;
  /** Compound interest: pillar3a / savings / general; what-if: the scenario kind. */
  variant: string | null;
  values: WidgetValues;
  changed: string[];
  candidates: SaveCandidate[];
}

/** The numeric values a widget starts from: every tool keeps them in `output.params`. */
export function widgetValuesOf(output: unknown): WidgetValues {
  const params = (output as { params?: unknown } | null)?.params;
  if (!params || typeof params !== "object") return {};
  return Object.fromEntries(
    Object.entries(params).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === "number" && Number.isFinite(entry[1]),
    ),
  );
}

/** Keys whose value differs (a key missing on one side counts as a change). */
export function changedKeys(values: WidgetValues, reported: WidgetValues): string[] {
  const keys = new Set([...Object.keys(values), ...Object.keys(reported)]);
  return [...keys].filter((key) => values[key] !== reported[key]);
}

export function variantOf(tool: WidgetInputTool, output: unknown): string | null {
  const o = output as { basis?: unknown; scenario?: unknown } | null;
  const variant = tool === "simulateScenario" ? o?.scenario : o?.basis;
  return typeof variant === "string" ? variant : null;
}

interface PersonalField {
  path: PersonalPath;
  /** Widget value × factor = profile value. */
  factor: number;
}

/**
 * Which widget values describe the customer's own situation. A what-if (simulateScenario) is
 * an experiment by definition, so none of its values are personal; neither are rates, years
 * and goals, which are assumptions or wishes rather than facts.
 */
export function personalFields(
  tool: WidgetInputTool,
  variant: string | null,
): Record<string, PersonalField> {
  if (tool === "explainCompoundInterest") {
    return variant === "pillar3a"
      ? {
          startAmount: { path: "pillar3a.balance", factor: 1 },
          monthlySaving: { path: "pillar3a.annualContribution", factor: 12 },
        }
      : {
          startAmount: { path: "assets.liquid", factor: 1 },
          monthlySaving: { path: "monthlySavings", factor: 1 },
        };
  }
  if (tool === "calculateSavingsPlan")
    return { startCapital: { path: "assets.liquid", factor: 1 } };
  return {};
}

export function profileValue(profile: LifeSituation, path: PersonalPath): number | null {
  const value =
    path === "assets.liquid"
      ? profile.assets.liquid
      : path === "monthlySavings"
        ? profile.monthlySavings
        : path === "pillar3a.balance"
          ? profile.pillar3a.balance
          : profile.pillar3a.annualContribution;
  return value ?? null;
}

/**
 * Changed values that may be the customer's real figures: personal, above zero, different from
 * the profile, and not asked about before in this conversation (`askedPaths`): the advisor asks
 * once per figure, whatever the customer answered.
 */
export function saveCandidates(input: {
  tool: WidgetInputTool;
  variant: string | null;
  values: WidgetValues;
  changed: string[];
  profile: LifeSituation;
  askedPaths: ReadonlySet<string>;
}): SaveCandidate[] {
  const fields = personalFields(input.tool, input.variant);
  const candidates: SaveCandidate[] = [];
  for (const key of input.changed) {
    const field = fields[key];
    const raw = input.values[key];
    if (!field || raw === undefined || raw <= 0 || input.askedPaths.has(field.path)) continue;
    const value = Math.round(raw * field.factor);
    const stored = profileValue(input.profile, field.path);
    if (stored !== null && Math.round(stored) === value) continue;
    candidates.push({ key, path: field.path, value, stored });
  }
  return candidates;
}

/** The change to report, or null when the widget shows what the advisor already saw. */
export function widgetChange(input: {
  toolCallId: string;
  tool: WidgetInputTool;
  output: unknown;
  inputs: CustomerInputs;
  profile: LifeSituation;
  askedPaths: ReadonlySet<string>;
}): WidgetChange | null {
  const { values, reported } = input.inputs;
  const changed = changedKeys(values, reported);
  if (changed.length === 0) return null;
  const variant = variantOf(input.tool, input.output);
  return {
    toolCallId: input.toolCallId,
    tool: input.tool,
    variant,
    values,
    changed,
    candidates: saveCandidates({
      tool: input.tool,
      variant,
      values,
      changed,
      profile: input.profile,
      askedPaths: input.askedPaths,
    }),
  };
}

// ─── The note for the model ─────────────────────────────────────────────────

/** CHF 20'000 (Swiss grouping, as the advisor writes amounts). */
export function chfText(value: number): string {
  const rounded = Math.round(value);
  const digits = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return `CHF ${rounded < 0 ? "-" : ""}${digits}`;
}

const LABELS: Record<string, (v: number) => string> = {
  startAmount: (v) => `start amount ${chfText(v)}`,
  monthlySaving: (v) => `${chfText(v)} per month`,
  ratePercent: (v) => `${v} % interest`,
  years: (v) => `${v} years`,
  goal: (v) => `goal ${chfText(v)}`,
  startCapital: (v) => `already saved ${chfText(v)}`,
  children: (v) => `${v} children`,
  retirementAge: (v) => `retirement at ${v}`,
  yearlyAmount: (v) => `3a ${chfText(v)} per year`,
  pensionFundWithdrawal: (v) => `pension-fund withdrawal ${chfText(v)}`,
  pillar3aWithdrawal: (v) => `3a withdrawal ${chfText(v)}`,
};

const label = (key: string, value: number) => (LABELS[key] ?? ((v) => `${key} ${v}`))(value);

function widgetName(change: WidgetChange): string {
  if (change.tool === "explainCompoundInterest") return "compound interest widget";
  if (change.tool === "calculateSavingsPlan") return "savings plan widget";
  return `what-if widget (${change.variant ?? "scenario"})`;
}

const PATH_NAMES: Record<PersonalPath, string> = {
  "assets.liquid": "savings today",
  monthlySavings: "what they can put aside per month",
  "pillar3a.balance": "3a balance",
  "pillar3a.annualContribution": "3a contribution per year",
};

function candidateText(c: SaveCandidate): string {
  const stored = c.stored === null ? "not in the profile" : `profile: ${chfText(c.stored)}`;
  return `${chfText(c.value)} as ${PATH_NAMES[c.path]} (${c.path}; ${stored})`;
}

/** The hidden note added after the customer's message (English, like all notes to the model). */
export function widgetChangeNote(change: WidgetChange): string {
  const all = Object.entries(change.values)
    .map(([key, value]) => label(key, value))
    .join(", ");
  const changed = change.changed.join(", ");
  const parts = [
    `[Note from the chat system, not from the customer: before this message the customer set the ${widgetName(change)} to ${all} (changed: ${changed}).`,
  ];
  if (change.tool === "simulateScenario") {
    parts.push("This is a what-if: never offer to save these values.");
  } else if (change.candidates.length > 0) {
    parts.push(
      `These may be their own figures: ${change.candidates.map(candidateText).join("; ")}. Unless their message shows it is only an experiment, ask once, plainly, whether these are their real figures and should be noted (quick replies yes/no); call updateProfile only after a yes, never on your own.`,
    );
  } else {
    parts.push("Nothing to save: do not ask about storing these values.");
  }
  return `${parts.join(" ")}]`;
}

/**
 * A tool output as the model reads it: the widget state stays out, because the model hears
 * about the customer's changes once, in the note after the message that followed them.
 */
export function withoutCustomerInputs(output: object): Record<string, unknown> {
  const { customerInputs: _hidden, ...rest } = output as Record<string, unknown>;
  return rest;
}

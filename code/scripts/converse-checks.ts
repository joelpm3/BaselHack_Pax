/**
 * Heuristic flags for one advisor turn of scripts/converse.ts. They point a human reviewer at
 * likely problems; they are not a test oracle (read the transcript).
 */

export interface ToolCall {
  name: string;
  input: unknown;
  output: unknown;
  error: string | null;
}

export interface TurnView {
  customer: string;
  /** Text parts in order. */
  texts: string[];
  tools: ToolCall[];
  /** The options the chat shows (last suggestReplies call). */
  quickReplies: string[];
  /** The customer wrote with du/tu/tu/you-informal at some point. */
  customerUsesInformal: boolean;
  /** The analysis tools ran in this conversation before or in this turn. */
  analysisShown: boolean;
  /** The advisor already asked about existing insurance before this turn. */
  insuranceAsked: boolean;
}

const ANALYSIS = ["showRiskAnalysis", "showPensionOverview"];
const INSURANCE_WORDS =
  /versicher|police|assurance|assicura|insurance|policy|todesfall|erwerbsunfähig|invalidit|décès|decesso/i;

export function asksAboutInsurance(text: string): boolean {
  return INSURANCE_WORDS.test(text) && text.includes("?");
}

function questionCount(text: string): number {
  // Count sentences ending in "?" (ignore quoted examples).
  return (text.replace(/«[^»]*»|"[^"]*"|„[^“]*“/g, "").match(/\?/g) ?? []).length;
}

export function flagsFor(turn: TurnView): string[] {
  const flags: string[] = [];
  const text = turn.texts.join("\n").trim();
  if (!text) flags.push("NO_TEXT: the advisor wrote no reply text");
  const suggestCalls = turn.tools.filter((t) => t.name === "suggestReplies").length;
  if (suggestCalls > 1) flags.push(`DOUBLE_REPLIES: suggestReplies called ${suggestCalls} times`);
  if (questionCount(text) > 1) flags.push(`MULTI_QUESTION: ${questionCount(text)} question marks`);
  if (
    /(^|[\n.!?]\s*|\b(Danke|Merci|Grazie|Thanks?|Hallo|Grüezi|Guten Tag|Bonjour|Buongiorno),?\s+)(Herr|Frau|Monsieur|Madame|Signor|Signora)\s*[.,!?:;]/.test(
      text,
    )
  )
    flags.push("BARE_TITLE: Herr/Frau without a surname");
  if (/^(Danke|Merci|Grazie|Thank)/i.test(text)) flags.push("THANKS_OPENING (watch repetition)");
  // Formal pronouns mid-sentence (a sentence-initial "Sie" may mean "she/it").
  const formal = /(?<![.!?:]\s|^|\n)\bSie\b|\b(Ihnen|Ihrer?|Ihre[mns]?|vous|Lei)\b/;
  if (turn.customerUsesInformal && formal.test(text))
    flags.push("FORMALITY: customer uses du/tu, advisor uses Sie/vous/Lei");
  const lastText = turn.texts.at(-1)?.trim() ?? "";
  if (lastText.endsWith("?") && turn.quickReplies.length === 0)
    flags.push("NO_QUICK_REPLIES after a question (fine for open/numeric questions)");
  const aboutPartner =
    /(Ihre[rs]? (Partnerin|Partner|Frau|Mann|Ehefrau|Ehemann)|deine[rs]? (Partnerin|Partner|Frau|Mann)|votre (conjoint|mari|femme|partenaire)|Suo (marito|moglie)|Sua moglie|your (partner|wife|husband))/i.test(
      lastText,
    );
  if (aboutPartner && turn.quickReplies.some((r) => /^(Ich bin|Je suis|Sono|I am|I'm)\b/i.test(r)))
    flags.push("REPLY_VIEWPOINT: question about the partner, replies start with 'Ich bin'");
  for (const tool of turn.tools) {
    if (tool.error) flags.push(`TOOL_ERROR ${tool.name}: ${tool.error.slice(0, 120)}`);
    const status = (tool.output as { status?: string } | null)?.status;
    if (status && !["ok"].includes(status)) flags.push(`TOOL_STATUS ${tool.name}: ${status}`);
    if (ANALYSIS.includes(tool.name) && !turn.insuranceAsked && status === "ok")
      flags.push(`EARLY_ANALYSIS: ${tool.name} before existing insurance was asked`);
  }
  if (/CHF\s?[\d']+/.test(text) && !turn.analysisShown && !turn.tools.length)
    flags.push("NUMBER_WITHOUT_TOOL: CHF figure without any tool result yet (check source)");
  return flags;
}

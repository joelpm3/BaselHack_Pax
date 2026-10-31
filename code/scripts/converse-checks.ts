import { isDangling } from "@/lib/advisor/message-shape";

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
  /** The advisor explained the kind of solution and its trade-off before or in this turn. */
  optionsExplained: boolean;
}

const ANALYSIS = ["showRiskAnalysis", "showPensionOverview"];
const INSURANCE_WORDS =
  /versicher|police|assurance|assicura|insurance|policy|todesfall|erwerbsunfähig|invalidit|décès|decesso/i;

/** Text that compares kinds of solutions (bank vs insurance 3a, guarantee vs return, flexibility). */
const COMPARISON =
  /(bank|konto|compte|conto)[^.?!]{0,160}(versicherung|police|assurance|assicurazion|insurance)|(versicherung|police|assurance|assicurazion|insurance)[^.?!]{0,160}(bank|konto|compte|conto)|garant\w*[^.?!]{0,160}(rendite|schwank|rendement|rendimento|return)|(flexibel|aussetzen|flexible|pause)[^.?!]{0,160}(verpflicht|gebunden|fest|engag|vincol|commit)|alternative\w*\s+(ist|wäre|sind|wären|is|are|would)\b|selbst (zu )?tragen|vorerst nichts|nichts (zu )?tun|reine Risiko/i;

export function explainsOptions(text: string): boolean {
  return COMPARISON.test(text);
}

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
  if (text && isDangling(lastText))
    flags.push(`DANGLING_ENDING: «…${lastText.slice(-70).replace(/\s+/g, " ")}»`);
  const raw = rawQuickReplies(turn.tools);
  if (raw.length && !lastText.includes("?"))
    flags.push(
      `UNMATCHED_QUICK_REPLIES: replies ${raw.map((r) => `[${r}]`).join(" ")} without a question in the final text${turn.quickReplies.length ? "" : " (hidden by the chat)"}`,
    );
  if (turn.tools.some((t) => t.name === "recommendProducts") && !turn.optionsExplained)
    flags.push("PRODUCT_WITHOUT_EXPLANATION: recommendProducts before any comparison of options");
  const claim = claimedAction(text, turn.tools);
  if (claim) flags.push(`CLAIMED_ACTION: «${claim}» without a tool that did it`);
  return flags;
}

/** The options of the last suggestReplies call, whether or not the chat shows them. */
function rawQuickReplies(tools: ToolCall[]): string[] {
  const options = (
    tools.filter((t) => t.name === "suggestReplies").at(-1)?.output as {
      options?: unknown;
    } | null
  )?.options;
  return Array.isArray(options) ? options.map(String) : [];
}

const CLAIM =
  /[^.!?\n]*\b(ergänzt|nachgetragen|hinzugefügt|weitergeleitet|weitergegeben|mitgegeben|geschickt|gesendet|gebucht|ajouté|transmis|envoyé|aggiunto|inoltrato|inviato|added|forwarded|passed on|sent)\b[^.!?\n]*\b(Auftrag|Berater\w*|Rückruf|Übergabe|E-?Mail|Termin|conseill\w*|rappel|demande|consulente|richiesta|advisor|callback|request|e-?mail)\b[^.!?\n]*|[^.!?\n]*\b(Auftrag|Berater\w*|Rückruf|Übergabe|E-?Mail|Termin|conseill\w*|rappel|consulente|advisor|callback)\b[^.!?\n]*\b(ergänzt|nachgetragen|hinzugefügt|weitergeleitet|weitergegeben|mitgegeben|geschickt|gesendet|gebucht|ajouté|transmis|envoyé|aggiunto|inoltrato|inviato|added|forwarded|passed on|sent)\b[^.!?\n]*/i;
const ACTION_TOOLS = ["requestHandover", "prepareOffer"];

/** A sentence saying something was added, sent or booked for a person, with no such tool call. */
function claimedAction(text: string, tools: ToolCall[]): string | null {
  if (tools.some((t) => ACTION_TOOLS.includes(t.name))) return null;
  const match = text.match(CLAIM)?.[0]?.trim();
  return match ? match.slice(0, 140) : null;
}

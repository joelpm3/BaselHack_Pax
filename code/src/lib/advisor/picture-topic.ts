/**
 * Which situation of the Vorsorgebild (pension, disability, death) an advisor message is about,
 * so the panel can show it while Clara talks about it. Deterministic and cheap: no model call.
 *
 * The LATEST signal in the message wins, read from the end: Clara's closing question is what the
 * customer is about to answer. A signal is either a sentence that names a situation (keywords in
 * German, French, Italian and English: Clara answers in the customer's language, not always the
 * interface's) or a tool whose widget shows one situation.
 */
import type { PictureKind, RiskAnalysisOutput, ScenarioKind, ScenarioOutput } from "./types";

const START = String.raw`(?<!\p{L})`;
const END = String.raw`(?!\p{L})`;

interface Cue {
  pattern: RegExp;
  /** A weak cue (e.g. "Ihre Partnerin absichern") only decides when nothing stronger is named. */
  weight: number;
}

function cue(source: string, weight = 2, flags = "giu"): Cue {
  return { pattern: new RegExp(source, flags), weight };
}

/**
 * Word stems per situation. Words that mean something else in another language are left out
 * ("die", "dies"; "AI" only in its French and Italian forms) or tied to their acronym case.
 */
const CUES: Record<PictureKind, Cue[]> = {
  retirement: [
    cue(
      [
        // de
        "pensionier",
        "frühpension",
        "ruhestand",
        "altersrente",
        "rentenalter",
        "pensionsalter",
        "altersvorsorge",
        `${START}im alter${END}`,
        // fr
        `${START}retraite`,
        `${START}vieillesse`,
        // it
        "pensionament",
        "vecchiaia",
        `${START}in pensione${END}`,
        // en
        `${START}retire`,
        `${START}old age${END}`,
      ].join("|"),
    ),
    // German "die Pension" is retirement; English "pension" (fund) covers every situation.
    cue(String.raw`${START}Pension${END}(?!\s+fund)`, 2, "gu"),
  ],
  disability: [
    cue(
      [
        // de (Invalidität, Invalidenrente, invalid)
        "invalid",
        "erwerbsunfähig",
        "arbeitsunfähig",
        "erwerbsausfall",
        "lohnausfall",
        "einkommensausfall",
        "nicht mehr arbeiten",
        // fr
        "invalidité",
        `${START}incapacité`,
        "plus travailler",
        "perte de gain",
        // it
        "invalidità",
        `${START}incapacità`,
        "più lavorare",
        "perdita di guadagno",
        // en
        `${START}disabilit`,
        `${START}disabled${END}`,
        "unable to work",
        `${START}can(?:no|')t work${END}`,
        `${START}incapacity`,
        "income protection",
      ].join("|"),
    ),
    // The acronyms only in capitals: "iv" and English "AI" (artificial intelligence) are not it,
    // nor "AHV/IV", the name of the first pillar.
    cue(String.raw`(?<!AHV\/)${START}IV${END}|(?:l['’]|rente\s+|rendita\s+)AI${END}`, 2, "gu"),
  ],
  death: [
    cue(
      [
        // de
        "todesfall",
        `${START}tod(?:es)?${END}`,
        `${START}(?:ver)?(?:sterben|stirbt|storben)`,
        `${START}ableben`,
        "hinterblieb",
        `${START}witwe`,
        `${START}waise`,
        "risikoleben",
        `${START}zust(?:ö|o)(?:ss|ß)(?:t|en)${END}`,
        // fr
        `${START}décès`,
        `${START}décéd`,
        `${START}mort(?:e|s)?${END}`,
        `${START}meurt${END}`,
        `${START}mourir${END}`,
        `${START}survivant`,
        `${START}veu(?:ve|f)`,
        `${START}orphelin`,
        // it
        `${START}decesso`,
        `${START}morire${END}`,
        `${START}muor`,
        `${START}superstit`,
        `${START}vedov`,
        `${START}orfan`,
        // en
        `${START}death`,
        // Only after an English subject: German "die" and "dies" are everyday words.
        `${START}(?:you|i|they|he|she|(?:your|their|my)\\s+(?:partner|spouse|wife|husband))\\s+(?:were\\s+to\\s+|should\\s+)?(?:die|dies|died)${END}`,
        `${START}pass(?:es|ed)?\\s+away${END}`,
        `${START}survivor`,
        `${START}widow`,
        `${START}orphan`,
      ].join("|"),
    ),
    // Protecting the partner is mostly about death, but also said about disability.
    cue(
      [
        String.raw`partner\p{L}*(?:\s+\p{L}+){0,3}?\s+(?:ab(?:zu)?sichern|abgesichert)`,
        String.raw`protéger\s+(?:votre|ton|ta|sa)\s+(?:partenaire|conjoint)`,
        String.raw`proteggere\s+(?:il|la|il\s+suo|la\s+sua|il\s+tuo|la\s+tua)\s+(?:partner|coniuge)`,
        String.raw`protect\s+(?:your|their)\s+(?:partner|spouse)`,
      ].join("|"),
      1,
    ),
  ],
};

const KINDS: PictureKind[] = ["retirement", "disability", "death"];

/** The situation one sentence is about: the highest score, a tie goes to the first named. */
function classifySentence(sentence: string): PictureKind | null {
  let best: { kind: PictureKind; score: number; first: number } | null = null;
  for (const kind of KINDS) {
    let score = 0;
    let first = Number.POSITIVE_INFINITY;
    for (const { pattern, weight } of CUES[kind]) {
      for (const match of sentence.matchAll(pattern)) {
        score += weight;
        first = Math.min(first, match.index);
      }
    }
    if (score === 0) continue;
    if (!best || score > best.score || (score === best.score && first < best.first)) {
      best = { kind, score, first };
    }
  }
  return best?.kind ?? null;
}

/** The situation a text is about: its last sentence that names one decides. */
export function classifyTopic(text: string): PictureKind | null {
  const sentences = text.split(/(?<=[.!?…:])\s+|\n+/u);
  for (let i = sentences.length - 1; i >= 0; i--) {
    const kind = classifySentence(sentences[i]);
    if (kind) return kind;
  }
  return null;
}

const RETIREMENT_SCENARIOS: ReadonlySet<ScenarioKind> = new Set([
  "early_retirement",
  "pillar3a",
  "home_purchase",
]);

/** Tools whose widget is about retirement whatever the result. */
const RETIREMENT_TOOLS: ReadonlySet<string> = new Set([
  "showPensionOverview",
  "calculateTaxSavings",
  "calculateCapitalPayoutTax",
]);

interface PartLike {
  type: string;
  state?: string;
  text?: string;
  input?: unknown;
  output?: unknown;
}

/** The risk widget shows both situations: the one with the larger gap leads. */
function riskFocus(output: RiskAnalysisOutput | undefined): PictureKind | null {
  if (output?.status !== "ok") return null;
  const gaps = { disability: 0, death: 0 };
  for (const person of output.persons) {
    for (const scenario of person.scenarios) {
      gaps[scenario.event] = Math.max(gaps[scenario.event], scenario.breakdown.gap);
    }
  }
  return gaps.death > gaps.disability ? "death" : "disability";
}

/** A what-if: retiring, saving or buying a home is about retirement; a child about its risks. */
function scenarioFocus(part: PartLike): PictureKind | null {
  const scenario = (part.input as { scenario?: ScenarioKind } | undefined)?.scenario;
  if (!scenario) return null;
  if (RETIREMENT_SCENARIOS.has(scenario)) return "retirement";
  const output = part.output as ScenarioOutput | undefined;
  if (part.state !== "output-available" || output?.status !== "ok") return null;
  let best: { kind: PictureKind; change: number } | null = null;
  for (const c of output.comparisons) {
    const change = c.after.gap - c.before.gap;
    if (change > 0 && (!best || change > best.change)) best = { kind: c.kind, change };
  }
  return best?.kind ?? null;
}

function toolFocus(part: PartLike): PictureKind | null {
  const name = part.type.slice("tool-".length);
  if (RETIREMENT_TOOLS.has(name)) return "retirement";
  if (name === "showRiskAnalysis" && part.state === "output-available") {
    return riskFocus(part.output as RiskAnalysisOutput | undefined);
  }
  if (name === "simulateScenario") return scenarioFocus(part);
  return null;
}

/** The situation an advisor message is about, or null when it names none. */
export function topicOfMessage(parts: readonly PartLike[]): PictureKind | null {
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    const kind =
      part.type === "text"
        ? classifyTopic(part.text ?? "")
        : part.type.startsWith("tool-")
          ? toolFocus(part)
          : null;
    if (kind) return kind;
  }
  return null;
}

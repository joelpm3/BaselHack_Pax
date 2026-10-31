import type { WidgetInputTool } from "@/lib/advisor/widget-inputs";
import type { Locale } from "@/lib/domain/taxonomy";
import { PERSONA_SCENARIOS } from "./persona-scenarios";

/**
 * Example conversations for scripts/converse.ts. Each scenario is a simulated customer
 * (persona) plus a script of beats: a string is sent verbatim, `{ intent }` lets the simulated
 * customer phrase that beat itself (it may tap a quick reply when one fits). After the script
 * the customer continues on its own until `maxTurns` or until it says goodbye.
 */

/**
 * Before the message: the customer sets values in the latest widget of `tool` (merged into what
 * it shows), as the widget's server action would store them.
 */
export interface WidgetMove {
  tool: WidgetInputTool;
  values: Record<string, number>;
}

export type Beat =
  | string
  | { say: string; voice?: boolean; widget?: WidgetMove }
  | { intent: string; voice?: boolean; widget?: WidgetMove };

export interface Scenario {
  id: string;
  title: string;
  locale: Locale;
  /** Seeded demo client to copy (profile + policies); otherwise a new anonymous customer. */
  demoClient?: string;
  /** Profile of an anonymous returning visitor (facts from an earlier conversation). */
  knownProfile?: Record<string, unknown>;
  /** Facts and behaviour of the simulated customer (English is fine; it writes in `locale`). */
  persona: string;
  script: Beat[];
  maxTurns: number;
}

const VOICE =
  "You often dictate by voice: long run-on sentences, little punctuation, filler words (also, äh, halt), occasionally a Swiss German word (gäll, Znacht, öppe, mini Frau).";

export const SCENARIOS: Scenario[] = [
  {
    id: "user-test",
    title: "User test 31.10.: employed man, partner, detour to compound interest",
    locale: "de",
    persona: `Man, born 1990, employed full time at CHF 95'000 gross per year, lives in 8165 Oberweningen (ZH) with his partner (not married), no children. Partner: woman, born 1993, works full time, CHF 80'000. Both already have a term life insurance (Todesfallrisikoversicherung) at AXA, CHF 200'000 each, and he has a disability income insurance (Erwerbsunfähigkeitsrente) of CHF 24'000 per year through Swiss Life. Savings about CHF 40'000, spends about CHF 6'000 a month as a household. Pays CHF 7'258 into 3a each year. Writes short, casual messages, uses Sie.`,
    script: [
      "hallo ich möchte für die rente sparen",
      "Ich arbeite angestellt",
      "was ist der zinseszins",
      "Ich lebe mit meiner Partnerin",
      { intent: "Answer the advisor's question (tap a quick reply if one fits)." },
      { intent: "Answer the advisor's question (tap a quick reply if one fits)." },
      "Ich wohne in 8165",
      {
        intent:
          "Answer; if asked about your partner's work, say she works full time. Mention that you both already have a term life insurance.",
      },
    ],
    maxTurns: 12,
  },
  {
    id: "voice-multi-fact",
    title: "Voice first message with several facts, du, 3a contribution",
    locale: "de",
    persona: `Man, born 1995, married, wife born 1996 (works 80%, CHF 70'000), employed as a logistics planner, CHF 88'000 gross, lives in 3011 Bern, no children yet but planning one in two years. Pays CHF 3'000 per year into 3a. No private life insurance. ${VOICE} Uses du.`,
    script: [
      {
        say: "Also ich bin 31, ich habe eine Frau, ich zahle maximal 3000 Franken in die Säule 3a ein. Was brauchst du sonst noch für Informationen?",
        voice: true,
      },
      {
        intent: "Answer the advisor's question in a long voice-style run-on message.",
        voice: true,
      },
      { intent: "Answer the advisor's question.", voice: true },
    ],
    maxTurns: 8,
  },
  {
    id: "returning-voice",
    title: "Live bug 31.10.: returning visitor dictates age (contradicting), wife and 3a, du",
    locale: "de",
    knownProfile: {
      person: {
        birthYear: 1996,
        sex: "male",
        maritalStatus: "married",
        employment: "employed",
        grossIncome: 80000,
      },
      partner: {
        birthYear: 1996,
        sex: "female",
        maritalStatus: "married",
        employment: "employed",
        grossIncome: 75000,
      },
      residence: { zip: "8165", city: "Oberweningen", canton: "ZH", taxLocationId: 816500003 },
    },
    persona: `Man, born 1995 (31), married, wife born 1996 works full time CHF 75'000, he earns CHF 80'000, lives in 8165. Pays CHF 3'000 per year into 3a. No private life insurance. Savings CHF 30'000. ${VOICE} Uses du.`,
    script: [
      {
        say: "Also ich bin 31, ich habe eine Frau, ich zahle maximal 3000 Franken in die Säule 3a ein. Was brauchst du sonst noch für Informationen?",
        voice: true,
      },
      { intent: "Answer the advisor's question.", voice: true },
    ],
    maxTurns: 6,
  },
  {
    id: "swiss-runon",
    title: "Voice run-on in Swiss German flavour, many facts at once, then impatient for numbers",
    locale: "de",
    persona: `Woman, born 1983, works 70% as a pharmacy assistant, CHF 58'000, lives with her boyfriend (not married) in 5000 Aarau, boyfriend born 1980, self-employed electrician, CHF 95'000, no pension fund. One child together born 2017. She has a 3a account with CHF 22'000. Her boyfriend has a term life insurance at Helvetia of CHF 300'000 for her benefit. ${VOICE}`,
    script: [
      {
        say: "grüezi also ich bin d sandra ich bin 43 schaffe 70 prozent in einer apotheke und verdiene so öppe 58000 im jahr mein freund ist selbständig elektriker und hat keine pensionskasse wir sind nicht verheiratet und haben eine tochter die ist 2017 geboren und wir wohnen in aarau ich mache mir halt sorgen was passiert wenn ihm was passiert",
        voice: true,
      },
      { intent: "Answer the advisor's question.", voice: true },
      {
        intent:
          "Say impatiently that you just want to see the numbers now, without more questions.",
        voice: true,
      },
      { intent: "Answer the advisor's question.", voice: true },
    ],
    maxTurns: 8,
  },
  {
    id: "student-3a",
    title: "Student with a 3rd pillar, earns ~CHF 2'000 per year",
    locale: "de",
    persona: `Woman, born 2003, studies at the University of Basel, lives in 4056 Basel, single, works a little in a café: about CHF 2'000 per year. Has a 3a account with CHF 3'500 and pays CHF 500 per year into it. Savings CHF 6'000. Wants to know whether the 3a makes sense for her. Writes short messages with typos, uses du.`,
    script: [
      "hoi, ich studier noch und hab schon ne säule 3a, macht das überhaupt sinn?",
      { intent: "Answer the advisor's question." },
    ],
    maxTurns: 8,
  },
  {
    id: "self-employed-parent",
    title: "Self-employed father of two",
    locale: "de",
    persona: `Man, born 1984, self-employed carpenter (own company, sole proprietorship), net income about CHF 110'000 per year, no pension fund, married, wife born 1986 works 40% as a teacher (CHF 45'000). Two children born 2016 and 2019. Lives in 6003 Luzern. 3a: CHF 25'000, pays irregularly. Savings CHF 60'000. No private disability insurance, he has an accident insurance via the company. Worried what happens to the family if he gets sick. Precise, uses Sie.`,
    script: [
      "Guten Tag. Ich bin selbständig und habe zwei Kinder. Was passiert, wenn ich krank werde?",
      { intent: "Answer the advisor's question." },
      { intent: "Answer the advisor's question." },
    ],
    maxTurns: 10,
  },
  {
    id: "existing-jane",
    title: "Existing Pax client Jane mentions a life change (going back to work)",
    locale: "de",
    demoClient: "Jane",
    persona: `You are Jane Müller, born 1986, married to May (born 1984, employed, CHF 100'000). Baby born 2026. You live in 4053 Basel. You will start working again at 60% from January as a nurse, about CHF 55'000 per year. You have a Pax death cover on May. Friendly, uses Sie.`,
    script: [
      "Hallo, ich fange im Januar wieder an zu arbeiten, 60 Prozent als Pflegefachfrau. Muss ich jetzt etwas anpassen?",
      { intent: "Answer the advisor's question." },
    ],
    maxTurns: 8,
  },
  {
    id: "fr-couple",
    title: "French-speaking couple in Lausanne",
    locale: "fr",
    persona: `Woman, born 1988, employed as an engineer, CHF 105'000, married, husband born 1987, employed, CHF 90'000. One child born 2021. Lives in 1003 Lausanne. Want to buy a flat in 3 years and wonder about using the pension fund. Savings CHF 120'000. Both have a pension fund. No private life insurance. Writes in French, uses vous.`,
    script: [
      "Bonjour, mon mari et moi aimerions acheter un appartement d'ici trois ans. Est-ce qu'on peut utiliser notre 2e pilier ?",
      { intent: "Answer the advisor's question." },
    ],
    maxTurns: 8,
  },
  {
    id: "corrections",
    title: "Customer corrects a swapped birth year and contradicts an earlier fact",
    locale: "de",
    persona: `Man, born 1990, employed, CHF 92'000, lives in 8400 Winterthur with his wife (married), wife born 1994, works 60%, CHF 50'000. No children. Uses Sie, short messages.`,
    script: [
      "Grüezi, ich bin verheiratet und möchte wissen, ob wir gut abgesichert sind.",
      { intent: "Answer the advisor's question." },
      "1994",
      "nein sorry, ich bin 1990 geboren, nicht sie. sie ist 1994",
      {
        intent:
          "Answer the question, then add that you were wrong earlier: you are actually not married but live together (Konkubinat).",
      },
    ],
    maxTurns: 9,
  },
  {
    id: "short-and-refusing",
    title: "Very short answers, 'weiss nicht', refuses to give income",
    locale: "de",
    persona: `Woman, born 1979, employed as a clerk, does not want to say her income (if pressed twice, says 'so um die 6000 im Monat'). Divorced, one child born 2010 living with her. Lives in 9000 St. Gallen. Does not know anything about her pension fund. Answers very briefly: 'ja', 'nein', 'weiss nicht', 'sag ich nicht'. Uses Sie.`,
    script: [
      "ich will wissen ob ich genug habe für die pension",
      "ja",
      "weiss nicht",
      { intent: "Refuse to give your income: 'das sag ich nicht so gern'." },
      { intent: "Answer briefly." },
    ],
    maxTurns: 9,
  },
  {
    id: "it-offtopic",
    title: "Italian speaker, off-topic questions",
    locale: "it",
    persona: `Man, born 1972, employed in a bank in Lugano (6900), CHF 130'000, married, wife born 1975, homemaker. Two children born 2005 and 2008 (the elder studies until 2029). Has 3a with CHF 80'000. Asks off-topic questions now and then (the weather, whether Pax sells car insurance, what the advisor thinks of crypto). Writes in Italian, uses Lei.`,
    script: [
      "Buongiorno, vorrei capire se posso andare in pensione a 62 anni.",
      "Ma voi vendete anche assicurazioni auto?",
      { intent: "Answer the advisor's question." },
      { intent: "Ask what the advisor thinks about investing in Bitcoin for retirement." },
    ],
    maxTurns: 8,
  },
  {
    id: "en-expat",
    title: "English-speaking expat, mixes in German words",
    locale: "en",
    persona: `Woman, born 1987, from the UK, moved to Zürich (8004) in 2019, employed at CHF 140'000, single, no children. Pension fund through employer. Missing AHV years before 2019. Wants to know about gaps. Uses casual English with the odd German word (Pensionskasse, Säule 3a).`,
    script: [
      "hi, I moved here from the UK in 2019 - do I have gaps in my AHV or Pensionskasse?",
      { intent: "Answer the advisor's question." },
    ],
    maxTurns: 8,
  },
  // Widget inputs reach the advisor (ask first, pre-fill, ask before saving slider values).
  {
    id: "widget-figures-first",
    title: "Concept question: one sentence, asks for figures, then a pre-filled widget",
    locale: "de",
    persona: `Woman, born 1992, employed, lives in 8004 Zürich. Has about CHF 20'000 in a savings account and can put aside about CHF 500 a month. Curious, short messages, uses Sie.`,
    script: [
      "Was ist eigentlich der Zinseszins?",
      "Ich habe etwa 20'000 gespart und kann so 500 im Monat zur Seite legen.",
    ],
    maxTurns: 2,
  },
  {
    id: "widget-sliders-save",
    title: "Customer moves the compound-interest sliders: advisor asks before saving",
    locale: "de",
    knownProfile: {
      person: { birthYear: 1988, employment: "employed", grossIncome: 90000 },
      assets: { liquid: 15000 },
    },
    persona: `Man, born 1988, employed, CHF 90'000. Has CHF 30'000 in savings now (more than he said last time) and can put aside CHF 400 a month. Short messages, uses Sie.`,
    script: [
      "Zeigen Sie mir doch mit einem Beispiel, wie der Zinseszins funktioniert.",
      {
        say: "Ok, so sieht das bei mir aus.",
        widget: {
          tool: "explainCompoundInterest",
          values: { startAmount: 30000, monthlySaving: 400 },
        },
      },
      { intent: "Say yes, these are your real figures." },
    ],
    maxTurns: 3,
  },
  {
    id: "widget-what-if",
    title: "Hypothetical what-if amount: widget with it, no question about saving it",
    locale: "de",
    knownProfile: {
      person: { birthYear: 1985, employment: "employed", grossIncome: 85000 },
      assets: { liquid: 20000 },
      monthlySavings: 300,
    },
    persona: `Woman, born 1985, employed, CHF 85'000, savings CHF 20'000, puts aside CHF 300 a month. Wonders what more saving would do. Uses Sie.`,
    script: [
      "Was wäre, wenn ich 1'000 Franken im Monat sparen würde statt 300? Wie viel hätte ich in 20 Jahren?",
      { intent: "React briefly to the answer." },
    ],
    maxTurns: 2,
  },
  {
    id: "cancelled-insurance-3a",
    title:
      "Live case 31.10.: German writer in an English conversation, insurance 3a cancelled, new 3a from 2027",
    locale: "en",
    persona: `Man, born 1991, single, no children, cashier at Coop, CHF 65'000 gross, lives in Basel (Gundeli). Has an insurance-based 3a from an old broker: mostly risk, very little savings, insurer unknown, pays the 3a maximum. Cancelled it as of the end of 2026; the 2026 premium is paid. Wants a new, fully invested 3a with the maximum from 1 January 2027 and wants to sign today. Writes German, uses du.`,
    script: [
      "Ich bin 35, ein Mann, Single, keine Kinder. Ich arbeite bei Coop an der Kasse und verdiene 65'000 Franken im Jahr. Ich wohne in Basel im Gundeli. Ich habe eine 3a-Versicherung über einen alten Berater, da ist viel Risiko drin und ganz wenig Sparanteil. Ich zahle den Maximalbeitrag ein, bei welcher Versicherung das ist, weiss ich nicht. Kann ich mich früh pensionieren?",
      "Auf dem Sparkonto habe ich 2000 Franken, ich gebe etwa 3500 im Monat aus. Andere Versicherungen habe ich keine.",
      "Die 3a-Versicherung habe ich auf Ende Jahr gekündigt, die Prämie für 2026 ist schon bezahlt. Was bleibt mir mit 65?",
      "Ich möchte ab 1. Januar 2027 eine neue 3a mit dem Maximalbeitrag, voll in Aktien investiert und mit wenig Risiko. Können wir das heute abschliessen?",
      "Ja, ich möchte die Offerte.",
    ],
    maxTurns: 5,
  },
  // The pitch personas (documentation/DEMO_PERSONAS.md).
  ...PERSONA_SCENARIOS,
];

export function scenarioById(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

import type { Locale } from "@/lib/domain/taxonomy";

/**
 * Example conversations for scripts/converse.ts. Each scenario is a simulated customer
 * (persona) plus a script of beats: a string is sent verbatim, `{ intent }` lets the simulated
 * customer phrase that beat itself (it may tap a quick reply when one fits). After the script
 * the customer continues on its own until `maxTurns` or until it says goodbye.
 */

export type Beat = string | { say: string; voice?: boolean } | { intent: string; voice?: boolean };

export interface Scenario {
  id: string;
  title: string;
  locale: Locale;
  /** Seeded demo client to copy (profile + policies); otherwise a new anonymous customer. */
  demoClient?: "Jane" | "Lily" | "Taylor";
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
      { intent: "Answer the advisor's question." },
      {
        intent:
          "If the advisor has noted any birth year, correct it: 'nein, ich bin 1990 geboren, nicht sie, sie ist 1994'. Otherwise give both birth years in that wording.",
      },
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
];

export function scenarioById(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

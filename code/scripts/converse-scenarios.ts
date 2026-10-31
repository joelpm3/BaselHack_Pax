import type { WidgetInputTool } from "@/lib/advisor/widget-inputs";
import type { Locale } from "@/lib/domain/taxonomy";
import { type CardCustomer, DEFAULT_SUITABILITY } from "./converse-cards";
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
  /** How the customer acts in the suitability and offer cards (harness signs when set). */
  card?: CardCustomer;
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
  {
    id: "case-140bc36e",
    title: "Live case: single cashier leaves an insurance 3a, wants a fully invested 3a today",
    locale: "de",
    persona: `Man, born 1991 (35), single, no children, cashier at Coop, CHF 65'000 per year, lives in Basel (4053, Gundeli). Has a pension fund through Coop but no certificate at hand. Had an insurance 3a (other insurer, name unknown) where he pays the maximum but almost nothing is saved; he already cancelled it for the end of the year and paid 2026 in full. Savings CHF 2'000, spends about CHF 3'500 a month. Wanted to know about early retirement. With "ganz wenig Risiko" he means little insurance cover (he needs no death cover); he is fine with market ups and downs over 30 years. Beginner: uses everyday words. ${VOICE} Uses du.`,
    script: [
      {
        say: "Ich bin 35 Jahre alt, ich bin Single. Ich arbeite bei Coop an der Kasse. Ich bekomme 65'000 Franken Lohn im Jahr. Ich hatte eine 3-A-Versicherung. Über meinen alten Versicherungsberater. Dort habe ich sehr viel Risiko. Ich habe ganz wenig Sparanteil. Ich habe keine Kinder, keine Frau. Ich überlege mir, ob ich früh pensionieren kann. Was denkst du?",
        voice: true,
      },
      { say: "Weiss ich noch nicht", voice: true },
      { intent: "Answer the advisor's question (Basel, Gundeli; you are a man).", voice: true },
      {
        intent:
          "Answer; you have no documents. Say you pay the maximum into the insurance 3a but almost nothing is saved.",
        voice: true,
      },
      { intent: "Answer the advisor's question.", voice: true },
      {
        say: "Wenn ich jetzt hier theoretisch in 3A wechseln würde und in den nächsten Jahren voll investieren würde, in Aktien oder so, was könnte ich hier rausholen?",
        voice: true,
      },
      {
        say: "Keine Ahnung, aber ich habe das jetzt gekündigt auf Ende Jahr. Ich möchte jetzt eigentlich neu drei A machen, mit voll investieren und ganz wenig Risiko. Können wir das heute abschliessen?",
        voice: true,
      },
      { intent: "Answer the advisor's question.", voice: true },
      { say: "Okay, ich möchte das jetzt abschliessen.", voice: true },
    ],
    maxTurns: 10,
  },
  {
    id: "product-choice-expert",
    title: "Expert customer chooses a 3a solution (bank vs insurance, guarantee vs return)",
    locale: "de",
    persona: `Woman, born 1984, financial controller, CHF 120'000 per year, married, husband born 1982 (CHF 95'000), two children (2014, 2017), lives in 6300 Zug. Has a pension fund; knows her Umwandlungssatz (5.4% overmandatory), possible Einkauf of CHF 60'000. No 3a yet, no private life insurance. Wants to start a 3a and wonders whether a bank 3a or an insurance 3a with disability cover is better. Expert: uses technical terms, dislikes basic explanations. Uses Sie, precise short messages.`,
    script: [
      "Ich möchte mit der Säule 3a starten, Maximalbetrag. Bank-3a mit Fonds oder 3a-Versicherung mit Prämienbefreiung: was spricht wofür? Einen Einkauf in die PK von rund 60'000 prüfe ich parallel, Umwandlungssatz im Überobligatorium 5,4 %.",
      { intent: "Answer the advisor's question briefly and precisely." },
      { intent: "Answer; say you want it 'sicher, aber mit Rendite'." },
      { intent: "Ask which option the advisor recommends for you, and ask to see it." },
      { intent: "Answer the advisor's question." },
    ],
    maxTurns: 7,
  },
  // The challenge's official personas (documentation/challenge_context/material/text/personas.txt) as NEW
  // customers: the full journey from getting to know them to a signed policy.
  {
    id: "jury-young-family",
    title: "Jury persona: Jane Müller, young family, new customer, full journey to signing",
    locale: "de",
    persona: `You are Jane Müller, born 01.06.1986, married to May Müller (born 16.09.1984). You live in 4053 Basel. You do not work since the baby was born; your baby is 5 months old (born May 2026). May works 100% as an employee, CHF 100'000 gross per year, with a pension fund (figures unknown, no certificate at hand). Savings CHF 20'000. No 3a, no private life insurance. You worry what happens to you and the baby if May dies or cannot work. Beginner: everyday words. Uses Sie. When the advisor recommends something that fits, you want an offer and sign it in the card. May does not smoke.`,
    script: [
      "Grüezi. Wir haben vor fünf Monaten ein Baby bekommen und ich arbeite im Moment nicht. Mein Mann verdient allein. Ich frage mich, was passiert, wenn ihm etwas zustösst.",
      { intent: "Answer the advisor's question." },
      { intent: "Answer the advisor's question." },
      { intent: "Answer the advisor's question." },
      { intent: "Answer the advisor's question." },
      { intent: "Answer the advisor's question." },
      { intent: "Answer; if a solution was shown, say you would like to see an offer." },
      { intent: "Answer the advisor's question; go ahead with the offer if it fits." },
    ],
    card: {
      contact: {
        firstName: "Jane",
        lastName: "Müller",
        birthDate: "1986-06-01",
        email: "jane.mueller@example.ch",
        phone: "+41 79 000 00 11",
      },
      smoker: false,
      suitability: { ...DEFAULT_SUITABILITY, netIncome: "75k_150k", netAssets: "10k_50k" },
    },
    maxTurns: 14,
  },
  {
    id: "jury-affluent-couple",
    title: "Jury persona: Lily Smith, affluent couple, new customer, full journey to signing",
    locale: "de",
    persona: `You are Lily Smith, born 08.08.1976, married to Wilson Smith (born 16.09.1967). You live in 4125 Riehen. Wilson works 100% as an employee, CHF 200'000 gross per year; you work 80%, CHF 80'000 gross. Both have a pension fund (no certificates at hand). Assets CHF 500'000 (savings and securities). You both pay the 3a maximum at a bank. No private life insurance. Wilson retires in a few years; you wonder about lump sum vs pension, a pension-fund buy-in and how to invest part of the savings for retirement income. Informed: you know the basic terms. Uses Sie. When a recommendation fits, you want an offer and complete what the card asks.`,
    script: [
      "Guten Tag. Mein Mann wird in ein paar Jahren pensioniert, ich arbeite noch länger. Wir haben einiges gespart und möchten wissen, wie wir das für die Pension am besten aufstellen.",
      { intent: "Answer the advisor's question." },
      { intent: "Answer the advisor's question." },
      { intent: "Answer the advisor's question." },
      { intent: "Answer the advisor's question." },
      { intent: "Answer the advisor's question." },
      { intent: "Ask which solution the advisor recommends for investing part of the savings." },
      { intent: "Answer; go ahead with the recommended solution if it fits." },
    ],
    card: {
      contact: {
        firstName: "Lily",
        lastName: "Smith",
        birthDate: "1976-08-08",
        email: "lily.smith@example.ch",
        phone: "+41 79 000 00 12",
      },
      smoker: false,
      suitability: {
        annualPremium: null,
        singlePremium: 100000,
        netIncome: "150k_250k",
        netAssets: "gt300k",
        savingCapacity: "gt7k",
        oneOffCapacity: "gt300k",
        goal: "moderate_gains",
        horizon: "10_15",
        knowledge: "experience",
        drawdown: "hold",
        guaranteedSharePercent: 0,
      },
    },
    maxTurns: 14,
  },
  {
    id: "jury-single-professional",
    title: "Jury persona: Taylor Johnson, single professional, new customer, full journey",
    locale: "de",
    persona: `You are Taylor Johnson, a man, born 16.09.1995, single, no children, live in 8004 Zürich. You work 90% as an employee, CHF 100'000 gross per year, with a pension fund (no certificate at hand). Assets CHF 500'000 (inheritance, mostly on a savings account). No 3a yet, no private life insurance. You want to know how to use the money sensibly for your retirement and maybe a flat later, and whether you need any insurance at all. Informed, likes numbers. Uses Sie. When a recommendation fits, you want an offer and complete what the card asks.`,
    script: [
      "Hallo. Ich bin 31, Single, arbeite 90 Prozent und habe ziemlich viel Geld auf dem Sparkonto, rund 500'000 Franken. Was sollte ich für meine Vorsorge damit machen?",
      { intent: "Answer the advisor's question." },
      { intent: "Answer the advisor's question." },
      { intent: "Answer the advisor's question." },
      { intent: "Answer the advisor's question." },
      { intent: "Answer the advisor's question." },
      { intent: "Ask which solution the advisor recommends and whether you can start it now." },
      { intent: "Answer; go ahead with the recommended solution if it fits." },
    ],
    card: {
      contact: {
        firstName: "Taylor",
        lastName: "Johnson",
        birthDate: "1995-09-16",
        email: "taylor.johnson@example.ch",
        phone: "+41 79 000 00 13",
      },
      smoker: false,
      suitability: {
        ...DEFAULT_SUITABILITY,
        netAssets: "gt300k",
        oneOffCapacity: "gt300k",
        goal: "high_gains",
        knowledge: "experience",
        drawdown: "buy_more",
      },
    },
    maxTurns: 14,
  },
  ...PERSONA_SCENARIOS,
];

export function scenarioById(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

/**
 * Scripted chats for the pitch personas (documentation/DEMO_PERSONAS.md), in the scenario format
 * of the converse harness (`scripts/converse.ts`, which lists them with its own scenarios). Each
 * one starts as the seeded demo client of the same first name, so the advisor sees its CRM data.
 * Run them with e.g. `pnpm converse persona-student persona-8165`.
 */
import { DEMO_PERSONAS } from "@/lib/simulation/demo-personas";
import type { DemoPersonaKey, SimPersona } from "@/lib/simulation/personas";
import { personaFacts } from "@/lib/simulation/prompt";

export type PersonaBeat =
  | string
  | { say: string; voice?: boolean }
  | { intent: string; voice?: boolean };

export interface PersonaScenario {
  id: string;
  title: string;
  locale: SimPersona["locale"];
  /** First name of the seeded demo client to copy (profile and policies). */
  demoClient: string;
  persona: string;
  script: PersonaBeat[];
  maxTurns: number;
  /** What the advisor should do; checked by reading the transcript. */
  expect: string[];
  personaKey: DemoPersonaKey;
}

/** The simulated customer's brief: the shared facts plus the persona's story. */
export function personaBrief(p: SimPersona, currentYear: number): string {
  const story = p.story;
  if (!story) return personaFacts(p, currentYear);
  return [
    personaFacts(p, currentYear),
    story.backstory,
    `Goals: ${story.goals.join(" ")}`,
    `Worries: ${story.worries.join(" ")}`,
    `Style: ${story.speakingStyle}`,
    `Reveal: ${story.reveals.join(" ")}`,
  ].join("\n");
}

const ANSWER = { intent: "Answer the advisor's question (tap a quick reply if one fits)." };

function scenario(
  key: DemoPersonaKey,
  rest: Omit<PersonaScenario, "locale" | "demoClient" | "persona" | "personaKey">,
): PersonaScenario {
  const p = DEMO_PERSONAS[key];
  return {
    ...rest,
    personaKey: key,
    locale: p.locale,
    demoClient: p.firstName,
    persona: personaBrief(p, new Date().getFullYear()),
  };
}

export const PERSONA_SCENARIOS: PersonaScenario[] = [
  scenario("student_first_job", {
    id: "persona-student",
    title: "Lena: comes back after the follow-up e-mail about her first job",
    script: [
      "hoi, hab eure mail bekommen. ich fang bald 100% bei ingenieurbüro muster ag an, 82'000. was soll ich jetzt machen?",
      ANSWER,
      "lohnt sich die 3a überhaupt so früh? was bringt der zinseszins?",
      ANSWER,
    ],
    maxTurns: 8,
    expect: [
      "Records the new job (employment, income 82'000, workload 100%) with updateProfile",
      "Mentions the pension fund and the 3a maximum for employees",
      "Shows the compound-interest explainer when asked about Zinseszins",
      "Uses du like the customer",
    ],
  }),
  scenario("cohabiting_wedding", {
    id: "persona-konkubinat",
    title: "Nora: cohabiting, wedding next summer, child later",
    script: [
      "Grüezi, mein Partner und ich heiraten in acht Monaten und möchten in etwa zwei Jahren ein Kind. Was ändert sich für unsere Absicherung?",
      ANSWER,
      "Und was wäre, wenn Luca vor der Hochzeit etwas passiert?",
      ANSWER,
    ],
    maxTurns: 9,
    expect: [
      "Explains that cohabiting partners get no AHV survivor's pension",
      "Runs the risk analysis with the partner and shows the death gap",
      "Classifier later stores two future events: wedding and child birth",
    ],
  }),
  scenario("self_employed_8165", {
    id: "persona-8165",
    title: "Andrin: voice messages, moved to 8165, self-employed without pension fund",
    script: [
      {
        say: "also mir sind jetzt umzogen äh die neue adresse ist 8165 und ich wollte nochmal schauen wegen der absicherung weil ich ja selbständig bin und keine pensionskasse habe und jetzt mit dem haus halt mehr schulden",
        voice: true,
      },
      {
        intent: "Answer; if the advisor offers several towns for 8165, pick Schöfflisdorf.",
        voice: true,
      },
      { ...ANSWER, voice: true },
      { ...ANSWER, voice: true },
    ],
    maxTurns: 9,
    expect: [
      "Asks which town of 8165 (Oberweningen, Schleinikon, Schöfflisdorf) and stores Schöfflisdorf",
      "Shows the disability and death gaps for a self-employed person without BVG",
      "Explains the 3a limit for self-employed people without a pension fund (20% of income)",
      "Offers a person (rule: self-employed). Known gap: it may open a second handover, the advisor does not see earlier handovers yet",
    ],
  }),
  scenario("pension_or_lump_sum", {
    id: "persona-rente-kapital",
    title: "Hans-Peter: staggered withdrawal of three 3a accounts and pension vs lump sum",
    script: [
      "Guten Tag. Ich möchte meine drei 3a-Konten gestaffelt beziehen, mit 60, 62 und 63. Wie viel Steuern zahle ich im Vergleich zu einem Bezug auf einmal?",
      ANSWER,
      "Und wenn ich die Pensionskasse mit 63 als Kapital beziehe statt als Rente, wie hoch ist dann die Steuer?",
      ANSWER,
    ],
    maxTurns: 8,
    expect: [
      "Calls the capital payout tax tool with three 3a payouts at 60, 62 and 63",
      "Compares with a single payout and names the saving",
      "Says the tax is only one side of the pension vs capital decision",
      "Known gap: it does not know about the scheduled appointment, earlier handovers are not in its context yet",
    ],
  }),
  scenario("home_saver", {
    id: "persona-wohnung",
    title: "Selin: savings plan for a flat in five years, WEF, life plan",
    script: [
      "Guten Tag. Ich möchte in fünf Jahren eine Wohnung für 700'000 kaufen und brauche 140'000 Eigenkapital. Wie viel muss ich monatlich sparen?",
      ANSWER,
      "Darf ich dafür meine 3a und die Pensionskasse brauchen, und was heisst das für meine Rente?",
      "Können Sie mir zeigen, wie das in meinem Leben über die Zeit aussieht?",
    ],
    maxTurns: 8,
    expect: [
      "Shows the savings plan with goal 140'000 minus what she has, over five years",
      "Explains WEF: 3a and pension fund early withdrawal, at least 10% equity not from the pension fund",
      "Stores the home purchase as a planned event and shows the life plan",
    ],
  }),
  scenario("romandie_contract_end", {
    id: "persona-lausanne",
    title: "Camille (fr): term life ends soon, open handover",
    script: [
      "Bonjour, j'attends l'appel de Madame Dubois au sujet de mon assurance décès qui se termine bientôt. Est-ce que vous voyez ma demande ?",
      "En attendant, quelles solutions existent pour continuer à protéger ma famille ?",
      ANSWER,
    ],
    maxTurns: 7,
    expect: [
      "Answers in French and with vous",
      "Knows the policy end date from the CRM",
      "Known gap: it does not see the pending call back and may create a second handover",
      "Explains that a new term life cover needs health questions",
    ],
  }),
  scenario("yearly_checkin", {
    id: "persona-checkin",
    title: "Monika: answers the yearly check-in with a raise and a planned reduction",
    script: [
      "Grüezi, ich habe Ihre Check-in-Mail bekommen. Ich verdiene jetzt 82'000 statt 78'000 und überlege, ab 2028 auf 80 Prozent zu reduzieren. Passt meine Erwerbsunfähigkeitsversicherung noch?",
      ANSWER,
      ANSWER,
    ],
    maxTurns: 7,
    expect: [
      "Updates income and records the planned reduction",
      "Recalculates the disability gap with the Pax disability pension of CHF 24'000",
      "Classifier stores the reduction as a future event (job change, 2028)",
    ],
  }),
];

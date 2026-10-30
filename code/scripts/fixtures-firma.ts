/**
 * DEV FIXTURE for the company dashboard (area B): inserts a handful of realistic, finished
 * conversations (flagged `isSimulated`) and runs the REAL classifier, FAQ extraction, handover
 * check and lead scoring on them (live model calls). Use it to look at /firma before real chats
 * or simulations exist.
 *
 *   pnpm exec tsx --conditions=react-server --env-file=.env.local scripts/fixtures-firma.ts
 *   pnpm exec tsx --conditions=react-server --env-file=.env.local scripts/fixtures-firma.ts --clean
 *
 * `--conditions=react-server` lets the script import the server-only modules. Every customer it
 * creates is recorded in the audit log (`fixture.created`) so `--clean` removes exactly those.
 */
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { type LifeSituation, lifeSituationSchema, profileCompleteness } from "@/lib/domain/profile";
import type {
  ConversationMode,
  ConversationStatus,
  FunnelStage,
  Locale,
} from "@/lib/domain/taxonomy";
import { analyzeConversation } from "@/lib/insights/analyze";

const FIXTURE_ACTION = "fixture.created";

interface Turn {
  role: "user" | "assistant";
  text?: string;
  tool?: { name: string; input: unknown; output: unknown };
}

interface Fixture {
  locale: Locale;
  mode: ConversationMode;
  stage: FunnelStage;
  status: ConversationStatus;
  minutesAgo: number;
  customer: Partial<typeof schema.customers.$inferInsert>;
  profile: Partial<LifeSituation>;
  externalPolicy?: Omit<typeof schema.policies.$inferInsert, "customerId" | "source">;
  nps?: number;
  recommendation?: Omit<
    typeof schema.recommendations.$inferInsert,
    "conversationId" | "customerId"
  >;
  turns: Turn[];
}

const riskOutput = {
  kind: "death",
  cause: "illness",
  need: 62_661,
  pillar1: 26_616,
  pillar2: 15_385,
  total: 42_001,
  gap: 20_660,
};

const fixtures: Fixture[] = [
  {
    locale: "de",
    mode: "new_business",
    stage: "recommendation_shown",
    status: "completed",
    minutesAgo: 140,
    customer: {
      lifecycle: "prospect",
      firstName: "Sarah",
      lastName: "Keller",
      email: "sarah.keller@example.ch",
      phone: "+41 79 555 10 20",
    },
    profile: {
      person: {
        firstName: "Sarah",
        birthYear: 1991,
        sex: "female",
        maritalStatus: "married",
        employment: "employed",
        workloadPercent: 60,
        grossIncome: 54_000,
      },
      partner: {
        firstName: "Daniel",
        birthYear: 1989,
        grossIncome: 98_000,
        employment: "employed",
      },
      children: [{ birthYear: 2026 }],
      residence: { zip: "4053", city: "Basel", canton: "BS" },
      goals: ["protect_family"],
      concerns: ["Was passiert mit der Familie, wenn Daniel etwas zustösst?"],
    },
    nps: 9,
    recommendation: {
      productCode: "todesfall",
      pillar: "3b",
      gap: "death",
      headline: "Todesfallkapital für die Familie",
      rationale: "Bei Tod von Daniel fehlen der Familie rund CHF 20'660 pro Jahr bis 2043.",
      criteria: [
        { criterion: "Lücke bei Tod", value: "CHF 20'660 pro Jahr", met: true },
        { criterion: "Kind unter 18", value: "Jahrgang 2026", met: true },
        { criterion: "Eintrittsalter", value: "37", met: true },
      ],
      premiumAnnual: 612,
      premiumSource: "estimate",
      model: "fixture",
    },
    turns: [
      {
        role: "assistant",
        text: "Grüezi! Ich bin der digitale Vorsorge-Berater von Pax. Erzählen Sie mir kurz, was Sie gerade beschäftigt?",
      },
      {
        role: "user",
        text: "Hallo, wir haben vor fünf Monaten ein Baby bekommen. Ich frage mich, was mit uns passiert, wenn meinem Mann etwas zustösst.",
      },
      {
        role: "assistant",
        text: "Herzliche Gratulation! Das ist eine sehr berechtigte Frage. Wie alt sind Sie beide und wie viel verdienen Sie ungefähr?",
      },
      {
        role: "user",
        text: "Ich bin 35 und arbeite 60% für etwa 54'000. Daniel ist 37 und verdient 98'000. Wir wohnen in Basel.",
      },
      {
        role: "assistant",
        text: "Danke. Ich rechne aus, wie gut Sie heute bei Tod oder Erwerbsunfähigkeit abgesichert wären.",
        tool: {
          name: "analyzeRisk",
          input: { person: "partner", cause: "illness" },
          output: riskOutput,
        },
      },
      {
        role: "assistant",
        text: "Stirbt Daniel an einer Krankheit, fehlen Ihnen bis 2043 rund CHF 20'660 pro Jahr. Unfälle sind über die UVG gut gedeckt.",
      },
      {
        role: "user",
        text: "Oh, das ist viel. Wie teuer wäre denn eine Versicherung dafür? Und lohnt sich das wirklich?",
      },
      {
        role: "assistant",
        text: "Eine Pax Todesfallversicherung mit CHF 250'000 Kapital würde etwa CHF 612 pro Jahr kosten (Schätzung).",
        tool: {
          name: "recommendProducts",
          input: { gap: "death" },
          output: { productCode: "todesfall", premiumAnnual: 612 },
        },
      },
      {
        role: "user",
        text: "Das klingt vernünftig. Können Sie mir eine Offerte schicken? Meine E-Mail ist sarah.keller@example.ch.",
      },
      {
        role: "assistant",
        text: "Gerne, die Offerte ist unterwegs. Eine Beraterin meldet sich bei Ihnen.",
      },
    ],
  },
  {
    locale: "fr",
    mode: "new_business",
    stage: "situation_captured",
    status: "handed_over",
    minutesAgo: 95,
    customer: {
      lifecycle: "prospect",
      firstName: "Julien",
      lastName: "Favre",
      phone: "+41 78 222 33 44",
    },
    profile: {
      person: {
        firstName: "Julien",
        birthYear: 1984,
        maritalStatus: "single",
        employment: "self_employed",
        grossIncome: 120_000,
      },
      residence: { zip: "1003", city: "Lausanne", canton: "VD" },
    },
    turns: [
      {
        role: "assistant",
        text: "Bonjour ! Je suis le conseiller en prévoyance numérique de Pax. Qu'est-ce qui vous amène ?",
      },
      {
        role: "user",
        text: "Je suis indépendant depuis un an, graphiste. Je n'ai plus de caisse de pension. Combien puis-je verser dans le 3a ?",
      },
      {
        role: "assistant",
        text: "Sans caisse de pension, vous pouvez verser jusqu'à 20 % de votre revenu net, au maximum CHF 36'288 par an.",
      },
      {
        role: "user",
        text: "Et si je tombe malade et ne peux plus travailler ? Je n'ai aucune couverture, ça m'inquiète beaucoup.",
      },
      {
        role: "assistant",
        text: "C'est un point important pour les indépendants. Votre situation mérite un conseil personnalisé : un spécialiste peut vous rappeler.",
        tool: {
          name: "requestHandover",
          input: {
            reason: "Indépendant sans LPP, besoin de couverture invalidité",
            urgency: "normal",
          },
          output: { handoverId: "fixture" },
        },
      },
      { role: "user", text: "Oui, rappelez-moi plutôt le matin, merci." },
    ],
  },
  {
    locale: "it",
    mode: "new_business",
    stage: "analysis_shown",
    status: "idle",
    minutesAgo: 60,
    customer: { lifecycle: "anonymous" },
    profile: {
      person: {
        birthYear: 1965,
        maritalStatus: "married",
        employment: "employed",
        grossIncome: 110_000,
      },
      residence: { zip: "6900", city: "Lugano", canton: "TI" },
    },
    nps: 7,
    turns: [
      {
        role: "assistant",
        text: "Buongiorno! Sono il consulente digitale di Pax per la previdenza. Come posso aiutarla?",
      },
      {
        role: "user",
        text: "Ho 61 anni e vado in pensione tra quattro anni. Mi conviene prendere il capitale della cassa pensione o la rendita?",
      },
      {
        role: "assistant",
        text: "Dipende da diversi fattori: tasse, aspettativa di vita, coniuge, rischio d'investimento. Le mostro una panoramica.",
        tool: {
          name: "analyzeRetirement",
          input: { retirementAge: 65 },
          output: { need: 88_000, pillar1: 30_240, pillar2: 41_600, gap: 16_160 },
        },
      },
      {
        role: "user",
        text: "Non capisco bene le tasse sul capitale. Sono tante? È tutto un po' complicato.",
      },
      {
        role: "assistant",
        text: "Il prelievo del capitale è tassato separatamente a un'aliquota ridotta. Con una rendita paga l'imposta sul reddito ogni anno.",
      },
    ],
  },
  {
    locale: "en",
    mode: "new_business",
    stage: "scenario_explored",
    status: "completed",
    minutesAgo: 30,
    customer: {
      lifecycle: "prospect",
      firstName: "James",
      lastName: "Walker",
      email: "james.walker@example.ch",
    },
    profile: {
      person: {
        firstName: "James",
        birthYear: 1988,
        maritalStatus: "married",
        employment: "employed",
        grossIncome: 145_000,
      },
      residence: { zip: "8004", city: "Zürich", canton: "ZH" },
      children: [{ birthYear: 2021 }],
    },
    externalPolicy: {
      insurer: "AXA",
      isExternal: true,
      category: "pillar3a",
      productName: "Mixed life insurance 3a",
      premiumAnnual: 6_800,
      sumInsured: 100_000,
    },
    nps: 10,
    turns: [
      {
        role: "assistant",
        text: "Hello! I'm Pax's digital pension advisor. What would you like to look at today?",
      },
      {
        role: "user",
        text: "I pay 6,800 a year into a 3a life insurance with AXA. A friend said that's expensive. Is it?",
      },
      {
        role: "assistant",
        text: "Let's look at what it covers. Do you know the guaranteed sum and the death benefit?",
      },
      {
        role: "user",
        text: "Death benefit 100k I think. We also want to buy a flat in 3 years, can I use the 3a for that?",
      },
      {
        role: "assistant",
        text: "Yes, 3a savings can be withdrawn for owner-occupied housing. Here is what that does to your retirement.",
        tool: {
          name: "simulateScenario",
          input: { scenario: "home_purchase", withdraw3a: 60_000 },
          output: { retirementGapBefore: 12_000, retirementGapAfter: 18_400 },
        },
      },
      {
        role: "user",
        text: "Interesting. How would a Pax 3a compare with what I have? Could you compare the costs?",
      },
      {
        role: "assistant",
        text: "A flexible Pax 3a without fixed premium lets you pause payments before the purchase. An advisor can compare both contracts in detail.",
      },
      { role: "user", text: "Great, please have someone email me a comparison. Thanks!" },
    ],
  },
  {
    locale: "de",
    mode: "new_business",
    stage: "getting_to_know",
    status: "abandoned",
    minutesAgo: 20,
    customer: { lifecycle: "anonymous" },
    profile: { residence: { city: "Bern", canton: "BE", zip: "3011" } },
    turns: [
      {
        role: "assistant",
        text: "Grüezi! Ich bin der digitale Vorsorge-Berater von Pax. Was beschäftigt Sie?",
      },
      { role: "user", text: "Was ist eigentlich der Unterschied zwischen Säule 3a und 3b?" },
      {
        role: "assistant",
        text: "Die Säule 3a ist steuerbegünstigt, aber gebunden. Die 3b ist flexibel. Darf ich fragen, wie alt Sie sind und ob Sie angestellt sind?",
      },
      { role: "user", text: "Wieso wollen Sie das wissen? Ich wollte nur eine kurze Antwort." },
    ],
  },
  {
    locale: "de",
    mode: "existing_customer",
    stage: "getting_to_know",
    status: "completed",
    minutesAgo: 8,
    customer: {
      lifecycle: "client",
      firstName: "Marco",
      lastName: "Huber",
      email: "marco.huber@example.ch",
      phone: "+41 79 444 55 66",
    },
    profile: {
      person: {
        firstName: "Marco",
        birthYear: 1979,
        maritalStatus: "divorced",
        employment: "employed",
        grossIncome: 95_000,
      },
      residence: { zip: "8400", city: "Winterthur", canton: "ZH" },
    },
    nps: 4,
    turns: [
      {
        role: "assistant",
        text: "Grüezi Herr Huber, schön, dass Sie wieder da sind. Wie kann ich helfen?",
      },
      {
        role: "user",
        text: "Ich bin geschieden und möchte bei meiner Todesfallversicherung die Begünstigung auf meine Kinder ändern. Wie geht das?",
      },
      {
        role: "assistant",
        text: "Dafür braucht es eine schriftliche Begünstigungsänderung. Ich kann das an den Kundendienst weitergeben.",
      },
      {
        role: "user",
        text: "Ich will lieber direkt mit einer Person sprechen. Das ist mir zu wichtig für einen Chat.",
      },
    ],
  },
];

function clean(): void {
  const ids = db
    .select({ id: schema.auditLog.entityId })
    .from(schema.auditLog)
    .where(eq(schema.auditLog.action, FIXTURE_ACTION))
    .all()
    .map((r) => r.id);
  for (const id of ids) db.delete(schema.customers).where(eq(schema.customers.id, id)).run();
  db.delete(schema.auditLog).where(eq(schema.auditLog.action, FIXTURE_ACTION)).run();
  console.log(
    `Removed ${ids.length} fixture customers (and their conversations, leads, handovers).`,
  );
}

function insert(fixture: Fixture): string {
  const start = Date.now() - fixture.minutesAgo * 60_000;
  return db.transaction((tx) => {
    const customer = tx
      .insert(schema.customers)
      .values({ ...fixture.customer, locale: fixture.locale, isSimulated: true })
      .returning()
      .get();
    const profile = lifeSituationSchema.parse(fixture.profile);
    tx.insert(schema.profiles)
      .values({
        customerId: customer.id,
        data: profile,
        completeness: profileCompleteness(profile),
      })
      .run();
    if (fixture.externalPolicy) {
      tx.insert(schema.policies)
        .values({ ...fixture.externalPolicy, customerId: customer.id, source: "chat" })
        .run();
    }
    const ruleSet = tx
      .select()
      .from(schema.ruleSets)
      .where(eq(schema.ruleSets.isActive, true))
      .get();
    const at = (i: number) => new Date(start + i * 45_000);
    const conversation = tx
      .insert(schema.conversations)
      .values({
        customerId: customer.id,
        locale: fixture.locale,
        mode: fixture.mode,
        stage: fixture.stage,
        status: fixture.status,
        isSimulated: true,
        ruleSetId: ruleSet?.id,
        messageCount: fixture.turns.length,
        createdAt: at(0),
        lastMessageAt: at(fixture.turns.length - 1),
      })
      .returning()
      .get();
    fixture.turns.forEach((turn, i) => {
      const parts: unknown[] = [];
      if (turn.text) parts.push({ type: "text", text: turn.text });
      if (turn.tool) {
        parts.push({
          type: `tool-${turn.tool.name}`,
          toolCallId: `fixture-${i}`,
          state: "output-available",
          input: turn.tool.input,
          output: turn.tool.output,
        });
      }
      tx.insert(schema.messages)
        .values({
          id: crypto.randomUUID(),
          conversationId: conversation.id,
          role: turn.role,
          parts,
          inputMode: turn.role === "user" ? "text" : null,
          createdAt: at(i),
        })
        .run();
    });
    if (fixture.recommendation) {
      tx.insert(schema.recommendations)
        .values({
          ...fixture.recommendation,
          conversationId: conversation.id,
          customerId: customer.id,
        })
        .run();
    }
    if (fixture.nps !== undefined) {
      tx.insert(schema.feedback)
        .values({ conversationId: conversation.id, customerId: customer.id, nps: fixture.nps })
        .run();
    }
    tx.insert(schema.auditLog)
      .values({
        actorType: "system",
        action: FIXTURE_ACTION,
        entityType: "customer",
        entityId: customer.id,
      })
      .run();
    return conversation.id;
  });
}

async function main(): Promise<void> {
  if (process.argv.includes("--clean")) {
    clean();
    return;
  }
  const ids = fixtures.map(insert);
  console.log(`Inserted ${ids.length} fixture conversations. Running the classifier …`);
  for (const id of ids) {
    const started = Date.now();
    try {
      const outcome = await analyzeConversation(id, { force: true });
      console.log(`  ${id}: ${outcome} in ${Date.now() - started} ms`);
    } catch (error) {
      console.error(`  ${id}: failed`, error);
    }
  }
}

void main();

/**
 * Pitch and test personas as seeded demo clients: CRM profile and policies, earlier
 * conversations with their analysis, leads, handovers, future events and e-mails, so the company
 * dashboard and the customer cockpit look alive. The simulated twin of each persona lives in
 * `src/lib/simulation/demo-personas.ts`, the scripted chat in `scripts/persona-scenarios.ts` and
 * the pitch script in `documentation/DEMO_PERSONAS.md`.
 *
 * Every date is relative to the day the seed runs (contract ends, follow-ups and the yearly
 * check-in stay "soon" on any day), except birth years and the years a persona names herself.
 */
import { asc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { z } from "zod";
import type { IdentifiedGap, ProductInterest, RecommendationCriterion } from "@/lib/db/schema";
import * as schema from "@/lib/db/schema";
import { addDays, addMonths, toIsoDate } from "@/lib/documents/dates";
import { lifeSituationSchema, profileCompleteness } from "@/lib/domain/profile";
import type {
  ContactChannel,
  ConversationStatus,
  FunnelStage,
  GapType,
  HandoverStatus,
  IntentStage,
  LeadStatus,
  LeadType,
  LifeEvent,
  Locale,
  Sentiment,
  Topic,
} from "@/lib/domain/taxonomy";
import type { DatePrecision, FutureEventKind } from "@/lib/followups/taxonomy";
import { resolveExpression } from "@/lib/followups/timing";
import { leadPriority, scoreLead } from "@/lib/leads/scoring";
import { DEMO_PERSONAS } from "@/lib/simulation/demo-personas";
import { type DemoPersonaKey, personaEmail, type SimPersona } from "@/lib/simulation/personas";

type Db = BetterSQLite3Database<typeof schema>;
type AdvisorKey = "sandra" | "marco" | "lea";
type PolicyInsert = Omit<typeof schema.policies.$inferInsert, "customerId">;

const ADVISOR_EMAIL: Record<AdvisorKey, string> = {
  sandra: "sandra.keller@example.ch",
  marco: "marco.bernasconi@example.ch",
  lea: "lea.dubois@example.ch",
};

/** Positions of the seeded company rules (scripts/seed.ts). */
const RULE = { wealth: 0, selfEmployed: 1, wantsHuman: 3, age58: 5 } as const;

interface Message {
  role: "user" | "assistant";
  text: string;
  voice?: boolean;
}

interface SeedLead {
  type: LeadType;
  productInterest: ProductInterest[];
  reasonToCall: string;
  talkingPoints: string[];
  advisor?: AdvisorKey;
  nextActionInDays?: number;
  /** What happened after the lead was created, in days after the conversation. */
  steps?: Array<
    | { afterDays: number; status: LeadStatus; advisor: AdvisorKey }
    | { afterDays: number; assign: AdvisorKey }
    | {
        afterDays: number;
        activity: "note" | "call" | "email";
        advisor?: AdvisorKey;
        body: string;
        subject?: string;
        direction?: "outbound" | "inbound";
      }
  >;
}

interface SeedHandover {
  reason: string;
  rules: number[];
  urgency: "normal" | "high";
  channel: ContactChannel;
  time: string;
  /** Status changes and assignments, in days after the conversation. */
  updates?: Array<{
    afterDays: number;
    advisor: AdvisorKey;
    status?: HandoverStatus;
    assign?: AdvisorKey;
  }>;
  /** Confirmation the advisor sent to the customer. */
  email?: { afterDays: number; advisor: AdvisorKey; subject: string; body: string };
}

interface SeedConversation {
  key: string;
  daysAgo: number;
  /** UTC; Swiss local time is one or two hours later. */
  hour: number;
  title: string;
  locale: Locale;
  status: ConversationStatus;
  stage: FunnelStage;
  messages: Message[];
  analysis: {
    topics: Topic[];
    lifeEvents: LifeEvent[];
    productInterest: ProductInterest[];
    intentStage: IntentStage;
    sentiment: Sentiment;
    painPoints: string[];
    gaps: IdentifiedGap[];
    summary: string;
    nextBestAction: string | null;
  };
  recommendation?: {
    productCode: NonNullable<PolicyInsert["productCode"]>;
    pillar: "3a" | "3b" | null;
    gap: GapType;
    headline: string;
    rationale: string;
    criteria: RecommendationCriterion[];
    status: "shown" | "accepted" | "declined";
  };
  feedback?: { nps: number; comment?: string };
  lead?: SeedLead;
  handover?: SeedHandover;
}

interface SeedEvent {
  conversation: string;
  kind: FutureEventKind;
  subject: string | null;
  when: { expression: string } | { date: string; precision: DatePrecision };
  quote: string;
  note: string;
  confidence: number;
}

interface SeedPersona {
  key: DemoPersonaKey;
  phone: string;
  birthDate: string;
  /** When the person became a Pax client in the digital system. */
  clientSinceDays: number;
  profile: (base: LifeSituationInput) => LifeSituationInput;
  policies: PolicyInsert[];
  conversations: SeedConversation[];
  events: SeedEvent[];
  checkinOptOut?: boolean;
  lastCheckin?: { daysAgo: number; subject: string; body: string; reply: string };
}

type LifeSituationInput = z.input<typeof lifeSituationSchema>;

// ─── Dates ──────────────────────────────────────────────────────────────────

const today = toIsoDate(new Date());
const day = (daysAgo: number) => addDays(today, -daysAgo);
const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
/** Last day of the month `months` after this one. */
const monthEnd = (months: number) => addDays(addMonths(monthStart(today), months + 1), -1);
const stamp = (daysAgo: number, hour: number, minutes = 0) =>
  new Date(
    new Date(`${day(daysAgo)}T${String(hour).padStart(2, "0")}:00:00Z`).getTime() +
      minutes * 60_000,
  );
/** Advisor work happens in office hours, `afterDays` after the conversation. */
const office = (conversationDaysAgo: number, afterDays: number, step: number) =>
  stamp(conversationDaysAgo - afterDays, 7, 30 + step * 6);

/** The profile Pax knows from the CRM, built from the simulated twin's facts. */
function baseProfile(p: SimPersona): LifeSituationInput {
  const partnered = p.partner !== null;
  return {
    person: {
      firstName: p.firstName,
      birthYear: p.birthYear,
      sex: p.sex,
      maritalStatus: p.maritalStatus,
      employment: p.employment,
      workloadPercent: p.workloadPercent,
      grossIncome: p.grossIncome,
    },
    partner: partnered
      ? {
          firstName: p.partner?.firstName,
          birthYear: p.partner?.birthYear,
          sex: p.sex === "female" ? "male" : "female",
          maritalStatus: p.maritalStatus,
          employment: "employed",
          grossIncome: p.partner?.grossIncome,
        }
      : undefined,
    children: p.childrenBirthYears.map((birthYear) => ({ birthYear })),
    residence: { zip: p.zip, city: p.city, canton: p.canton },
    assets: { total: p.assets },
    pillar2: { hasPensionFund: p.employment === "employed" },
    pillar3a: p.pillar3aBalance ? { balance: p.pillar3aBalance } : {},
  };
}

// ─── The personas ───────────────────────────────────────────────────────────

const camilleContractEnd = monthEnd(3);
const monikaPolicyStart = addMonths(monthStart(day(416)), 1);

const PERSONAS: SeedPersona[] = [
  {
    key: "student_first_job",
    phone: "+41 79 000 00 04",
    birthDate: "2001-03-08",
    clientSinceDays: 41,
    profile: (base) => ({
      ...base,
      person: { ...base.person, occupation: "Masterstudentin Umweltingenieurwesen", smoker: false },
      pillar2: { hasPensionFund: false },
      pillar3a: { balance: 4_200, annualContribution: 1_500 },
      goals: ["save_taxes", "build_wealth"],
    }),
    policies: [
      {
        policyNumber: "PAX-3A-2023-301877",
        category: "pillar3a",
        productCode: "pax3a",
        productName: "Pax 3a",
        pillar: "3a",
        insuredPerson: "Lena Fankhauser",
        startDate: "2023-02-01",
        endDate: "2066-03-31",
        premiumAnnual: 1_500,
        details: { balance: 4_200 },
        source: "seed",
      },
    ],
    conversations: [
      {
        key: "student-3a",
        daysAgo: 40,
        hour: 18,
        title: "Säule 3a im Studium",
        locale: "de",
        status: "completed",
        stage: "situation_captured",
        messages: [
          {
            role: "assistant",
            text: "Hallo Lena, schön, dass du wieder da bist. Was beschäftigt dich gerade?",
          },
          {
            role: "user",
            text: "hoi, ich zahl seit 2 jahren in die 3a ein, 1500 im jahr. darf ich als werkstudentin überhaupt mehr einzahlen?",
          },
          {
            role: "assistant",
            text: "Gute Frage. Ohne Pensionskasse darfst du bis 20 % deines Erwerbseinkommens in die Säule 3a einzahlen. Bei deinen rund CHF 9'600 im Jahr sind das knapp CHF 1'900, du bist also fast am Maximum.",
          },
          {
            role: "user",
            text: "ok. nächsten frühling bin ich mit dem master fertig und fange im april 100% bei ingenieurbüro muster ag an. ändert sich dann was?",
          },
          {
            role: "assistant",
            text: "Ja, einiges: Mit der Festanstellung bist du in der Pensionskasse versichert und darfst in die 3a bis zum Maximum für Angestellte einzahlen, 2026 sind das CHF 7'258. Ausserdem lohnt es sich dann, die Absicherung bei Krankheit anzuschauen. Sollen wir uns kurz vor dem Stellenantritt nochmals zusammensetzen?",
          },
          { role: "user", text: "ja gern, danke!" },
        ],
        analysis: {
          topics: ["pillar3a", "taxes"],
          lifeEvents: ["first_job"],
          productInterest: [{ productCode: "pax3a", strength: "low" }],
          intentStage: "informing",
          sentiment: "positive",
          painPoints: [],
          gaps: [],
          summary:
            "Studentin (Werkstudentin, CHF 9'600) mit Pax 3a fragt nach der Einzahlungsgrenze. Sie schliesst nächsten Frühling den Master ab und beginnt im April 100 % bei Ingenieurbüro Muster AG (CHF 82'000).",
          nextBestAction:
            "Kurz vor dem Stellenantritt melden: 3a auf das Maximum erhöhen und Erwerbsunfähigkeit besprechen.",
        },
        feedback: { nps: 9 },
      },
    ],
    events: [
      {
        conversation: "student-3a",
        kind: "first_job",
        subject: null,
        when: { expression: "nächsten Frühling" },
        quote:
          "nächsten frühling bin ich mit dem master fertig und fange im april 100% bei ingenieurbüro muster ag an",
        note: "Masterabschluss und Stellenantritt bei Ingenieurbüro Muster AG (100 %, CHF 82'000): Pensionskasse, 3a-Maximum und Erwerbsunfähigkeit besprechen.",
        confidence: 0.9,
      },
    ],
  },

  {
    key: "cohabiting_wedding",
    phone: "+41 79 000 00 05",
    birthDate: "1993-07-21",
    clientSinceDays: 200,
    profile: (base) => ({
      ...base,
      person: { ...base.person, occupation: "Physiotherapeutin" },
      partner: {
        ...base.partner,
        workloadPercent: 100,
        occupation: "Grafiker",
        pillar2: { hasPensionFund: true },
      },
      pillar2: { hasPensionFund: true },
      pillar3a: { balance: 31_000, annualContribution: 7_258 },
      goals: ["protect_family"],
      concerns: ["Was passiert mit mir, wenn Luca vor der Hochzeit etwas zustösst?"],
    }),
    policies: [
      {
        policyNumber: "PAX-3A-2019-188240",
        category: "pillar3a",
        productCode: "pax3a",
        productName: "Pax 3a",
        pillar: "3a",
        insuredPerson: "Nora Steiner",
        startDate: "2019-01-01",
        endDate: "2058-07-31",
        premiumAnnual: 7_258,
        details: { balance: 31_000 },
        source: "seed",
      },
    ],
    conversations: [
      {
        key: "konkubinat",
        daysAgo: 18,
        hour: 18,
        title: "Absicherung im Konkubinat vor der Hochzeit",
        locale: "de",
        status: "completed",
        stage: "recommendation_shown",
        messages: [
          {
            role: "assistant",
            text: "Grüezi Frau Steiner, schön, dass Sie wieder da sind. Wie kann ich helfen?",
          },
          {
            role: "user",
            text: "Grüezi! Mein Partner Luca und ich wohnen seit sechs Jahren zusammen, sind aber nicht verheiratet. Was passiert eigentlich mit mir, wenn ihm etwas zustösst?",
          },
          {
            role: "assistant",
            text: "Das ist eine wichtige Frage. Im Konkubinat erhalten Sie aus der AHV keine Witwenrente und sind keine gesetzliche Erbin. Ob Ihnen Lucas Pensionskasse eine Lebenspartnerrente zahlt, steht in deren Reglement; oft braucht es dafür eine schriftliche Meldung. Darf ich fragen, wie Sie beide verdienen und ob Pläne anstehen?",
          },
          {
            role: "user",
            text: "Ich arbeite 80% als Physiotherapeutin, etwa 72'000, Luca 100% als Grafiker mit 88'000. Wir heiraten nächsten Sommer, und in etwa zwei Jahren hätten wir gern ein Kind. Die Miete ist 2'650 im Monat.",
          },
          {
            role: "assistant",
            text: "Herzliche Gratulation zur geplanten Hochzeit! Ich habe gerechnet: Stirbt Luca vor der Hochzeit, fehlen Ihnen rund CHF 2'000 pro Monat, um Ihren heutigen Lebensstandard zu halten. Nach der Heirat wird die Lücke kleiner, mit einem Kind aber wieder grösser.",
          },
          {
            role: "user",
            text: "Das ist mehr, als ich dachte. Was können wir bis zur Hochzeit tun?",
          },
          {
            role: "assistant",
            text: "Zwei Schritte: Melden Sie sich gegenseitig bei Ihren Pensionskassen als Lebenspartner an, und prüfen Sie eine Pax Todesfallversicherung, die Sie gegenseitig begünstigt. Die passt auch nach der Hochzeit und wenn ein Kind kommt. Eine Beraterin kann Ihnen gern eine Offerte machen.",
          },
          { role: "user", text: "Ja, das wäre super. Am besten abends, gäll." },
        ],
        analysis: {
          topics: ["death_cover", "family_children", "pension_fund"],
          lifeEvents: ["marriage", "child_birth"],
          productInterest: [{ productCode: "todesfall", strength: "high" }],
          intentStage: "comparing",
          sentiment: "positive",
          painPoints: [
            "Im Konkubinat keine Witwenrente aus der AHV",
            "Lebenspartnerrente der Pensionskasse nicht gemeldet",
          ],
          gaps: [
            {
              gap: "death",
              amountAnnual: 24_000,
              note: "Bei Tod des Partners vor der Heirat fehlen rund CHF 2'000 pro Monat (Miete CHF 2'650).",
            },
          ],
          summary:
            "Unverheiratetes Paar (Konkubinat) in Winterthur, Heirat nächsten Sommer, Kinderwunsch in etwa zwei Jahren. Bei Tod des Partners fehlen rund CHF 24'000 pro Jahr; keine Begünstigung bei den Pensionskassen gemeldet.",
          nextBestAction:
            "Abends anrufen: Todesfallversicherung mit gegenseitiger Begünstigung offerieren und auf die Meldung bei den Pensionskassen hinweisen.",
        },
        recommendation: {
          productCode: "todesfall",
          pillar: "3b",
          gap: "death",
          headline: "Gegenseitige Absicherung bis zur Hochzeit und danach",
          rationale:
            "Im Konkubinat zahlt die AHV keine Hinterlassenenrente. Ein Todesfallkapital mit gegenseitiger Begünstigung schliesst die Lücke von rund CHF 2'000 pro Monat.",
          criteria: [
            { criterion: "Lücke bei Tod", value: "CHF 24'000 pro Jahr", met: true },
            { criterion: "Zivilstand", value: "Konkubinat", met: true },
            { criterion: "Eintrittsalter", value: "33", met: true },
          ],
          status: "shown",
        },
        feedback: { nps: 9, comment: "Endlich hat mir jemand das Konkubinat erklärt." },
        lead: {
          type: "existing_upsell",
          productInterest: [{ productCode: "todesfall", strength: "high" }],
          reasonToCall:
            "Konkubinatspaar vor der Hochzeit: Lücke von CHF 24'000 pro Jahr bei Tod des Partners, wünscht eine Offerte.",
          talkingPoints: [
            "Heirat nächsten Sommer, Kind in etwa zwei Jahren",
            "Gegenseitige Begünstigung, auch nach der Heirat passend",
            "Lebenspartner bei beiden Pensionskassen melden",
            "Lieber abends erreichbar",
          ],
          advisor: "sandra",
          nextActionInDays: 21,
          steps: [
            { afterDays: 1, assign: "sandra" },
            { afterDays: 2, status: "contacted", advisor: "sandra" },
            {
              afterDays: 2,
              activity: "call",
              advisor: "sandra",
              body: "Kurz telefoniert. Termin für beide am Abend vereinbart; Luca bringt seinen Vorsorgeausweis mit.",
            },
          ],
        },
      },
    ],
    events: [
      {
        conversation: "konkubinat",
        kind: "wedding",
        subject: null,
        when: { expression: "nächsten Sommer" },
        quote: "Wir heiraten nächsten Sommer",
        note: "Heirat mit Luca Moser: Begünstigungen, Hinterlassenenleistungen und Steuern neu prüfen.",
        confidence: 0.9,
      },
      {
        conversation: "konkubinat",
        kind: "child_birth",
        subject: null,
        when: { expression: "in etwa zwei Jahren" },
        quote: "in etwa zwei Jahren hätten wir gern ein Kind",
        note: "Kinderwunsch nach der Hochzeit: Todesfall- und Erwerbsunfähigkeitsschutz der Familie anpassen.",
        confidence: 0.6,
      },
    ],
  },

  {
    key: "self_employed_8165",
    phone: "+41 79 000 00 06",
    birthDate: "1985-11-02",
    clientSinceDays: 300,
    profile: (base) => ({
      ...base,
      person: { ...base.person, occupation: "Landschaftsgärtner, eigene Einzelfirma" },
      partner: { ...base.partner, workloadPercent: 30, occupation: "Lehrerin" },
      pillar2: { hasPensionFund: false },
      pillar3a: { balance: 38_000, annualContribution: 10_000 },
      assets: { total: 55_000, realEstateValue: 900_000, mortgage: 680_000 },
      goals: ["secure_income_disability", "protect_family"],
      concerns: [
        "Wenn ich krank werde, fällt das ganze Einkommen weg, und jetzt haben wir ein Haus.",
      ],
    }),
    policies: [
      {
        policyNumber: "PAX-3A-2016-120455",
        category: "pillar3a",
        productCode: "pax3a",
        productName: "Pax 3a",
        pillar: "3a",
        insuredPerson: "Andrin Gerber",
        startDate: "2016-04-01",
        endDate: "2050-11-30",
        details: { balance: 38_000 },
        source: "seed",
      },
    ],
    conversations: [
      {
        key: "self-employed-house",
        daysAgo: 9,
        hour: 5,
        title: "Selbstständig, Hauskauf und keine Pensionskasse",
        locale: "de",
        status: "handed_over",
        stage: "analysis_shown",
        messages: [
          {
            role: "assistant",
            text: "Hallo Andrin, schön, dass du dich meldest. Was kann ich für dich tun?",
          },
          {
            role: "user",
            voice: true,
            text: "also ich bin ja selbständig gärtner mit eigener firma und wir haben jetzt äh ein altes bauernhaus gekauft in 8165 und im april ziehen wir um mit der ganzen familie mini frau schafft 30 prozent als lehrerin und wir haben zwei kinder und ich frage mich halt was passiert wenn ich krank werde weil dann ist ja öppe alles weg gäll",
          },
          {
            role: "assistant",
            text: "Gratuliere zum Haus! Als Selbstständiger ohne Pensionskasse ist die Frage sehr berechtigt. Wie viel verdienst du ungefähr, und hast du eine Krankentaggeldversicherung?",
          },
          {
            role: "user",
            voice: true,
            text: "so öppe 105000 netto im jahr je nach saison und nein krankentaggeld habe ich keins nur eine unfallversicherung und die hypothek ist 680000 und in die 3a zahle ich halt wenn es gut läuft so 10000",
          },
          {
            role: "assistant",
            text: "Danke. Bei Krankheit bekämst du nach der Wartefrist nur eine IV-Rente: Dir und deiner Familie würden rund CHF 4'000 pro Monat fehlen, die Hypothek noch nicht eingerechnet. Bei Tod wäre die Lücke ebenfalls gross. Das sollten wir genau anschauen. Weil du selbstständig bist, bespricht das am besten eine Fachperson mit dir. Soll dich jemand anrufen?",
          },
          {
            role: "user",
            voice: true,
            text: "ja gern aber erst am abend so ab 18 uhr vorher bin ich auf der büez",
          },
          {
            role: "assistant",
            text: "Gut, ich habe einen Rückruf am Abend ab 18 Uhr angefragt. Eine Beraterin oder ein Berater meldet sich bei dir.",
          },
        ],
        analysis: {
          topics: ["disability_cover", "death_cover", "home_ownership", "pillar3a"],
          lifeEvents: ["home_purchase", "self_employment", "relocation"],
          productInterest: [
            { productCode: "erwerbsunfaehigkeit", strength: "high" },
            { productCode: "todesfall", strength: "medium" },
          ],
          intentStage: "exploring",
          sentiment: "mixed",
          painPoints: [
            "Keine Pensionskasse und kein Krankentaggeld",
            "Neue Hypothek CHF 680'000",
            "3a-Einzahlungen unregelmässig",
          ],
          gaps: [
            {
              gap: "disability",
              amountAnnual: 48_000,
              note: "Bei Erwerbsunfähigkeit durch Krankheit nur IV-Rente; rund CHF 4'000 pro Monat fehlen.",
            },
            {
              gap: "death",
              amountAnnual: 30_000,
              note: "Familie mit zwei Kindern, Hypothek CHF 680'000, keine Hinterlassenenleistungen aus der 2. Säule.",
            },
          ],
          summary:
            "Selbstständiger Landschaftsgärtner (CHF 105'000) ohne Pensionskasse und ohne Krankentaggeld, verheiratet, zwei Kinder. Hauskauf in 8165, Umzug im April, Hypothek CHF 680'000. Grosse Lücken bei Erwerbsunfähigkeit und Tod. Rückruf abends gewünscht.",
          nextBestAction:
            "Abends ab 18 Uhr anrufen: Erwerbsunfähigkeit, Todesfall und 3a für Selbstständige (bis 20 % des Einkommens) besprechen.",
        },
        lead: {
          type: "existing_upsell",
          productInterest: [
            { productCode: "erwerbsunfaehigkeit", strength: "high" },
            { productCode: "todesfall", strength: "medium" },
          ],
          reasonToCall:
            "Selbstständiger ohne Pensionskasse und Krankentaggeld, neues Haus mit CHF 680'000 Hypothek: Lücke von CHF 4'000 pro Monat bei Erwerbsunfähigkeit.",
          talkingPoints: [
            "Umzug nach 8165 im April",
            "Erwerbsunfähigkeitsrente und Todesfallkapital für die Hypothek",
            "3a für Selbstständige: bis 20 % des Nettoeinkommens",
            "Nur abends ab 18 Uhr erreichbar",
          ],
        },
        handover: {
          reason:
            "Selbstständiger ohne Pensionskasse, grosse Lücke bei Erwerbsunfähigkeit, Hauskauf mit Hypothek: persönliche Beratung.",
          rules: [RULE.selfEmployed],
          urgency: "normal",
          channel: "phone",
          time: "abends ab 18 Uhr",
        },
      },
    ],
    events: [
      {
        conversation: "self-employed-house",
        kind: "home_purchase",
        subject: null,
        when: { expression: "im April" },
        quote: "im april ziehen wir um mit der ganzen familie",
        note: "Umzug ins gekaufte Bauernhaus in 8165 Schöfflisdorf, Hypothek CHF 680'000: Adresse aktualisieren, Absicherung der Hypothek prüfen.",
        confidence: 0.85,
      },
    ],
  },

  {
    key: "pension_or_lump_sum",
    phone: "+41 79 000 00 07",
    birthDate: "1967-05-14",
    clientSinceDays: 330,
    checkinOptOut: true,
    profile: (base) => ({
      ...base,
      person: { ...base.person, occupation: "Produktionsleiter" },
      partner: { ...base.partner, workloadPercent: 50, occupation: "Buchhalterin" },
      assets: {
        total: undefined,
        liquid: 60_000,
        securities: 180_000,
        realEstateValue: 950_000,
        mortgage: 380_000,
      },
      pillar2: {
        hasPensionFund: true,
        insuredSalary: 102_000,
        currentCapital: 610_000,
        projectedCapitalAtRetirement: 790_000,
        projectedPensionAtRetirement: 42_600,
      },
      pillar3a: { balance: 193_000, annualContribution: 7_258 },
      goals: ["retire_early", "retire_comfortably", "save_taxes"],
      plannedEvents: [{ type: "early_retirement", year: 2030, note: "Mit 63, im Sommer 2030" }],
      riskAttitude: "low",
      desiredRetirementAge: 63,
    }),
    policies: [
      {
        policyNumber: "PAX-3A-2008-044391",
        category: "pillar3a",
        productCode: "pax3a",
        productName: "Pax 3a",
        pillar: "3a",
        insuredPerson: "Hans-Peter Wyss",
        startDate: "2008-01-01",
        endDate: "2032-05-31",
        premiumAnnual: 4_258,
        details: { balance: 68_000 },
        source: "seed",
      },
      {
        policyNumber: "PAX-LS-2012-077815",
        category: "pillar3a",
        productCode: "lifestar",
        productName: "Pax LifeStar (3a)",
        pillar: "3a",
        insuredPerson: "Hans-Peter Wyss",
        startDate: "2012-07-01",
        endDate: "2032-05-31",
        premiumAnnual: 3_000,
        sumInsured: 60_000,
        details: { surrenderValue: 54_000 },
        source: "seed",
      },
      {
        insurer: "Muster Bank AG",
        isExternal: true,
        category: "pillar3a",
        productName: "Vorsorgekonto 3a",
        pillar: "3a",
        insuredPerson: "Hans-Peter Wyss",
        details: { balance: 71_000 },
        source: "chat",
        createdAt: stamp(25, 10, 6),
      },
    ],
    conversations: [
      {
        key: "rente-kapital",
        daysAgo: 25,
        hour: 8,
        title: "Rente oder Kapital, 3a gestaffelt beziehen",
        locale: "de",
        status: "handed_over",
        stage: "scenario_explored",
        messages: [
          {
            role: "assistant",
            text: "Grüezi Herr Wyss, schön, dass Sie wieder da sind. Wie kann ich helfen?",
          },
          {
            role: "user",
            text: "Guten Tag. Ich bin 59 und möchte mit 63 aufhören, im Sommer 2030. Soll ich die Pensionskasse als Rente oder als Kapital beziehen?",
          },
          {
            role: "assistant",
            text: "Das ist eine der wichtigsten Entscheidungen vor der Pensionierung. Eine Rente ist lebenslang und für Ihre Frau abgesichert, Kapital ist flexibel, wird aber beim Bezug besteuert und muss bis ans Lebensende reichen. Kennen Sie die Zahlen aus Ihrem Vorsorgeausweis?",
          },
          {
            role: "user",
            text: "Ja: heute 610'000, mit 65 wären es 790'000 oder eine Rente von 42'600 im Jahr. Dazu habe ich drei 3a-Konten: Pax 3a mit 68'000, eine LifeStar mit 54'000 und ein Konto bei der Muster Bank mit 71'000.",
          },
          {
            role: "assistant",
            text: "Danke, das ist sehr vollständig. Bei drei 3a-Konten lohnt sich ein gestaffelter Bezug: Wer die Konten in verschiedenen Steuerjahren bezieht, zahlt wegen der Progression meist weniger Steuern. Beachten Sie, dass Bezüge von Ihnen und Ihrer Frau im selben Jahr zusammengerechnet werden.",
          },
          {
            role: "user",
            text: "Dann würde ich die Konten mit 60, 62 und 63 beziehen. Wie viel Steuern spare ich damit genau, und was ist mit der Pensionskasse halb Rente, halb Kapital?",
          },
          {
            role: "assistant",
            text: "Bei Ihrem Vermögen und weil Sie zwischen Rente und Kapital entscheiden, empfehle ich ein Gespräch mit einer Fachperson. Sie rechnet beide Varianten mit Ihren Steuerdaten durch. Darf ich einen Termin anfragen?",
          },
          {
            role: "user",
            text: "Ja, am liebsten in Liestal oder Basel, an einem Dienstagnachmittag.",
          },
        ],
        analysis: {
          topics: ["payout_retirement", "retirement", "pillar3a", "taxes", "pension_fund"],
          lifeEvents: ["early_retirement"],
          productInterest: [{ productCode: "auszahlungsplan", strength: "high" }],
          intentStage: "comparing",
          sentiment: "neutral",
          painPoints: ["Steuer beim Kapitalbezug", "Drei 3a-Konten ohne Bezugsplan"],
          gaps: [
            {
              gap: "payout",
              amountAnnual: null,
              note: "Entscheid Rente oder Kapital offen; 3a-Bezüge (CHF 193'000) noch nicht gestaffelt.",
            },
          ],
          summary:
            "59-jähriger Produktionsleiter (CHF 128'000), verheiratet, Frühpensionierung mit 63 im Sommer 2030. PK-Kapital heute CHF 610'000 (mit 65: CHF 790'000 oder Rente CHF 42'600). Drei 3a-Konten über CHF 193'000; will gestaffelt mit 60, 62 und 63 beziehen.",
          nextBestAction:
            "Termin in Liestal: Rente, Kapital und Mischform mit Steuerberechnung vergleichen, 3a-Bezugsplan und Auszahlungsplan vorstellen.",
        },
        lead: {
          type: "existing_upsell",
          productInterest: [{ productCode: "auszahlungsplan", strength: "high" }],
          reasonToCall:
            "Entscheid Rente oder Kapital (PK CHF 790'000 mit 65) und gestaffelter Bezug von drei 3a-Konten über CHF 193'000.",
          talkingPoints: [
            "Frühpensionierung mit 63 im Sommer 2030",
            "3a-Bezüge mit 60, 62 und 63 in verschiedenen Steuerjahren",
            "Mischform halb Rente, halb Kapital",
            "Auszahlungsplan für das Kapital",
          ],
          advisor: "sandra",
          nextActionInDays: 31,
          steps: [
            { afterDays: 1, assign: "sandra" },
            { afterDays: 1, status: "contacted", advisor: "sandra" },
            {
              afterDays: 1,
              activity: "call",
              advisor: "sandra",
              body: "Termin in Liestal vereinbart (Dienstagnachmittag). Bringt Vorsorgeausweis und Steuererklärung mit.",
            },
            { afterDays: 2, status: "meeting", advisor: "sandra" },
          ],
        },
        handover: {
          reason:
            "Entscheid Rente oder Kapital mit 59 und Vermögen über CHF 300'000: Fachberatung mit Steuerberechnung.",
          rules: [RULE.wealth, RULE.age58],
          urgency: "normal",
          channel: "branch",
          time: "Dienstagnachmittag, Liestal oder Basel",
          updates: [{ afterDays: 1, advisor: "sandra", status: "scheduled", assign: "sandra" }],
        },
      },
    ],
    events: [
      {
        conversation: "rente-kapital",
        kind: "retirement",
        subject: null,
        when: { expression: "im Sommer 2030" },
        quote: "Ich bin 59 und möchte mit 63 aufhören, im Sommer 2030.",
        note: "Frühpensionierung mit 63: Bezug der PK (Rente oder Kapital) bis spätestens drei Monate vorher festlegen, 3a-Bezüge staffeln.",
        confidence: 0.95,
      },
    ],
  },

  {
    key: "home_saver",
    phone: "+41 79 000 00 08",
    birthDate: "1997-02-27",
    clientSinceDays: 150,
    profile: (base) => ({
      ...base,
      person: { ...base.person, occupation: "UX-Designerin" },
      pillar2: { hasPensionFund: true, currentCapital: 40_000 },
      pillar3a: { balance: 21_000, annualContribution: 7_258 },
      goals: ["buy_home", "save_taxes"],
      riskAttitude: "medium",
    }),
    policies: [
      {
        policyNumber: "PAX-3A-2021-266102",
        category: "pillar3a",
        productCode: "pax3a",
        productName: "Pax 3a",
        pillar: "3a",
        insuredPerson: "Selin Aydin",
        startDate: "2021-09-01",
        endDate: "2062-02-28",
        premiumAnnual: 7_258,
        details: { balance: 21_000 },
        source: "seed",
      },
    ],
    conversations: [
      {
        key: "steuern-wohnung",
        daysAgo: 60,
        hour: 10,
        title: "3a-Steuern und Wohnungskauf in fünf Jahren",
        locale: "de",
        status: "completed",
        stage: "analysis_shown",
        messages: [
          {
            role: "assistant",
            text: "Grüezi Frau Aydin, schön, dass Sie wieder da sind. Was möchten Sie heute anschauen?",
          },
          {
            role: "user",
            text: "Guten Tag. Ich zahle jedes Jahr das Maximum in die 3a. Wie viel Steuern spare ich damit in St. Gallen ungefähr?",
          },
          {
            role: "assistant",
            text: "Bei Ihrem Einkommen von CHF 92'000 sparen Sie mit CHF 7'258 in der Säule 3a jedes Jahr spürbar Einkommenssteuer; die genaue Zahl rechne ich Ihnen gern mit Ihrem Steuerort aus. Haben Sie mit dem Geld ein bestimmtes Ziel?",
          },
          {
            role: "user",
            text: "Ja, in fünf Jahren möchte ich eine Wohnung kaufen, etwa 700'000. Ich habe 48'000 gespart. Kann ich die 3a dafür brauchen?",
          },
          {
            role: "assistant",
            text: "Ja, für selbst bewohntes Wohneigentum dürfen Sie das 3a-Guthaben vorbeziehen; der Bezug wird separat besteuert. Banken verlangen meist 20 % Eigenkapital, bei CHF 700'000 also CHF 140'000, davon mindestens die Hälfte nicht aus der Pensionskasse. Ich kann Ihnen ausrechnen, wie viel Sie dafür monatlich sparen müssten.",
          },
          { role: "user", text: "Danke, ich überlege mir das und melde mich wieder." },
        ],
        analysis: {
          topics: ["pillar3a", "taxes", "home_ownership"],
          lifeEvents: ["home_purchase"],
          productInterest: [
            { productCode: "pax3a", strength: "medium" },
            { productCode: "fondsstar", strength: "low" },
          ],
          intentStage: "exploring",
          sentiment: "positive",
          painPoints: ["Eigenkapital für Wohnungskauf noch zu tief"],
          gaps: [],
          summary:
            "UX-Designerin (CHF 92'000) zahlt das 3a-Maximum, plant in fünf Jahren eine Wohnung um CHF 700'000. Ersparnisse CHF 48'000, Pax 3a CHF 21'000; braucht rund CHF 140'000 Eigenkapital.",
          nextBestAction:
            "Sparplan für das Eigenkapital zeigen und Vorbezug aus 3a und Pensionskasse (WEF) mit Auswirkung auf die Rente erklären.",
        },
        feedback: {
          nps: 7,
          comment: "Gute Infos, aber ich hätte gern gleich gesehen, wie viel ich sparen muss.",
        },
        lead: {
          type: "existing_upsell",
          productInterest: [
            { productCode: "pax3a", strength: "medium" },
            { productCode: "fondsstar", strength: "low" },
          ],
          reasonToCall:
            "Wohnungskauf in fünf Jahren (CHF 700'000): Sparplan für CHF 140'000 Eigenkapital und WEF-Vorbezug besprechen.",
          talkingPoints: [
            "Ersparnisse CHF 48'000, Pax 3a CHF 21'000",
            "Mindestens 10 % Eigenkapital nicht aus der Pensionskasse",
            "Vorbezug aus 3a separat besteuert",
          ],
        },
      },
    ],
    events: [
      {
        conversation: "steuern-wohnung",
        kind: "home_purchase",
        subject: null,
        when: { expression: "in fünf Jahren" },
        quote: "in fünf Jahren möchte ich eine Wohnung kaufen, etwa 700'000",
        note: "Kauf einer Eigentumswohnung um CHF 700'000 in der Region St. Gallen; Eigenkapital CHF 140'000, 3a-Vorbezug geplant.",
        confidence: 0.75,
      },
    ],
  },

  {
    key: "romandie_contract_end",
    phone: "+41 79 000 00 09",
    birthDate: "1978-09-30",
    clientSinceDays: 120,
    profile: (base) => ({
      ...base,
      person: { ...base.person, occupation: "Pharmacienne", smoker: false },
      partner: { ...base.partner, workloadPercent: 100, occupation: "Enseignant" },
      children: [{ birthYear: 2008 }, { birthYear: 2011 }],
      assets: { total: undefined, liquid: 85_000, realEstateValue: 980_000, mortgage: 520_000 },
      pillar2: { hasPensionFund: true },
      pillar3a: { balance: 52_000, annualContribution: 7_258 },
      goals: ["protect_family"],
    }),
    policies: [
      {
        policyNumber: "PAX-TF-2011-093320",
        category: "risk_death",
        productCode: "todesfall",
        productName: "Pax Todesfallversicherung",
        pillar: "3b",
        insuredPerson: "Camille Rochat",
        // Taken out in 2011 for the flat, for a whole number of years.
        startDate: `2011-${addDays(camilleContractEnd, 1).slice(5)}`,
        endDate: camilleContractEnd,
        premiumAnnual: 540,
        sumInsured: 300_000,
        source: "seed",
      },
      {
        policyNumber: "PAX-3A-2014-150278",
        category: "pillar3a",
        productCode: "pax3a",
        productName: "Pax 3a",
        pillar: "3a",
        insuredPerson: "Camille Rochat",
        startDate: "2014-01-01",
        endDate: "2043-09-30",
        premiumAnnual: 7_258,
        details: { balance: 52_000 },
        source: "seed",
      },
    ],
    conversations: [
      {
        key: "fin-contrat",
        daysAgo: 4,
        hour: 6,
        title: "Fin de l'assurance décès, rappel souhaité",
        locale: "fr",
        status: "handed_over",
        stage: "situation_captured",
        messages: [
          {
            role: "assistant",
            text: "Bonjour Madame Rochat, ravi de vous revoir. Comment puis-je vous aider ?",
          },
          {
            role: "user",
            text: "Bonjour, mon assurance décès chez Pax se termine dans trois mois. Nous avons encore une hypothèque de 520'000 francs et nos enfants Mathis et Zoé sont encore en formation. Que dois-je faire ?",
          },
          {
            role: "assistant",
            text: "Merci de me le signaler à temps. Votre assurance de CHF 300'000 se termine en effet bientôt, alors que l'hypothèque et les enfants sont toujours là. Une nouvelle couverture demande en général des questions de santé ; il vaut donc la peine de s'en occuper maintenant.",
          },
          {
            role: "user",
            text: "C'est bien ce que je pensais. Je préfère en parler avec une personne, pas dans le chat. Est-ce possible ?",
          },
          {
            role: "assistant",
            text: "Bien sûr. Je demande un rappel par une conseillère de notre équipe romande. Quand êtes-vous le plus facilement joignable ?",
          },
          { role: "user", text: "Le matin, avant 10 heures, au 079 000 00 09. Merci beaucoup !" },
          {
            role: "assistant",
            text: "C'est noté : rappel le matin avant 10 heures. Une conseillère vous contactera dans les prochains jours.",
          },
        ],
        analysis: {
          topics: ["death_cover", "existing_contract", "home_ownership", "family_children"],
          lifeEvents: [],
          productInterest: [{ productCode: "todesfall", strength: "high" }],
          intentStage: "ready",
          sentiment: "positive",
          painPoints: [
            "Todesfallversicherung läuft in drei Monaten aus",
            "Hypothek CHF 520'000, zwei Kinder in Ausbildung",
          ],
          gaps: [
            {
              gap: "death",
              amountAnnual: 36_000,
              note: "Nach Ablauf der Police (CHF 300'000) keine Deckung für Hypothek und Kinder.",
            },
          ],
          summary:
            "Bestandskundin in Lausanne (Apothekerin, 80 %), verheiratet, zwei Kinder (2008, 2011). Ihre Pax Todesfallversicherung über CHF 300'000 endet in drei Monaten, Hypothek CHF 520'000. Wünscht ausdrücklich einen Rückruf, morgens vor 10 Uhr.",
          nextBestAction:
            "Rückruf durch das Team Romandie vor 10 Uhr: Anschlusslösung mit Gesundheitsfragen vor Ablauf der Police anbieten.",
        },
        lead: {
          type: "existing_upsell",
          productInterest: [{ productCode: "todesfall", strength: "high" }],
          reasonToCall:
            "Todesfallversicherung (CHF 300'000) endet in drei Monaten, Hypothek und Kinder in Ausbildung: Anschlusslösung.",
          talkingPoints: [
            "Police läuft Ende des dritten Monats aus",
            "Hypothek CHF 520'000",
            "Kinder Mathis und Zoé in Ausbildung",
            "Nur morgens vor 10 Uhr erreichbar, Französisch",
          ],
        },
        handover: {
          reason:
            "Kundin wünscht ausdrücklich ein persönliches Gespräch: Todesfallversicherung läuft aus, Hypothek und Kinder.",
          rules: [RULE.wantsHuman],
          urgency: "normal",
          channel: "phone",
          time: "le matin, avant 10 h",
          updates: [{ afterDays: 1, advisor: "lea", assign: "lea" }],
          email: {
            afterDays: 1,
            advisor: "lea",
            subject: "Votre demande de rappel",
            body: "Bonjour Madame Rochat,\n\nMerci pour votre message. Je vous appellerai un matin cette semaine, avant 10 heures, pour parler de la suite de votre assurance décès.\n\nMeilleures salutations\nLéa Dubois, Pax",
          },
        },
      },
    ],
    events: [
      {
        conversation: "fin-contrat",
        kind: "contract_end",
        subject: null,
        when: { date: camilleContractEnd, precision: "day" },
        quote: "mon assurance décès chez Pax se termine dans trois mois",
        note: "Pax Todesfallversicherung (CHF 300'000) läuft aus; Hypothek CHF 520'000 und Kinder in Ausbildung: Anschlusslösung vor Ablauf.",
        confidence: 0.95,
      },
    ],
  },

  {
    key: "yearly_checkin",
    phone: "+41 79 000 00 10",
    birthDate: "1971-04-12",
    clientSinceDays: 1_100,
    profile: (base) => ({
      ...base,
      // The CRM still has last year's salary; the raise comes up in the check-in chat.
      person: { ...base.person, occupation: "Office-Managerin", grossIncome: 78_000 },
      children: [{ birthYear: 2005, educationUntil: 2029 }],
      pillar2: { hasPensionFund: true },
      pillar3a: { balance: 46_000, annualContribution: 5_000 },
      goals: ["retire_comfortably", "secure_income_disability"],
    }),
    policies: [
      {
        policyNumber: "PAX-LS-2019-205516",
        category: "pillar3a",
        productCode: "lifestar",
        productName: "Pax LifeStar (3a)",
        pillar: "3a",
        insuredPerson: "Monika Widmer",
        startDate: "2019-03-01",
        endDate: "2036-04-30",
        premiumAnnual: 5_000,
        sumInsured: 50_000,
        details: { surrenderValue: 46_000 },
        source: "seed",
      },
      {
        policyNumber: `PAX-EU-${monikaPolicyStart.slice(0, 4)}-318804`,
        category: "risk_disability",
        productCode: "erwerbsunfaehigkeit",
        productName: "Pax Erwerbsunfähigkeitsversicherung",
        pillar: "3b",
        insuredPerson: "Monika Widmer",
        startDate: monikaPolicyStart,
        endDate: "2036-04-30",
        premiumAnnual: 1_140,
        annuityAnnual: 24_000,
        source: "advisor",
        createdAt: stamp(415, 9),
      },
    ],
    conversations: [
      {
        key: "eu-burnout",
        daysAgo: 430,
        hour: 18,
        title: "Was passiert, wenn ich lange krank bin?",
        locale: "de",
        status: "completed",
        stage: "recommendation_shown",
        messages: [
          { role: "assistant", text: "Grüezi Frau Widmer, wie kann ich Ihnen helfen?" },
          {
            role: "user",
            text: "Eine Kollegin ist seit Monaten wegen Burnout ausgefallen. Was würde bei mir passieren, wenn ich lange nicht arbeiten kann? Ich bin geschieden und allein mit meiner Tochter.",
          },
          {
            role: "assistant",
            text: "Das tut mir leid für Ihre Kollegin. Nach der Lohnfortzahlung und dem Krankentaggeld zahlen IV und Pensionskasse eine Rente. Bei Ihrem Lohn von CHF 78'000 würden Ihnen rund CHF 2'300 pro Monat fehlen, und als Alleinerziehende tragen Sie die Kosten allein.",
          },
          { role: "user", text: "Das wäre schwierig. Was kann ich dagegen tun?" },
          {
            role: "assistant",
            text: "Eine Pax Erwerbsunfähigkeitsversicherung zahlt Ihnen in diesem Fall eine Rente bis zur Pensionierung. Mit CHF 24'000 pro Jahr wäre die Lücke weitgehend geschlossen. Soll Sie eine Beraterin für eine Offerte anrufen?",
          },
          { role: "user", text: "Ja, gern, tagsüber im Büro." },
        ],
        analysis: {
          topics: ["disability_cover", "family_children"],
          lifeEvents: [],
          productInterest: [{ productCode: "erwerbsunfaehigkeit", strength: "high" }],
          intentStage: "ready",
          sentiment: "positive",
          painPoints: ["Alleinerziehend, keine Absicherung über IV und PK hinaus"],
          gaps: [
            {
              gap: "disability",
              amountAnnual: 27_600,
              note: "Bei langer Krankheit fehlen rund CHF 2'300 pro Monat.",
            },
          ],
          summary:
            "Geschiedene Office-Managerin (CHF 78'000), eine Tochter (2005). Sorge um Einkommen bei langer Krankheit; Lücke rund CHF 27'600 pro Jahr. Möchte eine Offerte für eine Erwerbsunfähigkeitsrente.",
          nextBestAction:
            "Tagsüber anrufen und eine Erwerbsunfähigkeitsrente von CHF 24'000 offerieren.",
        },
        recommendation: {
          productCode: "erwerbsunfaehigkeit",
          pillar: "3b",
          gap: "disability",
          headline: "Rente bei Erwerbsunfähigkeit für Alleinerziehende",
          rationale:
            "Bei langer Krankheit fehlen rund CHF 2'300 pro Monat. Eine Rente von CHF 24'000 pro Jahr schliesst die Lücke weitgehend.",
          criteria: [
            { criterion: "Lücke bei Erwerbsunfähigkeit", value: "CHF 27'600 pro Jahr", met: true },
            { criterion: "Eintrittsalter", value: "54", met: true },
          ],
          status: "accepted",
        },
        feedback: { nps: 10, comment: "Sehr verständlich erklärt, danke." },
        lead: {
          type: "existing_upsell",
          productInterest: [{ productCode: "erwerbsunfaehigkeit", strength: "high" }],
          reasonToCall:
            "Alleinerziehende Bestandskundin mit Lücke von CHF 2'300 pro Monat bei Erwerbsunfähigkeit, wünscht eine Offerte.",
          talkingPoints: [
            "Erwerbsunfähigkeitsrente CHF 24'000 pro Jahr",
            "Tochter Lea (2005) im Studium",
            "Tagsüber im Büro erreichbar",
          ],
          advisor: "sandra",
          steps: [
            { afterDays: 1, assign: "sandra" },
            { afterDays: 1, status: "contacted", advisor: "sandra" },
            {
              afterDays: 1,
              activity: "call",
              advisor: "sandra",
              body: "Erstgespräch: Lücke bestätigt, Gesundheitsfragen besprochen. Offerte per E-Mail vereinbart.",
            },
            { afterDays: 4, status: "offer", advisor: "sandra" },
            {
              afterDays: 4,
              activity: "email",
              advisor: "sandra",
              direction: "outbound",
              subject: "Ihre Offerte: Pax Erwerbsunfähigkeitsversicherung",
              body: "Grüezi Frau Widmer\n\nWie besprochen erhalten Sie die Offerte für eine Erwerbsunfähigkeitsrente von CHF 24'000 pro Jahr. Bei Fragen rufen Sie mich gern an.\n\nFreundliche Grüsse\nSandra Keller, Pax",
            },
            {
              afterDays: 12,
              activity: "email",
              direction: "inbound",
              subject: "AW: Ihre Offerte: Pax Erwerbsunfähigkeitsversicherung",
              body: "Guten Tag Frau Keller, anbei der unterschriebene Antrag. Freundliche Grüsse, Monika Widmer",
            },
            { afterDays: 13, status: "won", advisor: "sandra" },
          ],
        },
      },
      {
        key: "begunstigung-studium",
        daysAgo: 366,
        hour: 16,
        title: "Begünstigung 3a und Studium der Tochter",
        locale: "de",
        status: "completed",
        stage: "situation_captured",
        messages: [
          {
            role: "assistant",
            text: "Grüezi Frau Widmer, danke für Ihre Antwort auf unseren Vorsorge-Check. Was möchten Sie anschauen?",
          },
          {
            role: "user",
            text: "Meine Tochter Lea beginnt im Herbst in Zürich zu studieren und ist im Sommer 2029 fertig. Muss ich bei der Begünstigung meiner 3a etwas ändern?",
          },
          {
            role: "assistant",
            text: "In der Säule 3a ist die Reihenfolge der Begünstigten gesetzlich vorgegeben; als Geschiedene ist Lea als Ihr Kind bereits begünstigt. Ändern müssen Sie nur etwas, wenn Sie innerhalb der erlaubten Reihenfolge andere Anteile festlegen möchten.",
          },
          { role: "user", text: "Gut zu wissen, dann lasse ich es so. Danke!" },
        ],
        analysis: {
          topics: ["pillar3a", "family_children"],
          lifeEvents: [],
          productInterest: [],
          intentStage: "informing",
          sentiment: "positive",
          painPoints: [],
          gaps: [],
          summary:
            "Antwort auf den jährlichen Vorsorge-Check: Frage zur Begünstigung der 3a; Tochter Lea studiert ab Herbst in Zürich bis Sommer 2029. Kein Handlungsbedarf.",
          nextBestAction: "Beim nächsten Check-in nach Lohn und Pensum fragen.",
        },
        feedback: { nps: 9 },
      },
    ],
    events: [
      {
        conversation: "begunstigung-studium",
        kind: "end_of_studies",
        subject: "Tochter Lea",
        when: { expression: "im Sommer 2029" },
        quote:
          "Meine Tochter Lea beginnt im Herbst in Zürich zu studieren und ist im Sommer 2029 fertig.",
        note: "Lea schliesst das Studium ab: Begünstigungen und Bedarf bei Tod und Erwerbsunfähigkeit neu prüfen.",
        confidence: 0.8,
      },
    ],
    lastCheckin: {
      daysAgo: 368,
      subject: "Ihr jährlicher Vorsorge-Check: Passt noch alles?",
      body: "Grüezi Frau Widmer\n\nEin Jahr ist schnell vorbei. Hat sich bei Ihnen etwas verändert, zum Beispiel bei der Arbeit, beim Lohn oder in der Familie? Antworten Sie einfach auf diese E-Mail oder schreiben Sie unserem digitalen Berater.\n\nFreundliche Grüsse\nIhr Pax-Team",
      reply:
        "Guten Tag, Lea beginnt im Herbst zu studieren. Ich schaue das gleich im Chat an. Gruss, Monika Widmer",
    },
  },
];

// ─── Writing ────────────────────────────────────────────────────────────────

function insertConversation(
  db: Db,
  ctx: { customerId: string; email: string; ruleSetId: string; ruleIds: string[] },
  advisorId: (key: AdvisorKey) => string,
  conv: SeedConversation,
): string {
  const start = stamp(conv.daysAgo, conv.hour);
  const at = (i: number) => new Date(start.getTime() + i * 90_000);
  const last = at(conv.messages.length - 1);
  const after = (days: number, minutes = 0) =>
    new Date(last.getTime() + days * 86_400_000 + minutes * 60_000);

  const [conversation] = db
    .insert(schema.conversations)
    .values({
      customerId: ctx.customerId,
      locale: conv.locale,
      mode: "existing_customer",
      status: conv.status,
      stage: conv.stage,
      title: conv.title,
      ruleSetId: ctx.ruleSetId,
      messageCount: conv.messages.length,
      createdAt: at(0),
      lastMessageAt: last,
    })
    .returning()
    .all();
  db.insert(schema.messages)
    .values(
      conv.messages.map((m, i) => ({
        id: crypto.randomUUID(),
        conversationId: conversation.id,
        role: m.role,
        parts: [{ type: "text", text: m.text }],
        inputMode: m.role === "user" ? (m.voice ? ("voice" as const) : ("text" as const)) : null,
        createdAt: at(i),
      })),
    )
    .run();

  const handoverRuleIds = (conv.handover?.rules ?? []).map((i) => ctx.ruleIds[i]);
  db.insert(schema.analyses)
    .values({
      conversationId: conversation.id,
      ...conv.analysis,
      handover: {
        required: Boolean(conv.handover),
        ruleIds: handoverRuleIds,
        reason: conv.handover?.reason ?? null,
      },
      model: "seed",
      ruleSetId: ctx.ruleSetId,
      messageCountAnalyzed: conv.messages.length,
      updatedAt: after(0, 1),
    })
    .run();

  if (conv.recommendation) {
    db.insert(schema.recommendations)
      .values({
        ...conv.recommendation,
        conversationId: conversation.id,
        customerId: ctx.customerId,
        ruleSetId: ctx.ruleSetId,
        model: "seed",
        createdAt: at(conv.messages.length - 2),
      })
      .run();
  }
  if (conv.feedback) {
    db.insert(schema.feedback)
      .values({
        conversationId: conversation.id,
        customerId: ctx.customerId,
        nps: conv.feedback.nps,
        comment: conv.feedback.comment ?? null,
        createdAt: after(0, 1),
      })
      .run();
  }

  let handoverId: string | null = null;
  if (conv.handover) {
    const h = conv.handover;
    let status: HandoverStatus = "open";
    let assigned: string | null = null;
    const updates = (h.updates ?? []).map((u) => {
      const from = { status, assignedAdvisorId: assigned };
      const to: Record<string, unknown> = {};
      if (u.status) {
        status = u.status;
        to.status = status;
      }
      if (u.assign) {
        assigned = advisorId(u.assign);
        to.assignedAdvisorId = assigned;
      }
      return {
        advisor: u.advisor,
        data: { from, to },
        createdAt: office(conv.daysAgo, u.afterDays, 0),
      };
    });
    const [row] = db
      .insert(schema.handovers)
      .values({
        conversationId: conversation.id,
        customerId: ctx.customerId,
        reason: h.reason,
        ruleIds: handoverRuleIds,
        urgency: h.urgency,
        preferredChannel: h.channel,
        preferredTime: h.time,
        status,
        assignedAdvisorId: assigned,
        createdAt: last,
      })
      .returning()
      .all();
    handoverId = row.id;
    const audits: Array<typeof schema.auditLog.$inferInsert> = updates.map((u) => ({
      actorType: "advisor",
      actorId: advisorId(u.advisor),
      action: "handover.updated",
      entityType: "handover",
      entityId: row.id,
      data: u.data,
      createdAt: u.createdAt,
    }));
    if (h.email) {
      audits.push({
        actorType: "advisor",
        actorId: advisorId(h.email.advisor),
        action: "email.sent",
        entityType: "handover",
        entityId: row.id,
        data: {
          subject: h.email.subject,
          body: h.email.body,
          to: ctx.email,
          direction: "outbound",
        },
        createdAt: office(conv.daysAgo, h.email.afterDays, 1),
      });
    }
    if (audits.length > 0) db.insert(schema.auditLog).values(audits).run();
  }

  if (conv.lead) insertLead(db, ctx, advisorId, conv, conversation.id, handoverId, after);
  return conversation.id;
}

function insertLead(
  db: Db,
  ctx: { customerId: string },
  advisorId: (key: AdvisorKey) => string,
  conv: SeedConversation,
  conversationId: string,
  handoverId: string | null,
  after: (days: number, minutes?: number) => Date,
): void {
  const lead = conv.lead as SeedLead;
  const handover = handoverId && conv.handover ? { urgency: conv.handover.urgency } : null;
  const { score, breakdown } = scoreLead({
    type: lead.type,
    intentStage: conv.analysis.intentStage,
    gaps: conv.analysis.gaps,
    productInterest: lead.productInterest,
    lifecycle: "client",
    hasContactDetails: true,
    stage: conv.stage,
    mode: "existing_customer",
    handover: handover ? { required: true, ...handover } : null,
  });
  const priority = leadPriority(score, handover);
  const steps = lead.steps ?? [];
  const finalStatus = steps.reduce<LeadStatus>(
    (status, s) => ("status" in s ? s.status : status),
    "new",
  );
  const [row] = db
    .insert(schema.leads)
    .values({
      customerId: ctx.customerId,
      conversationId,
      type: lead.type,
      status: finalStatus,
      score,
      scoreBreakdown: breakdown,
      priority,
      reasonToCall: lead.reasonToCall,
      talkingPoints: lead.talkingPoints,
      productInterest: lead.productInterest,
      assignedAdvisorId: lead.advisor ? advisorId(lead.advisor) : null,
      nextActionAt:
        lead.nextActionInDays !== undefined
          ? new Date(`${addDays(today, lead.nextActionInDays - conv.daysAgo)}T08:00:00Z`)
          : null,
      createdAt: after(0, 2),
    })
    .returning()
    .all();

  const activities: Array<typeof schema.leadActivities.$inferInsert> = [
    {
      leadId: row.id,
      type: "system",
      data: { event: "created", score, priority },
      createdAt: after(0, 2),
    },
  ];
  let status: LeadStatus = "new";
  let assigned: string | null = null;
  steps.forEach((s, i) => {
    const createdAt = office(conv.daysAgo, s.afterDays, i);
    if ("assign" in s) {
      const to = advisorId(s.assign);
      activities.push({
        leadId: row.id,
        advisorId: to,
        type: "system",
        data: { event: "assigned", from: assigned, to },
        createdAt,
      });
      assigned = to;
    } else if ("status" in s) {
      activities.push({
        leadId: row.id,
        advisorId: advisorId(s.advisor),
        type: "status_change",
        data: { from: status, to: s.status },
        createdAt,
      });
      status = s.status;
    } else {
      activities.push({
        leadId: row.id,
        advisorId: s.advisor ? advisorId(s.advisor) : null,
        type: s.activity,
        body: s.body,
        data:
          s.activity === "email"
            ? { subject: s.subject, body: s.body, direction: s.direction ?? "outbound" }
            : { direction: s.direction ?? "outbound" },
        createdAt,
      });
    }
  });
  db.insert(schema.leadActivities).values(activities).run();
}

function insertEvent(
  db: Db,
  customerId: string,
  conversations: Map<string, { id: string; day: string }>,
  event: SeedEvent,
): void {
  const source = conversations.get(event.conversation);
  if (!source) throw new Error(`Unknown conversation ${event.conversation}`);
  const resolved =
    "expression" in event.when
      ? resolveExpression(event.when.expression, null, source.day)
      : event.when;
  if (!resolved) throw new Error(`Cannot resolve the date of "${event.quote}"`);
  db.insert(schema.futureEvents)
    .values({
      customerId,
      conversationId: source.id,
      kind: event.kind,
      subject: event.subject,
      expectedDate: resolved.date,
      precision: resolved.precision,
      confidence: event.confidence,
      sourceQuote: event.quote,
      note: event.note,
      createdAt: new Date(`${source.day}T23:00:00Z`),
    })
    .run();
}

/** Returns the number of personas seeded; skips any whose e-mail address already exists. */
export function seedPersonas(db: Db): number {
  const advisors = db.select().from(schema.advisors).all();
  const advisorId = (key: AdvisorKey) => {
    const advisor = advisors.find((a) => a.email === ADVISOR_EMAIL[key]);
    if (!advisor) throw new Error(`Advisor ${key} missing: run the main seed first`);
    return advisor.id;
  };
  const ruleSet = db.select().from(schema.ruleSets).where(eq(schema.ruleSets.isActive, true)).get();
  if (!ruleSet) throw new Error("No active rule set: run the main seed first");
  const ruleIds = db
    .select({ id: schema.rules.id })
    .from(schema.rules)
    .where(eq(schema.rules.ruleSetId, ruleSet.id))
    .orderBy(asc(schema.rules.position))
    .all()
    .map((r) => r.id);

  let seeded = 0;
  for (const persona of PERSONAS) {
    const sim = DEMO_PERSONAS[persona.key];
    const email = personaEmail(sim);
    if (db.select().from(schema.customers).where(eq(schema.customers.email, email)).get()) {
      continue;
    }
    db.transaction((tx) => {
      const since = stamp(persona.clientSinceDays, 8);
      const [customer] = tx
        .insert(schema.customers)
        .values({
          lifecycle: "client",
          firstName: sim.firstName,
          lastName: sim.lastName,
          email,
          phone: persona.phone,
          birthDate: persona.birthDate,
          locale: sim.locale,
          isDemo: true,
          createdAt: since,
          updatedAt: since,
        })
        .returning()
        .all();
      const profile = lifeSituationSchema.parse(persona.profile(baseProfile(sim)));
      tx.insert(schema.profiles)
        .values({
          customerId: customer.id,
          data: profile,
          completeness: profileCompleteness(profile),
        })
        .run();
      tx.insert(schema.policies)
        .values(
          persona.policies.map((p) => ({
            createdAt: since,
            ...p,
            customerId: customer.id,
          })),
        )
        .run();

      const ctx = { customerId: customer.id, email, ruleSetId: ruleSet.id, ruleIds };
      const conversations = new Map<string, { id: string; day: string }>();
      for (const conv of persona.conversations) {
        const id = insertConversation(tx, ctx, advisorId, conv);
        conversations.set(conv.key, { id, day: day(conv.daysAgo) });
      }
      for (const event of persona.events) insertEvent(tx, customer.id, conversations, event);

      if (persona.checkinOptOut) {
        const at = stamp(persona.clientSinceDays - 1, 19);
        tx.insert(schema.contactPreferences)
          .values({
            customerId: customer.id,
            yearlyCheckin: false,
            updatedBy: "customer",
            updatedAt: at,
          })
          .run();
        tx.insert(schema.auditLog)
          .values({
            actorType: "customer",
            actorId: customer.id,
            action: "checkin.opted_out",
            entityType: "customer",
            entityId: customer.id,
            createdAt: at,
          })
          .run();
      }

      if (persona.lastCheckin) {
        const c = persona.lastCheckin;
        const sentAt = stamp(c.daysAgo, 7);
        const [outbox] = tx
          .insert(schema.outboxEmails)
          .values({
            customerId: customer.id,
            kind: "yearly_checkin",
            toAddress: email,
            locale: sim.locale,
            subject: c.subject,
            body: c.body,
            sentOn: day(c.daysAgo),
            repliedAt: stamp(c.daysAgo - 1, 17),
            model: "seed",
            createdAt: sentAt,
          })
          .returning()
          .all();
        // Shown in the customer view's contact log, like the engine's own check-in e-mails.
        tx.insert(schema.auditLog)
          .values([
            {
              actorType: "system",
              action: "email.sent",
              entityType: "customer",
              entityId: customer.id,
              data: {
                subject: c.subject,
                body: c.body,
                to: email,
                direction: "outbound",
                outboxId: outbox.id,
                sequence: 1,
                sentOn: day(c.daysAgo),
                kind: "yearly_checkin",
              },
              createdAt: sentAt,
            },
            {
              actorType: "customer",
              actorId: customer.id,
              action: "email.received",
              entityType: "customer",
              entityId: customer.id,
              data: { subject: `AW: ${c.subject}`, body: c.reply, direction: "inbound" },
              createdAt: stamp(c.daysAgo - 1, 17),
            },
          ])
          .run();
      }
    });
    seeded++;
  }
  return seeded;
}

/**
 * Seeds advisors, the first company rule set and the demo existing customers (personas from
 * documentation/challenge_context/material/personas.pdf). Idempotent: does nothing if advisors exist.
 * Run: pnpm db:seed   (or pnpm db:reset to start from an empty database)
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@/lib/db/schema";
import { type LifeSituation, lifeSituationSchema, profileCompleteness } from "@/lib/domain/profile";
import { seedFollowUps } from "./seed-follow-ups";
import { seedPersonas } from "./seed-personas";

const dataDir = process.env.DATA_DIR ?? "./data";
mkdirSync(dataDir, { recursive: true });
const sqlite = new Database(path.join(dataDir, "pax.db"));
sqlite.pragma("foreign_keys = ON");
const db = drizzle(sqlite, { schema });
migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });

if (db.select().from(schema.advisors).all().length > 0) {
  console.log("Already seeded.");
  process.exit(0);
}

const advisors = db
  .insert(schema.advisors)
  .values([
    { name: "Sandra Keller", email: "sandra.keller@example.ch", team: "Basel" },
    { name: "Marco Bernasconi", email: "marco.bernasconi@example.ch", team: "Ticino" },
    { name: "Léa Dubois", email: "lea.dubois@example.ch", team: "Romandie" },
  ])
  .returning()
  .all();

const [ruleSet] = db
  .insert(schema.ruleSets)
  .values({
    version: 1,
    isActive: true,
    createdByAdvisorId: advisors[0].id,
    leadHints:
      "Gute Leads: Familien mit kleinen Kindern und einer Lücke bei Tod oder Erwerbsunfähigkeit; " +
      "Personen zwischen 30 und 50 mit ungenutztem 3a-Potenzial; Bestandskundinnen und -kunden mit " +
      "einem neuen Lebensereignis (Geburt, Hauskauf, Heirat); Personen mit einer teuren Fremdpolice " +
      "(Wechselpotenzial). Weniger relevant: reine Informationsfragen ohne persönliche Situation.",
  })
  .returning()
  .all();

const ruleTexts: Array<Pick<typeof schema.rules.$inferInsert, "text" | "action" | "productCode">> =
  [
    {
      action: "handover",
      text: "Vermögen über CHF 300'000 oder komplexe Vermögensverhältnisse: persönliche Beratung durch eine Fachperson anbieten.",
    },
    {
      action: "handover",
      text: "Selbstständigerwerbende sowie Personen mit Grenzgänger- oder Auslandsbezug: persönliche Beratung anbieten.",
    },
    {
      action: "handover",
      text: "Gesundheitliche Vorbelastungen oder eine laufende Arbeitsunfähigkeit: keine Risiko-Offerte im Chat, persönliche Beratung anbieten.",
    },
    {
      action: "handover",
      text: "Wenn jemand ausdrücklich mit einer Person sprechen möchte: sofort einen Rückruf anbieten.",
    },
    {
      action: "flag",
      text: "Anlageprodukte (LifeStar, FondsStar, Auszahlungsplan) nur nach abgeschlossener Angemessenheitsprüfung empfehlen.",
    },
    {
      action: "flag",
      text: "Personen ab 58, die zwischen Kapitalbezug und Rente entscheiden: für eine Fachberatung markieren.",
    },
    {
      action: "block_product",
      productCode: "kinderversicherung",
      text: "Keine Kinderversicherung empfehlen, solange die Eltern selbst bei Tod oder Erwerbsunfähigkeit eine Lücke haben.",
    },
  ];
db.insert(schema.rules)
  .values(ruleTexts.map((r, position) => ({ ...r, ruleSetId: ruleSet.id, position })))
  .run();

interface DemoCustomer {
  customer: typeof schema.customers.$inferInsert;
  profile: LifeSituation;
  policies: Array<Omit<typeof schema.policies.$inferInsert, "customerId">>;
}

const demo: DemoCustomer[] = [
  {
    customer: {
      lifecycle: "client",
      firstName: "Jane",
      lastName: "Müller",
      email: "jane.mueller@example.ch",
      phone: "+41 79 000 00 01",
      birthDate: "1986-06-01",
      isDemo: true,
    },
    profile: lifeSituationSchema.parse({
      person: {
        firstName: "Jane",
        birthYear: 1986,
        sex: "female",
        maritalStatus: "married",
        employment: "homemaker",
        workloadPercent: 0,
        grossIncome: 0,
      },
      partner: {
        firstName: "May",
        birthYear: 1984,
        sex: "male",
        maritalStatus: "married",
        employment: "employed",
        workloadPercent: 100,
        grossIncome: 100000,
      },
      children: [{ birthYear: 2026 }],
      residence: { zip: "4053", city: "Basel", canton: "BS", taxLocationId: 405300000 },
      assets: { total: 20000 },
      pillar2: { hasPensionFund: false },
      goals: ["protect_family"],
      concerns: [],
    }),
    policies: [
      {
        policyNumber: "PAX-TF-2024-118734",
        category: "risk_death",
        productCode: "todesfall",
        productName: "Pax Todesfallversicherung",
        pillar: "3b",
        insuredPerson: "May Müller",
        startDate: "2024-01-01",
        endDate: "2049-09-30",
        premiumAnnual: 1384.8,
        sumInsured: 150000,
        source: "seed",
      },
    ],
  },
  {
    customer: {
      lifecycle: "client",
      firstName: "Lily",
      lastName: "Smith",
      email: "lily.smith@example.ch",
      phone: "+41 79 000 00 02",
      birthDate: "1976-08-08",
      isDemo: true,
    },
    profile: lifeSituationSchema.parse({
      person: {
        firstName: "Lily",
        birthYear: 1976,
        sex: "female",
        maritalStatus: "married",
        employment: "employed",
        workloadPercent: 80,
        grossIncome: 80000,
      },
      partner: {
        firstName: "Wilson",
        birthYear: 1967,
        sex: "male",
        maritalStatus: "married",
        employment: "employed",
        workloadPercent: 100,
        grossIncome: 200000,
      },
      residence: { zip: "4125", city: "Riehen", canton: "BS" },
      assets: { total: 500000 },
      pillar2: { hasPensionFund: true },
      pillar3a: { annualContribution: 7258 },
      goals: ["retire_comfortably"],
    }),
    policies: [
      {
        policyNumber: "PAX-LS-2015-044120",
        category: "pillar3a",
        productCode: "lifestar",
        productName: "Pax LifeStar (3a)",
        pillar: "3a",
        insuredPerson: "Wilson Smith",
        startDate: "2015-01-01",
        endDate: "2032-09-30",
        premiumAnnual: 7258,
        sumInsured: 120000,
        source: "seed",
      },
      {
        policyNumber: "PAX-LS-2018-061877",
        category: "pillar3a",
        productCode: "lifestar",
        productName: "Pax LifeStar (3a)",
        pillar: "3a",
        insuredPerson: "Lily Smith",
        startDate: "2018-01-01",
        endDate: "2041-08-31",
        premiumAnnual: 7258,
        sumInsured: 95000,
        source: "seed",
      },
    ],
  },
  {
    customer: {
      lifecycle: "client",
      firstName: "Taylor",
      lastName: "Johnson",
      email: "taylor.johnson@example.ch",
      phone: "+41 79 000 00 03",
      birthDate: "1995-09-16",
      isDemo: true,
    },
    profile: lifeSituationSchema.parse({
      person: {
        firstName: "Taylor",
        birthYear: 1995,
        sex: "male",
        maritalStatus: "single",
        employment: "employed",
        workloadPercent: 90,
        grossIncome: 100000,
      },
      residence: { zip: "8004", city: "Zürich", canton: "ZH" },
      assets: { total: 500000 },
      pillar2: { hasPensionFund: true },
      pillar3a: { balance: 45000, annualContribution: 7258 },
      goals: ["buy_home", "build_wealth"],
    }),
    policies: [
      {
        policyNumber: "PAX-3A-2021-230051",
        category: "pillar3a",
        productCode: "pax3a",
        productName: "Pax 3a",
        pillar: "3a",
        insuredPerson: "Taylor Johnson",
        startDate: "2021-03-01",
        endDate: "2060-09-30",
        premiumAnnual: 7258,
        source: "seed",
      },
    ],
  },
];

for (const { customer, profile, policies } of demo) {
  const [row] = db.insert(schema.customers).values(customer).returning().all();
  db.insert(schema.profiles)
    .values({ customerId: row.id, data: profile, completeness: profileCompleteness(profile) })
    .run();
  db.insert(schema.policies)
    .values(policies.map((p) => ({ ...p, customerId: row.id })))
    .run();
}

const futureEvents = seedFollowUps(db);
const personas = seedPersonas(db);

console.log(
  `Seeded ${advisors.length} advisors, rule set v1, ${demo.length} demo customers, ${futureEvents} future events, ${personas} pitch personas.`,
);

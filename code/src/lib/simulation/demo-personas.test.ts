import path from "node:path";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { addDays, addMonths, toIsoDate } from "@/lib/documents/dates";
import { lifeSituationSchema } from "@/lib/domain/profile";
import { DEFAULT_FOLLOW_UP_CONFIG, isCheckinDue, planEvent } from "@/lib/followups/plan";
import { PERSONA_SCENARIOS } from "../../../scripts/persona-scenarios";
import { seedPersonas } from "../../../scripts/seed-personas";
import { DEMO_PERSONAS, demoCast } from "./demo-personas";
import { createRng, DEMO_PERSONA_KEYS, MATERIAL_PERSONAS, materialPersona } from "./personas";
import { customerInstructions } from "./prompt";

function seededDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  db.insert(schema.advisors)
    .values([
      { name: "Sandra Keller", email: "sandra.keller@example.ch", team: "Basel" },
      { name: "Marco Bernasconi", email: "marco.bernasconi@example.ch", team: "Ticino" },
      { name: "Léa Dubois", email: "lea.dubois@example.ch", team: "Romandie" },
    ])
    .run();
  const ruleSet = db
    .insert(schema.ruleSets)
    .values({ version: 1, isActive: true })
    .returning()
    .get();
  db.insert(schema.rules)
    .values(
      Array.from({ length: 7 }, (_, position) => ({
        ruleSetId: ruleSet.id,
        text: `Rule ${position}`,
        action: "handover" as const,
        position,
      })),
    )
    .run();
  return db;
}

describe("demo personas", () => {
  it("has one simulated customer per key with a story", () => {
    for (const key of DEMO_PERSONA_KEYS) {
      const p = DEMO_PERSONAS[key];
      expect(p.source).toBe(`demo:${key}`);
      expect(p.mode).toBe("existing_customer");
      expect(p.story?.reveals.length).toBeGreaterThan(2);
    }
    expect(demoCast(["home_saver", "student_first_job"]).map((p) => p.firstName)).toEqual([
      "Selin",
      "Lena",
    ]);
  });

  it("uses first names no other demo client has (the simulation copies the CRM by first name)", () => {
    const rng = createRng(1);
    const names = [
      ...MATERIAL_PERSONAS.map((k) => materialPersona(rng, k).firstName),
      ...DEMO_PERSONA_KEYS.map((k) => DEMO_PERSONAS[k].firstName),
    ];
    expect(new Set(names).size).toBe(names.length);
  });

  it("puts the story into the simulated customer's instructions", () => {
    const text = customerInstructions(DEMO_PERSONAS.pension_or_lump_sum, 2026);
    expect(text).toContain("Muster Chemie AG");
    expect(text).toContain("CHF 610'000");
    expect(text).toContain("from your last pension certificate");
    expect(text).not.toContain("does not know the exact figures");
    expect(customerInstructions(DEMO_PERSONAS.student_first_job, 2026)).toContain(
      "Student with a side job",
    );
  });

  it("has a converse scenario per persona that starts as its demo client", () => {
    expect(PERSONA_SCENARIOS.map((s) => s.personaKey).sort()).toEqual(
      [...DEMO_PERSONA_KEYS].sort(),
    );
    for (const s of PERSONA_SCENARIOS) {
      expect(s.demoClient).toBe(DEMO_PERSONAS[s.personaKey].firstName);
      expect(s.persona).toContain(DEMO_PERSONAS[s.personaKey].lastName);
    }
  });
});

describe("seeded pitch personas", () => {
  const db = seededDb();
  const seeded = seedPersonas(db);
  const today = toIsoDate(new Date());
  const customers = db.select().from(schema.customers).all();
  const byName = (firstName: string) => {
    const c = customers.find((x) => x.firstName === firstName);
    if (!c) throw new Error(`${firstName} missing`);
    return c;
  };

  it("seeds every persona once, as a demo client with a valid profile", () => {
    expect(seeded).toBe(DEMO_PERSONA_KEYS.length);
    expect(seedPersonas(db)).toBe(0);
    expect(customers.filter((c) => c.isDemo && c.lifecycle === "client")).toHaveLength(seeded);
    for (const profile of db.select().from(schema.profiles).all()) {
      expect(() => lifeSituationSchema.parse(profile.data)).not.toThrow();
    }
  });

  it("matches the simulated twin's facts", () => {
    for (const key of DEMO_PERSONA_KEYS) {
      const sim = DEMO_PERSONAS[key];
      const customer = byName(sim.firstName);
      expect(customer.locale).toBe(sim.locale);
      const profile = db
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.customerId, customer.id))
        .get();
      const data = lifeSituationSchema.parse(profile?.data);
      expect(data.person.birthYear).toBe(sim.birthYear);
      // Monika's raise is news for the check-in chat: the CRM still has the old salary.
      expect(data.person.grossIncome).toBe(key === "yearly_checkin" ? 78_000 : sim.grossIncome);
      expect(data.residence.zip).toBe(sim.zip);
      expect(data.children.map((c) => c.birthYear)).toEqual(sim.childrenBirthYears);
      expect(data.pillar3a.balance ?? null).toBe(sim.pillar3aBalance);
    }
  });

  it("keeps message counts, analyses and leads consistent", () => {
    for (const c of db.select().from(schema.conversations).all()) {
      const messages = db
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.conversationId, c.id))
        .all();
      expect(messages).toHaveLength(c.messageCount);
      const analysis = db
        .select()
        .from(schema.analyses)
        .where(eq(schema.analyses.conversationId, c.id))
        .get();
      expect(analysis?.messageCountAnalyzed).toBe(c.messageCount);
    }
    const handovers = db.select().from(schema.handovers).all();
    expect(handovers.map((h) => h.status).sort()).toEqual(["open", "open", "scheduled"]);
    expect(db.select().from(schema.leads).all()).toHaveLength(6);
  });

  it("makes the student's first job a Wiedervorlage only after time travel", () => {
    const event = db
      .select()
      .from(schema.futureEvents)
      .where(eq(schema.futureEvents.customerId, byName("Lena").id))
      .get();
    expect(event?.kind).toBe("first_job");
    const state = {
      status: "upcoming" as const,
      expectedDate: event?.expectedDate ?? "",
      emails: [],
      cameBack: false,
    };
    expect(planEvent(state, today, DEFAULT_FOLLOW_UP_CONFIG)).toBeNull();
    expect(planEvent(state, addMonths(today, 6), DEFAULT_FOLLOW_UP_CONFIG)).toEqual({
      type: "open",
    });
  });

  it("dates Camille's contract end on the policy's end, within the next months", () => {
    const camille = byName("Camille");
    const policy = db
      .select()
      .from(schema.policies)
      .where(eq(schema.policies.customerId, camille.id))
      .all()
      .find((p) => p.category === "risk_death");
    const event = db
      .select()
      .from(schema.futureEvents)
      .where(eq(schema.futureEvents.customerId, camille.id))
      .get();
    expect(event?.expectedDate).toBe(policy?.endDate);
    expect((policy?.endDate ?? "") > addMonths(today, 2)).toBe(true);
    expect((policy?.endDate ?? "") < addMonths(today, 5)).toBe(true);
  });

  it("makes only Monika's yearly check-in due today; Hans-Peter opted out", () => {
    const prefs = db.select().from(schema.contactPreferences).all();
    const lastSent = db.select().from(schema.outboxEmails).all();
    const due = customers.filter((c) =>
      isCheckinDue(
        {
          enabled: prefs.find((p) => p.customerId === c.id)?.yearlyCheckin ?? true,
          hasEmail: Boolean(c.email),
          lastSentOn: lastSent.find((e) => e.customerId === c.id)?.sentOn ?? null,
          since: toIsoDate(c.createdAt),
        },
        today,
      ),
    );
    expect(due.map((c) => c.firstName)).toEqual(["Monika"]);
    expect(prefs.find((p) => p.customerId === byName("Hans-Peter").id)?.yearlyCheckin).toBe(false);
    expect(addDays(lastSent[0].sentOn, 365) <= today).toBe(true);
  });
});

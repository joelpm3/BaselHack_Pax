import "server-only";
import { tool } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import {
  childSchema,
  employmentSchema,
  goalSchema,
  type LifeSituation,
  maritalStatusSchema,
  plannedEventSchema,
  privateCoverSchema,
  profileCompleteness,
  sexSchema,
} from "@/lib/domain/profile";
import { applyProfileChanges, getProfile, type ProfileChange } from "@/lib/profile/service";
import { resolveResidence } from "../location";
import { hasRiskPolicies } from "../policies";
import { replacedFacts } from "../profile-diff";
import { type AnalysisReadiness, analysisReadiness } from "../readiness";
import { endPolicies, saveStatedPolicies } from "../stated-policies";
import { statedPolicySchema } from "../stated-policy-row";
import type { ResidencePlace, UpdateProfileOutput } from "../types";
import type { ToolContext } from "./context";

const chf = (what: string) => z.number().min(0).describe(`${what}, CHF per year`);

const personInput = z.object({
  firstName: z.string().min(1).optional(),
  birthYear: z.number().int().min(1920).max(2030).optional(),
  sex: sexSchema.optional().describe("Only when clear from how the person refers to themselves"),
  maritalStatus: maritalStatusSchema.optional(),
  employment: employmentSchema.optional(),
  workloadPercent: z.number().min(0).max(100).optional(),
  grossIncome: chf("Gross salary (monthly × 12, or × 13 with a 13th salary)").optional(),
  occupation: z.string().optional(),
  smoker: z.boolean().optional(),
  healthNotes: z.string().optional().describe("Only what the customer volunteered"),
});

const pillar2Input = z.object({
  hasPensionFund: z.boolean().optional(),
  insuredSalary: chf("Insured salary").optional(),
  currentCapital: z.number().min(0).optional().describe("Current retirement savings, CHF"),
  projectedCapitalAtRetirement: z.number().min(0).optional(),
  projectedPensionAtRetirement: chf("Projected retirement pension").optional(),
  disabilityPension: chf("Disability pension").optional(),
  partnerPension: chf("Spouse/partner pension").optional(),
  childPension: chf("Child/orphan pension per child").optional(),
  deathLumpSum: z.number().min(0).optional(),
  maxBuyIn: z.number().min(0).optional().describe("Maximum possible buy-in, CHF"),
});

export const updateProfileInput = z.object({
  person: personInput
    .optional()
    .describe(
      "The customer: the person writing to you ('ich', 'mein Lohn'). Never the partner's facts.",
    ),
  partner: personInput
    .extend({
      pillar2: pillar2Input
        .optional()
        .describe("The partner's own pension fund, e.g. from their pension certificate"),
    })
    .optional()
    .describe(
      "The customer's spouse or partner ('meine Frau', 'mein Mann', 'sie/er'). Never the customer's own facts.",
    ),
  removePartner: z.boolean().optional().describe("True after a separation or bereavement"),
  children: z
    .array(childSchema)
    .optional()
    .describe("The COMPLETE list of children; replaces what is stored"),
  residence: z
    .object({ zip: z.string().optional(), city: z.string().optional() })
    .optional()
    .describe(
      "Place of residence exactly as the customer said it (never add a town to a postcode " +
        "yourself); resolved from the official locality directory",
    ),
  assets: z
    .object({
      liquid: z.number().min(0).optional().describe("Savings accounts, CHF"),
      securities: z.number().min(0).optional().describe("Securities, CHF"),
      realEstateValue: z.number().min(0).optional(),
      mortgage: z.number().min(0).optional(),
      total: z.number().optional().describe("Net wealth when only a total is given, CHF"),
    })
    .optional(),
  pillar1: z.object({ contributionGapYears: z.number().int().min(0).optional() }).optional(),
  pillar2: pillar2Input.optional().describe("The customer's own pension fund"),
  pillar3a: z
    .object({
      balance: z.number().min(0).optional(),
      annualContribution: chf("Yearly 3a contribution").optional(),
    })
    .optional(),
  addGoals: z.array(goalSchema).optional().describe("Goals to add (kept with existing ones)"),
  addConcerns: z
    .array(z.string().min(2))
    .optional()
    .describe("Worries in the customer's own words, short"),
  addPlannedEvents: z.array(plannedEventSchema).optional(),
  riskAttitude: z.enum(["low", "medium", "high"]).optional(),
  desiredRetirementAge: z.number().int().min(55).max(70).optional(),
  privateCover: privateCoverSchema
    .optional()
    .describe(
      "Does the customer or partner already have private death or disability insurance (Pax or another insurer)? yes / no / unknown (they don't know)",
    ),
  addPolicies: z
    .array(statedPolicySchema)
    .max(6)
    .optional()
    .describe(
      "Death, disability or insurance-based 3a policies the customer says they or their partner already have (insurer may be unknown): new ones, or amounts, end date or notice for one stored from the chat earlier (same insurer, type and person updates it)",
    ),
  endPolicies: z
    .array(
      z.object({
        policy: z.string().min(1).describe("The [reference] of a policy under 'Policies on file'"),
        endDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .describe("Last day of cover, e.g. 2026-12-31"),
        cancelled: z.boolean().optional().describe("True when the customer has given notice"),
      }),
    )
    .max(6)
    .optional()
    .describe(
      "A policy on file that the customer cancelled or that ends: its premiums and cover stop after endDate",
    ),
  monthlySpending: z.number().min(0).optional().describe("Rough household spending, CHF PER MONTH"),
  monthlySavings: z
    .number()
    .min(0)
    .optional()
    .describe("What the customer can put aside, CHF PER MONTH"),
  contact: z
    .object({
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      email: z.email().optional(),
      phone: z.string().min(6).optional(),
    })
    .optional()
    .describe("Only when the customer gives contact details themselves"),
});
export type UpdateProfileInput = z.infer<typeof updateProfileInput>;

function flatten(prefix: string, values: Record<string, unknown> | undefined): ProfileChange[] {
  if (!values) return [];
  return Object.entries(values)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ({ path: `${prefix}.${key}`, value }));
}

/** The partner's pension fund is nested: each figure is its own change, never the whole object. */
function partnerChanges(partner: UpdateProfileInput["partner"]): ProfileChange[] {
  if (!partner) return [];
  const { pillar2, ...person } = partner;
  return [...flatten("partner", person), ...flatten("partner.pillar2", pillar2)];
}

function union<T>(existing: T[], added: T[] | undefined, key: (v: T) => string): T[] | undefined {
  if (!added?.length) return undefined;
  const seen = new Set(existing.map(key));
  const next = [...existing];
  for (const item of added) {
    if (seen.has(key(item))) continue;
    seen.add(key(item));
    next.push(item);
  }
  return next.length === existing.length ? undefined : next;
}

/** Turns the tool input into dot-path changes for applyProfileChanges. */
export function toProfileChanges(
  input: UpdateProfileInput,
  current: LifeSituation,
): ProfileChange[] {
  const changes: ProfileChange[] = [
    ...flatten("person", input.person),
    ...(input.removePartner ? [{ path: "partner", value: null }] : partnerChanges(input.partner)),
    ...flatten("assets", input.assets),
    ...flatten("pillar1", input.pillar1),
    ...flatten("pillar2", input.pillar2),
    ...flatten("pillar3a", input.pillar3a),
  ];
  if (input.children) changes.push({ path: "children", value: input.children });
  const goals = union(current.goals, input.addGoals, (g) => g);
  if (goals) changes.push({ path: "goals", value: goals });
  const concerns = union(current.concerns, input.addConcerns, (c) => c.toLowerCase());
  if (concerns) changes.push({ path: "concerns", value: concerns });
  const events = union(current.plannedEvents, input.addPlannedEvents, (e) => `${e.type}:${e.year}`);
  if (events) changes.push({ path: "plannedEvents", value: events });
  if (input.riskAttitude) changes.push({ path: "riskAttitude", value: input.riskAttitude });
  if (input.desiredRetirementAge)
    changes.push({ path: "desiredRetirementAge", value: input.desiredRetirementAge });
  const privateCover = input.privateCover ?? (input.addPolicies?.length ? "yes" : undefined);
  if (privateCover) changes.push({ path: "privateCover", value: privateCover });
  if (input.monthlySpending !== undefined)
    changes.push({ path: "monthlySpending", value: input.monthlySpending });
  if (input.monthlySavings !== undefined)
    changes.push({ path: "monthlySavings", value: input.monthlySavings });
  if (input.contact?.firstName && !input.person?.firstName && !current.person.firstName)
    changes.push({ path: "person.firstName", value: input.contact.firstName });
  return changes;
}

function saveContact(customerId: string, contact: NonNullable<UpdateProfileInput["contact"]>) {
  const customer = db.query.customers
    .findFirst({ where: eq(schema.customers.id, customerId) })
    .sync();
  if (!customer) return;
  const givesContact = Boolean(contact.email || contact.phone);
  db.update(schema.customers)
    .set({
      firstName: contact.firstName ?? customer.firstName,
      lastName: contact.lastName ?? customer.lastName,
      email: contact.email ?? customer.email,
      phone: contact.phone ?? customer.phone,
      lifecycle:
        customer.lifecycle === "anonymous" && givesContact ? "prospect" : customer.lifecycle,
    })
    .where(eq(schema.customers.id, customerId))
    .run();
}

function sameResidence(stored: LifeSituation["residence"], place: ResidencePlace): boolean {
  return (
    stored.city === place.city &&
    (stored.zip ?? null) === place.zip &&
    stored.canton === place.canton &&
    (stored.taxLocationId ?? null) === place.taxLocationId
  );
}

export function readinessFor(customerId: string, profile: LifeSituation): AnalysisReadiness {
  return analysisReadiness(profile, { hasRiskPolicies: hasRiskPolicies(customerId) });
}

export function createProfileTools(ctx: ToolContext) {
  return {
    updateProfile: tool({
      description:
        "Store facts the customer just told you about their life and finances (and contact details " +
        "they volunteer). Call it as soon as you learn something new, before you reply, with ALL " +
        "new facts of the message in one call. Never store guesses. Shows the customer a small " +
        "card with what you noted, which they can correct. `replaced` lists stored facts this " +
        "call overwrote: name each change in your reply.",
      inputSchema: updateProfileInput,
      execute: async (input, { toolCallId }): Promise<UpdateProfileOutput> => {
        const current = getProfile(ctx.customerId);
        const changes = toProfileChanges(input, current);
        let location: UpdateProfileOutput["location"] = null;
        let locationNotFound: string | null = null;
        let locationOptions: UpdateProfileOutput["locationOptions"] = null;
        if (input.residence?.zip || input.residence?.city) {
          const query = input.residence;
          const result = await resolveResidence(query, current.residence, ctx.locale, {
            customerId: ctx.customerId,
            conversationId: ctx.conversationId,
            toolCallId,
          });
          if (result.status === "resolved") {
            // Repeating the place the customer just picked in the card adds no second card.
            if (!sameResidence(current.residence, result.location)) {
              location = result.location;
              changes.push(...result.changes);
            }
          } else if (result.status === "ambiguous") {
            locationOptions = result.options;
          } else {
            locationNotFound = [query.zip, query.city].filter(Boolean).join(" ");
            if (query.zip) changes.push({ path: "residence.zip", value: query.zip });
            if (query.city) changes.push({ path: "residence.city", value: query.city });
          }
        }
        if (input.contact) saveContact(ctx.customerId, input.contact);
        try {
          const replaced = replacedFacts(changes, current);
          const profile = applyProfileChanges(ctx.customerId, changes, {
            source: "chat",
            conversationId: ctx.conversationId,
            messageId: ctx.assistantMessageId,
          });
          const policies = [
            ...(input.addPolicies?.length
              ? saveStatedPolicies(ctx.customerId, input.addPolicies, profile, ctx.locale)
              : []),
            ...(input.endPolicies?.length
              ? endPolicies(ctx.customerId, input.endPolicies, ctx.locale)
              : []),
          ];
          const readiness = readinessFor(ctx.customerId, profile);
          return {
            status: "ok",
            changes: policies.length
              ? [...changes, { path: "existingPolicies", value: policies }]
              : changes,
            replaced,
            completeness: profileCompleteness(profile),
            location,
            locationNotFound,
            locationOptions,
            missingForAnalysis: readiness.missing,
            askBeforeAnalysis: readiness.askFirst,
            error: null,
          };
        } catch (error) {
          return {
            status: "invalid",
            changes: [],
            replaced: [],
            completeness: profileCompleteness(current),
            location: null,
            locationNotFound,
            locationOptions,
            missingForAnalysis: readinessFor(ctx.customerId, current).missing,
            askBeforeAnalysis: [],
            error: error instanceof Error ? error.message.slice(0, 500) : "invalid profile",
          };
        }
      },
    }),
  };
}

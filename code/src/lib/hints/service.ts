import "server-only";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { currentRiskResult } from "@/lib/advisor/calculations";
import { latestCalculation } from "@/lib/advisor/logismata/latest";
import { audit } from "@/lib/audit";
import { db, schema } from "@/lib/db";
import { toIsoDate } from "@/lib/documents/dates";
import type { LifeSituation } from "@/lib/domain/profile";
import type { HintSeverity, HintStatus, Locale } from "@/lib/domain/taxonomy";
import { callLogismata, LOGISMATA } from "@/lib/logismata/client";
import { quotePremium } from "@/lib/pricing";
import { getProfile } from "@/lib/profile/service";
import { explainHint } from "./explain";
import {
  type BuyInCandidate,
  cheaperEquivalentCandidates,
  cheaperEquivalentHint,
  type DetectedHint,
  detectRuleHints,
  type HintFacts,
  type PolicyFacts,
  pensionBuyInCandidates,
  pensionBuyInHint,
} from "./rules";

/**
 * Detects, explains and stores cockpit hints. Detection is rule-based (./rules); gap hints use
 * the advisor's stored risk check when it still fits the profile, so cockpit, risk card and
 * Vorsorgebild show the same gap. Quotes and Logismata figures are reused while their inputs
 * stay the same; the model is only asked to phrase a hint when its facts or the locale changed.
 */

export type HintRow = typeof schema.hints.$inferSelect;

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);

// ─── External figures ───────────────────────────────────────────────────────

const LIMITS_FALLBACK = { withPensionFund: 7258, withoutPensionFund: 36288 };
let limitsPromise: Promise<HintFacts["limits3a"]> | undefined;

/** 3a maximums from Logismata (cached per process), with the 2025/26 values as fallback. */
function saving3aLimits(): Promise<HintFacts["limits3a"]> {
  limitsPromise ??= callLogismata<{ Max3aSaving: number; Max3aSavingWithoutP2: number }>(
    "APICalc_getSaving3aLimits",
    {},
  )
    .then((r) => ({ withPensionFund: r.Max3aSaving, withoutPensionFund: r.Max3aSavingWithoutP2 }))
    .catch(() => {
      limitsPromise = undefined;
      return LIMITS_FALLBACK;
    });
  return limitsPromise;
}

async function taxLocationId(profile: LifeSituation, customerId: string): Promise<number | null> {
  if (profile.residence.taxLocationId) return profile.residence.taxLocationId;
  const zip = profile.residence.zip;
  if (!zip) return null;
  try {
    const matches = await callLogismata<Array<{ LocationID: number; ZipCode: string }>>(
      "APICalc_searchLocation",
      { Search: zip, Language: 1 },
      { customerId },
    );
    return matches.find((m) => m.ZipCode === zip)?.LocationID ?? matches[0]?.LocationID ?? null;
  } catch {
    return null;
  }
}

const BUY_IN_YEARS = 3;

async function buyInTax(
  candidate: BuyInCandidate,
  profile: LifeSituation,
  customerId: string,
): Promise<{ taxSavings: number; investment: number; years: number } | null> {
  const locationId = await taxLocationId(profile, customerId);
  if (!locationId) return null;
  const marital = profile.person.maritalStatus;
  const jointlyTaxed = marital === "married" || marital === "registered_partnership";
  const income = jointlyTaxed
    ? (profile.person.grossIncome ?? 0) + (profile.partner?.grossIncome ?? 0)
    : candidate.income;
  const relationship =
    marital && marital in LOGISMATA.relationship
      ? LOGISMATA.relationship[marital as keyof typeof LOGISMATA.relationship]
      : LOGISMATA.relationship.single;
  try {
    const result = await callLogismata<{ TaxSavings: number }>(
      "APICalc_calculatePurchaseP2",
      {
        Investment: candidate.maxBuyIn,
        PaymentDuration: BUY_IN_YEARS,
        InterestRate: 1.25,
        IncomeType: LOGISMATA.incomeType.gross,
        Income: income,
        TaxLocationID: locationId,
        Relationship: relationship,
        Confession1: LOGISMATA.confession.none,
        Confession2: LOGISMATA.confession.none,
        NumberOfChildren: profile.children.length,
        Sex: LOGISMATA.sex[candidate.sex],
        BirthYear: candidate.birthYear,
      },
      { customerId },
    );
    return { taxSavings: result.TaxSavings, investment: candidate.maxBuyIn, years: BUY_IN_YEARS };
  } catch {
    return null;
  }
}

// ─── Detection ──────────────────────────────────────────────────────────────

function toFacts(row: typeof schema.policies.$inferSelect): PolicyFacts {
  return {
    id: row.id,
    insurer: row.insurer,
    isExternal: row.isExternal,
    category: row.category,
    productName: row.productName,
    pillar: row.pillar,
    status: row.status,
    startDate: row.startDate,
    endDate: row.endDate,
    noticeDate: row.noticeDate,
    premiumAnnual: row.premiumAnnual,
    sumInsured: row.sumInsured,
    annuityAnnual: row.annuityAnnual,
    insuredPerson: row.insuredPerson,
    details: row.details,
  };
}

function rowToDetected(row: HintRow): DetectedHint {
  return {
    type: row.type,
    severity: row.severity,
    policyId: row.policyId,
    key: String(row.data?.key ?? ""),
    data: row.data ?? {},
  };
}

/** Detects all hints. `unsettled` lists keys we could not evaluate (e.g. pricing unavailable). */
async function detectAll(
  customerId: string,
  profile: LifeSituation,
  existing: HintRow[],
): Promise<{ detected: DetectedHint[]; unsettled: Set<string> }> {
  const policies = db
    .select()
    .from(schema.policies)
    .where(eq(schema.policies.customerId, customerId))
    .all()
    .map(toFacts);
  const facts: HintFacts = {
    profile,
    policies,
    today: toIsoDate(new Date()),
    limits3a: await saving3aLimits(),
    risk: currentRiskResult(customerId, profile, policies),
  };
  const unsettled = new Set<string>();
  const previous = (key: string, inputKey: string) =>
    existing.find((h) => h.data?.key === key && h.data?.inputKey === inputKey);

  const cheaper = cheaperEquivalentCandidates(facts).map(async (candidate) => {
    const key = `cheaper_equivalent:${candidate.policy.id}`;
    const inputKey = hash([candidate.quoteInput, candidate.policy.premiumAnnual]);
    const reuse = previous(key, inputKey);
    if (reuse) return rowToDetected(reuse);
    try {
      const quote = await quotePremium(candidate.quoteInput, { customerId });
      const hint = cheaperEquivalentHint(candidate, quote);
      return hint && { ...hint, data: { ...hint.data, inputKey } };
    } catch (error) {
      // Pricing not available (yet): keep whatever we showed before, show nothing new.
      console.warn(`[hints] no Pax quote for ${candidate.policy.id}:`, (error as Error).message);
      unsettled.add(key);
      return null;
    }
  });

  const buyIns = pensionBuyInCandidates(facts).map(async (candidate) => {
    const key = `pension_buyin:${candidate.subject}`;
    const inputKey = hash([
      candidate,
      profile.residence,
      profile.person.maritalStatus,
      profile.children.length,
    ]);
    const reuse = previous(key, inputKey);
    if (reuse) return rowToDetected(reuse);
    const hint = pensionBuyInHint(candidate, await buyInTax(candidate, profile, customerId));
    return { ...hint, data: { ...hint.data, inputKey } };
  });

  const computed = await Promise.all([...cheaper, ...buyIns]);
  return {
    detected: [...detectRuleHints(facts), ...computed.filter((h): h is DetectedHint => h !== null)],
    unsettled,
  };
}

// ─── Storage ────────────────────────────────────────────────────────────────

/** Facts that change daily (countdowns) do not trigger a new explanation. */
function textFingerprint(hint: DetectedHint, locale: Locale): string {
  const {
    days: _days,
    inputKey: _inputKey,
    fingerprint: _fp,
    key: _key,
    model: _model,
    ...facts
  } = hint.data;
  return hash([hint.type, hint.severity, facts, locale]);
}

function householdOf(profile: LifeSituation): Record<string, unknown> {
  return {
    customerFirstName: profile.person.firstName ?? null,
    partnerFirstName: profile.partner?.firstName ?? null,
    maritalStatus: profile.person.maritalStatus ?? null,
    children: profile.children.map((c) => c.birthYear),
  };
}

export async function recomputeHints(customerId: string, locale: Locale): Promise<HintRow[]> {
  const profile = getProfile(customerId);
  const existing = db
    .select()
    .from(schema.hints)
    .where(eq(schema.hints.customerId, customerId))
    .all();
  const { detected, unsettled } = await detectAll(customerId, profile, existing);

  await Promise.all(
    detected.map(async (hint) => {
      const fingerprint = textFingerprint(hint, locale);
      const prev = existing.find((row) => row.data?.key === hint.key);
      const unchanged = prev?.data?.fingerprint === fingerprint;
      const text = unchanged
        ? { title: prev.title, body: prev.body, model: prev.data?.model ?? null }
        : await explainHint(hint, { locale, household: householdOf(profile) });
      const values = {
        severity: hint.severity,
        policyId: hint.policyId,
        locale,
        title: text.title,
        body: text.body,
        data: { ...hint.data, key: hint.key, fingerprint, model: text.model },
      };
      try {
        if (prev) {
          db.update(schema.hints).set(values).where(eq(schema.hints.id, prev.id)).run();
        } else {
          db.insert(schema.hints)
            .values({ ...values, customerId, type: hint.type })
            .run();
        }
      } catch (error) {
        console.warn(`[hints] could not store ${hint.key}:`, (error as Error).message);
      }
    }),
  );

  const keep = new Set([...detected.map((h) => h.key), ...unsettled]);
  for (const row of existing) {
    if (!keep.has(String(row.data?.key ?? "")))
      db.delete(schema.hints).where(eq(schema.hints.id, row.id)).run();
  }
  return listHints(customerId);
}

const SEVERITY_ORDER: Record<HintSeverity, number> = { warning: 0, opportunity: 1, info: 2 };

/** Hints for the cockpit: warnings first, dismissed ones last. */
export function listHints(customerId: string): HintRow[] {
  return db
    .select()
    .from(schema.hints)
    .where(eq(schema.hints.customerId, customerId))
    .all()
    .toSorted(
      (a, b) =>
        Number(a.status === "dismissed") - Number(b.status === "dismissed") ||
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        b.updatedAt.getTime() - a.updatedAt.getTime(),
    );
}

// ─── Freshness ──────────────────────────────────────────────────────────────

const globalForHints = globalThis as unknown as {
  paxHintInputs?: Map<string, string>;
  paxHintRuns?: Map<string, { fingerprint: string; run: Promise<HintRow[]> }>;
};
globalForHints.paxHintInputs ??= new Map();
globalForHints.paxHintRuns ??= new Map();
const lastInputs = globalForHints.paxHintInputs;
const running = globalForHints.paxHintRuns;

function inputsFingerprint(customerId: string, locale: Locale): string {
  const profile = db.query.profiles
    .findFirst({ where: eq(schema.profiles.customerId, customerId) })
    .sync();
  const policies = db
    .select({ id: schema.policies.id, updatedAt: schema.policies.updatedAt })
    .from(schema.policies)
    .where(eq(schema.policies.customerId, customerId))
    .all();
  return hash([
    profile?.updatedAt.getTime() ?? 0,
    policies.map((p) => `${p.id}:${p.updatedAt.getTime()}`).sort(),
    latestCalculation(customerId, "APICalc_calculateRisk")?.id ?? null,
    toIsoDate(new Date()),
    locale,
  ]);
}

/** Recomputes when the profile, a policy, the day or the locale changed since the last run. */
export async function ensureFreshHints(customerId: string, locale: Locale): Promise<HintRow[]> {
  const fingerprint = inputsFingerprint(customerId, locale);
  if (lastInputs.get(customerId) === fingerprint) return listHints(customerId);
  const inFlight = running.get(customerId);
  if (inFlight?.fingerprint === fingerprint) return inFlight.run;
  // A run on older inputs is still going: let it finish, then compute on the current ones.
  const previous = inFlight ? inFlight.run.catch(() => undefined) : Promise.resolve();
  const run = previous
    .then(() => recomputeHints(customerId, locale))
    .then((rows) => {
      lastInputs.set(customerId, fingerprint);
      return rows;
    })
    .finally(() => {
      if (running.get(customerId)?.run === run) running.delete(customerId);
    });
  running.set(customerId, { fingerprint, run });
  return run;
}

/** Customer marks a hint as seen, dismissed or acted on. */
export function setHintStatus(customerId: string, hintId: string, status: HintStatus): boolean {
  const result = db
    .update(schema.hints)
    .set({ status })
    .where(and(eq(schema.hints.id, hintId), eq(schema.hints.customerId, customerId)))
    .run();
  if (result.changes === 0) return false;
  audit({
    actorType: "customer",
    actorId: customerId,
    action: `hint.${status}`,
    entityType: "hint",
    entityId: hintId,
  });
  return true;
}

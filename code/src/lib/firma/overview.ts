import "server-only";
import { and, desc, eq, gte, min, type SQL, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { FunnelStage, Topic } from "@/lib/domain/taxonomy";
import { followUpCounts } from "@/lib/followups/queries";
import {
  biggestDropOff,
  buildFunnel,
  type Period,
  periodStart,
  type Scope,
  summariseNps,
} from "./aggregate";
import { HOT_LEAD_SQL, OPEN_LEAD_SQL, scopeSql, scopeWhere } from "./common";

/** A conversation counts as "live" while its last message is this recent. */
export const LIVE_WINDOW_MS = 5 * 60_000;

const c = schema.conversations;
const a = schema.analyses;
const h = schema.handovers;
const l = schema.leads;

/** "Heute zu tun": how much waits in each queue, never the people themselves. */
export function getTodayCounts(scope: Scope) {
  const handovers = db
    .select({
      open: sql<number>`count(*)`,
      urgent: sql<number>`coalesce(sum(${h.urgency} = 'high'), 0)`,
      oldest: min(h.createdAt),
    })
    .from(h)
    .innerJoin(c, eq(c.id, h.conversationId))
    .where(and(eq(h.status, "open"), scopeWhere(c.isSimulated, scope)))
    .get() ?? { open: 0, urgent: 0, oldest: null };
  const hotLeads =
    db
      .select({ count: sql<number>`count(*)` })
      .from(l)
      .where(and(OPEN_LEAD_SQL, HOT_LEAD_SQL, scopeWhere(l.isSimulated, scope)))
      .get()?.count ?? 0;
  // Follow-ups only exist for real customers, so the scope does not apply.
  return { handovers, hotLeads, dueFollowUps: followUpCounts().due };
}

/** How Clara did in the period and what customers brought up, all as aggregates. */
export function getOverview(scope: Scope, period: Period, now: Date) {
  const since = periodStart(period, now);
  const where = and(scopeWhere(c.isSimulated, scope), since ? gte(c.createdAt, since) : undefined);
  const whereSql: SQL = since
    ? sql`${scopeSql(c.isSimulated, scope)} and ${c.createdAt} >= ${since.getTime()}`
    : scopeSql(c.isSimulated, scope);

  const totals = db
    .select({
      total: sql<number>`count(*)`,
      finished: sql<number>`coalesce(sum(${c.status} in ('completed', 'handed_over')), 0)`,
    })
    .from(c)
    .where(where)
    .get() ?? { total: 0, finished: 0 };

  const npsScores = db
    .select({ nps: schema.feedback.nps })
    .from(schema.feedback)
    .innerJoin(c, eq(c.id, schema.feedback.conversationId))
    .where(where)
    .all()
    .map((r) => r.nps);

  const countByStage = (extra: SQL) =>
    Object.fromEntries(
      db
        .all<{ key: FunnelStage; count: number }>(
          sql`select ${c.stage} as key, count(*) as count from ${c} where ${whereSql} ${extra} group by 1`,
        )
        .map((r) => [r.key, r.count]),
    );
  // Running and handed-over conversations have not been left, so only these count as drop-offs.
  const funnel = buildFunnel(
    countByStage(sql``),
    countByStage(sql`and ${c.status} in ('abandoned', 'idle')`),
  );

  const topTopics = db.all<{ key: Topic; count: number }>(sql`
    select je.value as key, count(*) as count
    from ${a} join ${c} on ${c.id} = ${a.conversationId}, json_each(${a.topics}) je
    where ${whereSql} group by 1 order by 2 desc, 1 limit 5`);

  const topFaq = db
    .select({
      id: schema.faqQuestions.id,
      canonicalText: schema.faqQuestions.canonicalText,
      translations: schema.faqQuestions.translations,
      count: sql<number>`count(*)`,
    })
    .from(schema.conversationFaqs)
    .innerJoin(schema.faqQuestions, eq(schema.faqQuestions.id, schema.conversationFaqs.faqId))
    .innerJoin(c, eq(c.id, schema.conversationFaqs.conversationId))
    .where(where)
    .groupBy(schema.faqQuestions.id)
    .orderBy(desc(sql`count(*)`), schema.faqQuestions.canonicalText)
    .limit(5)
    .all();

  // Pain points are free text, so the newest ones stand in for "what hurts right now".
  const painPoints = db
    .select({ conversationId: a.conversationId, painPoints: a.painPoints })
    .from(a)
    .innerJoin(c, eq(c.id, a.conversationId))
    .where(and(where, sql`json_array_length(${a.painPoints}) > 0`))
    .orderBy(desc(a.updatedAt))
    .limit(10)
    .all()
    .flatMap((r) => r.painPoints.map((text) => ({ text, conversationId: r.conversationId })))
    .filter((p, i, all) => all.findIndex((q) => q.text === p.text) === i)
    .slice(0, 3);

  return {
    totals,
    nps: summariseNps(npsScores),
    funnel,
    dropOff: biggestDropOff(funnel),
    topTopics,
    topFaq,
    painPoints,
  };
}

export type Overview = ReturnType<typeof getOverview>;

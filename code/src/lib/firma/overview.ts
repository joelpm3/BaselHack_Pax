import "server-only";
import { and, desc, eq, gte, type SQL, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { FunnelStage, Sentiment, Topic } from "@/lib/domain/taxonomy";
import { bucketByDay, buildFunnel, type Scope, startOfZurichDay, summariseNps } from "./aggregate";
import { OPEN_LEAD_SQL, scopeSql, scopeWhere } from "./common";

/** A conversation counts as "live" while its last message is this recent. */
export const LIVE_WINDOW_MS = 5 * 60_000;
const TREND_DAYS = 14;

type Count<K extends string> = Array<{ key: K; count: number }>;

function groupCount<K extends string>(query: SQL): Count<K> {
  return db.all<{ key: K; count: number }>(query);
}

export function getOverview(scope: Scope, now: Date) {
  const c = schema.conversations;
  const convScope = scopeSql(c.isSimulated, scope);
  const today = startOfZurichDay(now);
  const liveSince = new Date(now.getTime() - LIVE_WINDOW_MS);

  const totals = db
    .select({
      total: sql<number>`count(*)`,
      today: sql<number>`coalesce(sum(${c.createdAt} >= ${today.getTime()}), 0)`,
      live: sql<number>`coalesce(sum(${c.status} = 'active' and ${c.lastMessageAt} >= ${liveSince.getTime()}), 0)`,
      abandoned: sql<number>`coalesce(sum(${c.status} = 'abandoned'), 0)`,
    })
    .from(c)
    .where(scopeWhere(c.isSimulated, scope))
    .get() ?? { total: 0, today: 0, live: 0, abandoned: 0 };

  const openLeads =
    db
      .select({ count: sql<number>`count(*)` })
      .from(schema.leads)
      .where(and(OPEN_LEAD_SQL, scopeWhere(schema.leads.isSimulated, scope)))
      .get()?.count ?? 0;

  const npsScores = db
    .select({ nps: schema.feedback.nps })
    .from(schema.feedback)
    .innerJoin(c, eq(c.id, schema.feedback.conversationId))
    .where(scopeWhere(c.isSimulated, scope))
    .all()
    .map((r) => r.nps);

  const stageCounts = Object.fromEntries(
    groupCount<FunnelStage>(
      sql`select ${c.stage} as key, count(*) as count from ${c} where ${convScope} group by 1`,
    ).map((r) => [r.key, r.count]),
  );
  const abandonedCounts = Object.fromEntries(
    groupCount<FunnelStage>(
      sql`select ${c.stage} as key, count(*) as count from ${c} where ${convScope} and ${c.status} = 'abandoned' group by 1`,
    ).map((r) => [r.key, r.count]),
  );

  const a = schema.analyses;
  const topTopics = groupCount<Topic>(sql`
    select je.value as key, count(*) as count
    from ${a} join ${c} on ${c.id} = ${a.conversationId}, json_each(${a.topics}) je
    where ${convScope} group by 1 order by 2 desc, 1 limit 8`);

  const sentiment = groupCount<Sentiment>(sql`
    select ${a.sentiment} as key, count(*) as count from ${a} join ${c} on ${c.id} = ${a.conversationId}
    where ${convScope} group by 1`);

  const topFaq = db
    .select({
      id: schema.faqQuestions.id,
      canonicalText: schema.faqQuestions.canonicalText,
      translations: schema.faqQuestions.translations,
      topic: schema.faqQuestions.topic,
      count: sql<number>`count(*)`,
    })
    .from(schema.conversationFaqs)
    .innerJoin(schema.faqQuestions, eq(schema.faqQuestions.id, schema.conversationFaqs.faqId))
    .innerJoin(c, eq(c.id, schema.conversationFaqs.conversationId))
    .where(scopeWhere(c.isSimulated, scope))
    .groupBy(schema.faqQuestions.id)
    .orderBy(desc(sql`count(*)`), schema.faqQuestions.canonicalText)
    .limit(10)
    .all();

  const painPoints = db
    .select({ conversationId: a.conversationId, painPoints: a.painPoints, updatedAt: a.updatedAt })
    .from(a)
    .innerJoin(c, eq(c.id, a.conversationId))
    .where(scopeWhere(c.isSimulated, scope))
    .orderBy(desc(a.updatedAt))
    .limit(20)
    .all()
    .flatMap((r) => r.painPoints.map((text) => ({ text, conversationId: r.conversationId })))
    .slice(0, 10);

  const trendStart = new Date(today.getTime() - (TREND_DAYS - 1) * 86_400_000);
  const perDay = bucketByDay(
    db
      .select({ createdAt: c.createdAt })
      .from(c)
      .where(and(gte(c.createdAt, trendStart), scopeWhere(c.isSimulated, scope)))
      .all()
      .map((r) => r.createdAt),
    TREND_DAYS,
    now,
  );

  return {
    totals,
    openLeads,
    nps: summariseNps(npsScores),
    funnel: buildFunnel(stageCounts, abandonedCounts),
    topTopics,
    sentiment,
    topFaq,
    painPoints,
    perDay,
  };
}

export type Overview = ReturnType<typeof getOverview>;

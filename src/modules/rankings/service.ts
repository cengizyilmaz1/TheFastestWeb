import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { competitionPeriods, rankingSnapshots, sites } from "@/db/schema";
import { AppError } from "@/lib/http/errors";
import { PERFORMANCE_METHOD_VERSION, type PerformanceStrategy } from "@/modules/performance/service";
import { getPeriodBounds, parsePeriodKey, RANKING_ALGORITHM_VERSION, type PeriodKind } from "./algorithm";
import { notifyPeriodResults } from "@/modules/notifications/triggers";
import { recordAnalyticsEvent } from "@/modules/analytics/events";

export { getPeriodBounds, RANKING_ALGORITHM_VERSION } from "./algorithm";
const querySchema = z.object({
  kind: z.enum(["weekly", "monthly", "all_time"]).default("weekly"),
  periodKey: z.string().max(8).optional(),
  strategy: z.enum(["mobile", "desktop"]).default("mobile"),
  scope: z.enum(["overall", "country", "category", "technology", "improved", "newcomer"]).default("overall"),
  scopeKey: z.string().max(100).default(""),
  limit: z.number().int().min(1).max(100).default(25),
  cursor: z.string().regex(/^\d{1,8}$/).optional(),
}).strict();
export type RankingQuery = z.input<typeof querySchema>;
export type RankingRow = {
  siteId: string; rank: number; score: number; lcpMs: number | null; cls: number | null; tbtMs: number | null;
  sampleCount: number; evidence: Record<string, unknown>; siteSnapshot: Record<string, unknown>;
};
type ScopedRow = RankingRow & { scope: "overall" | "country" | "category" | "technology" | "improved" | "newcomer"; scopeKey: string; strategy: PerformanceStrategy };
function database() {
  const db = getDb();
  if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Rankings are temporarily unavailable.", 503);
  return db;
}

/** SQL performs bounded indexed selection and ranking; never fetch every site to filter in JS. */
function candidateQuery(startAt: Date | null, endAt: Date, allTime = false): SQL {
  const start = startAt ? sql`AND t.tested_at>=${startAt.toISOString()}::timestamptz` : sql``;
  const measurementOrder = allTime
    ? sql`t.score DESC,t.lcp_ms ASC NULLS LAST,t.cls ASC NULLS LAST,t.tbt_ms ASC NULLS LAST,t.tested_at DESC,t.id`
    : sql`t.tested_at DESC,t.id`;
  return sql`
    WITH latest AS (
      SELECT DISTINCT ON(t.site_id,t.strategy) t.* FROM public.speed_tests t
      JOIN public.sites s ON s.id=t.site_id
      WHERE t.methodology_version=${PERFORMANCE_METHOD_VERSION} AND t.metrics_source='lab' AND t.sample_count>=2
        AND t.lcp_ms IS NOT NULL AND t.cls IS NOT NULL AND t.tbt_ms IS NOT NULL
        AND t.score BETWEEN 0 AND 100 AND t.lcp_ms>=0 AND t.cls BETWEEN 0 AND 3600000 AND t.tbt_ms>=0
        AND t.tested_at<${endAt.toISOString()}::timestamptz ${start}
        AND s.is_listed AND s.lifecycle='active' AND s.archived_at IS NULL
      ORDER BY t.site_id,t.strategy,${measurementOrder}
    ), candidates AS (
      SELECT t.*,s.country_code,s.created_at AS site_created_at,
        CASE WHEN previous.score IS NOT NULL THEN t.score-previous.score ELSE NULL END AS improvement,
        jsonb_build_object('measurementId',t.id,'testedAt',t.tested_at,'methodologyVersion',t.methodology_version,
          'metricsSource',t.metrics_source,'sampleCount',t.sample_count,'previousMeasurementId',previous.id,
          'improvement',CASE WHEN previous.score IS NOT NULL THEN t.score-previous.score ELSE NULL END) AS evidence,
        jsonb_build_object('id',s.id,'slug',s.slug,'name',s.name,'url',s.url,'faviconUrl',s.favicon_url,
          'countryCode',s.country_code) AS site_snapshot
      FROM latest t JOIN public.sites s ON s.id=t.site_id
      LEFT JOIN LATERAL (
        SELECT p.id,p.score FROM public.speed_tests p WHERE p.site_id=t.site_id AND p.strategy=t.strategy
          AND p.methodology_version=${PERFORMANCE_METHOD_VERSION} AND p.metrics_source='lab' AND p.sample_count>=2
          AND p.lcp_ms IS NOT NULL AND p.cls IS NOT NULL AND p.tbt_ms IS NOT NULL
          AND p.score BETWEEN 0 AND 100 AND p.lcp_ms>=0 AND p.cls BETWEEN 0 AND 3600000 AND p.tbt_ms>=0
          AND p.tested_at<${(startAt ?? endAt).toISOString()}::timestamptz AND p.id<>t.id
        ORDER BY p.tested_at DESC,p.id LIMIT 1
      ) previous ON true
    ), expanded AS (
      SELECT c.*,dimension.scope,dimension.scope_key FROM candidates c
      CROSS JOIN LATERAL (
        SELECT 'overall'::text AS scope,''::text AS scope_key
        UNION ALL SELECT 'country',c.country_code WHERE c.country_code IS NOT NULL
        UNION ALL SELECT 'category',cat.slug FROM public.site_categories sc
          JOIN public.categories cat ON cat.id=sc.category_id WHERE sc.site_id=c.site_id AND cat.active
        UNION ALL SELECT 'technology',tech.slug FROM public.site_technologies st
          JOIN public.technologies tech ON tech.id=st.technology_id WHERE st.site_id=c.site_id AND tech.active
        UNION ALL SELECT 'improved','' WHERE c.improvement>0
        UNION ALL SELECT 'newcomer','' WHERE ${startAt !== null}
          AND c.site_created_at>=${(startAt ?? endAt).toISOString()}::timestamptz AND c.site_created_at<${endAt.toISOString()}::timestamptz
      ) dimension
    ), ranked AS (
      SELECT *,row_number() OVER(PARTITION BY scope,scope_key,strategy ORDER BY
        CASE WHEN scope='improved' THEN improvement END DESC NULLS LAST,
        score DESC,lcp_ms ASC NULLS LAST,cls ASC NULLS LAST,tbt_ms ASC NULLS LAST,site_id) AS rank
      FROM expanded
    )`;
}
const rowProjection = sql`site_id AS "siteId",rank::integer AS rank,score,lcp_ms AS "lcpMs",cls,tbt_ms AS "tbtMs",
  sample_count AS "sampleCount",evidence,site_snapshot AS "siteSnapshot"`;

/** The period lock and snapshot writes share one transaction. A closed period is never recalculated. */
export async function finalizeCompetitionPeriod(kind: PeriodKind, periodKey: string) {
  let bounds;
  try { bounds = parsePeriodKey(kind, periodKey); }
  catch { throw new AppError("INVALID_REQUEST", "Invalid competition period.", 400); }
  return database().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`ranking:${periodKey}`},0))`);
    const [clock] = await tx.execute<{ ended: boolean }>(sql`SELECT ${bounds.endAt.toISOString()}::timestamptz<=now() AS ended`);
    if (!clock.ended) throw new AppError("CONFLICT", "The competition period is still open.", 409);
    const [existing] = await tx.select().from(competitionPeriods).where(eq(competitionPeriods.periodKey, periodKey)).for("update");
    if (existing?.status === "closed") return { period: existing, created: false };
    if (existing && (existing.kind !== kind || existing.rankingAlgorithmVersion !== RANKING_ALGORITHM_VERSION
      || existing.performanceMethodVersion !== PERFORMANCE_METHOD_VERSION
      || existing.startAt.getTime() !== bounds.startAt.getTime() || existing.endAt.getTime() !== bounds.endAt.getTime())) {
      throw new AppError("CONFLICT", "The existing period uses a different methodology.", 409);
    }
    const period = existing ?? (await tx.insert(competitionPeriods).values({ ...bounds,
      rankingAlgorithmVersion: RANKING_ALGORITHM_VERSION, performanceMethodVersion: PERFORMANCE_METHOD_VERSION }).returning())[0];
    const rows = await tx.execute<ScopedRow>(sql`${candidateQuery(bounds.startAt,bounds.endAt)} SELECT
      scope,scope_key AS "scopeKey",strategy,${rowProjection} FROM ranked WHERE rank<=100 ORDER BY scope,scope_key,strategy,rank`);
    // Each scope keeps the top100; this cap is explicit and immutable for ranking-v1 archives.
    for (let offset=0;offset<rows.length;offset+=500) {
      await tx.insert(rankingSnapshots).values(rows.slice(offset,offset+500).map((row) => ({ ...row, periodId: period.id })));
    }
    const [closed] = await tx.update(competitionPeriods).set({ status: "closed", closedAt: sql`now()` })
      .where(eq(competitionPeriods.id,period.id)).returning();
    await notifyPeriodResults(tx,closed);
    await recordAnalyticsEvent({name:"ranking_finalized",eventKey:`ranking-finalized:${period.id}`,
      properties:{periodKind:kind,count:rows.length}},tx);
    if(kind==="weekly") for(const row of rows.filter(row=>row.scope==="overall")) {
      const key=`${period.id}:${row.siteId}:${row.strategy}`;
      await recordAnalyticsEvent({name:"weekly_entered",eventKey:`weekly-entered:${key}`,siteId:row.siteId,
        properties:{periodId:period.id,strategy:row.strategy}},tx);
      if(row.rank<=3) await recordAnalyticsEvent({name:"weekly_won",eventKey:`weekly-won:${key}`,siteId:row.siteId,
        properties:{periodId:period.id,strategy:row.strategy,rank:row.rank}},tx);
    }
    return { period: closed, created: true, snapshots: rows.length };
  });
}

export async function listRanking(raw: RankingQuery = {}) {
  const input = querySchema.parse(raw), db = database();
  if (["country","category","technology"].includes(input.scope) !== Boolean(input.scopeKey)) {
    throw new AppError("INVALID_REQUEST", "Choose a country, category or technology for this ranking.", 400);
  }
  if (input.kind === "all_time" && (input.periodKey || ["improved","newcomer"].includes(input.scope))) {
    throw new AppError("INVALID_REQUEST", "This ranking requires a weekly or monthly period.", 400);
  }
  const [clock] = await db.execute<{ now_ms: string }>(sql`SELECT extract(epoch FROM now())*1000 AS now_ms`);
  const now = new Date(Number(clock.now_ms));
  let bounds;
  try { bounds = input.kind === "all_time" ? null : input.periodKey
    ? parsePeriodKey(input.kind,input.periodKey) : getPeriodBounds(input.kind,now); }
  catch { throw new AppError("INVALID_REQUEST", "Invalid competition period.", 400); }
  const [period] = bounds ? await db.select().from(competitionPeriods).where(eq(competitionPeriods.periodKey,bounds.periodKey)) : [];
  const cursor = Number(input.cursor ?? 0);
  let rows: RankingRow[];
  if (period?.status === "closed") {
    rows = await db.select({ siteId: rankingSnapshots.siteId, rank: rankingSnapshots.rank, score: rankingSnapshots.score,
      lcpMs: rankingSnapshots.lcpMs, cls: rankingSnapshots.cls, tbtMs: rankingSnapshots.tbtMs,
      sampleCount: rankingSnapshots.sampleCount, evidence: rankingSnapshots.evidence, siteSnapshot: rankingSnapshots.siteSnapshot })
      .from(rankingSnapshots).innerJoin(sites,eq(sites.id,rankingSnapshots.siteId)).where(and(
        eq(sites.isListed,true),sql`${sites.archivedAt} IS NULL`,sql`${sites.lifecycle} IN ('active','verified','unreachable','redirected','parked')`,
        eq(rankingSnapshots.periodId,period.id),eq(rankingSnapshots.strategy,input.strategy),
        eq(rankingSnapshots.scope,input.scope),eq(rankingSnapshots.scopeKey,input.scopeKey),sql`${rankingSnapshots.rank}>${cursor}`))
      .orderBy(rankingSnapshots.rank).limit(input.limit+1);
  } else {
    rows = await db.execute<RankingRow>(sql`${candidateQuery(bounds?.startAt ?? null,bounds ? new Date(Math.min(bounds.endAt.getTime(),now.getTime())) : now,input.kind === "all_time")}
      SELECT ${rowProjection} FROM ranked WHERE scope=${input.scope} AND scope_key=${input.scopeKey}
        AND strategy=${input.strategy} AND rank>${cursor} ORDER BY rank LIMIT ${input.limit+1}`);
  }
  const hasMore = rows.length>input.limit;
  const items = rows.slice(0,input.limit);
  return { items, nextCursor: hasMore ? String(items[items.length-1].rank) : null,
    status: period?.status === "closed" ? "closed" as const : "live" as const,
    period: bounds, strategy: input.strategy, scope: input.scope, scopeKey: input.scopeKey,
    rankingAlgorithmVersion: period?.rankingAlgorithmVersion ?? RANKING_ALGORITHM_VERSION,
    performanceMethodVersion: period?.performanceMethodVersion ?? PERFORMANCE_METHOD_VERSION };
}

/** Website positions reuse the authoritative ranking query, including its visibility and tie rules. */
export async function getSiteRankingPositions(siteId: string, strategy: PerformanceStrategy = "mobile") {
  z.uuid().parse(siteId); z.enum(["mobile","desktop"]).parse(strategy);
  const db=database(),[clock]=await db.execute<{ now_ms: string }>(sql`SELECT extract(epoch FROM now())*1000 AS now_ms`);
  const now=new Date(Number(clock.now_ms));
  const groups=await Promise.all((["weekly","monthly","all_time"] as const).map(async kind=>{
    const bounds=kind==="all_time"?null:getPeriodBounds(kind,now);
    const rows=await db.execute<{ scope: ScopedRow["scope"]; scopeKey: string; rank: number; score: number }>(sql`
      ${candidateQuery(bounds?.startAt??null,now,kind==="all_time")}
      SELECT scope,scope_key AS "scopeKey",rank::int,score FROM ranked
      WHERE site_id=${siteId} AND strategy=${strategy} AND scope NOT IN ('improved','newcomer')
      ORDER BY scope,scope_key LIMIT 100`);
    return rows.map(row=>({...row,kind,periodKey:bounds?.periodKey??null}));
  }));
  return { items:groups.flat(),strategy,performanceMethodVersion:PERFORMANCE_METHOD_VERSION,rankingAlgorithmVersion:RANKING_ALGORITHM_VERSION };
}

export async function listHallOfFame(options: { strategy?: PerformanceStrategy; limit?: number; cursor?: string } = {}) {
  const { strategy="mobile",limit=25,cursor } = options;
  z.enum(["mobile","desktop"]).parse(strategy);
  z.number().int().min(1).max(100).parse(limit);
  if (cursor && !/^\d{4}-(?:W\d{2}|\d{2})$/.test(cursor)) throw new AppError("INVALID_REQUEST", "Invalid archive cursor.", 400);
  let cursorStart: Date | undefined;
  if (cursor) {
    try { cursorStart=parsePeriodKey(cursor.includes("-W") ? "weekly" : "monthly",cursor).startAt; }
    catch { throw new AppError("INVALID_REQUEST", "Invalid archive cursor.", 400); }
  }
  const rows = await database().select({ periodKey: competitionPeriods.periodKey,kind: competitionPeriods.kind,
    startAt: competitionPeriods.startAt,endAt: competitionPeriods.endAt,rankingAlgorithmVersion: competitionPeriods.rankingAlgorithmVersion,
    performanceMethodVersion: competitionPeriods.performanceMethodVersion,siteId: rankingSnapshots.siteId,
    score: rankingSnapshots.score,siteSnapshot: rankingSnapshots.siteSnapshot })
    .from(competitionPeriods).innerJoin(rankingSnapshots,eq(rankingSnapshots.periodId,competitionPeriods.id))
    .innerJoin(sites,eq(sites.id,rankingSnapshots.siteId))
    .where(and(eq(competitionPeriods.status,"closed"),eq(rankingSnapshots.rank,1),eq(rankingSnapshots.scope,"overall"),
      eq(competitionPeriods.rankingAlgorithmVersion,RANKING_ALGORITHM_VERSION),eq(competitionPeriods.performanceMethodVersion,PERFORMANCE_METHOD_VERSION),
      eq(sites.isListed,true),sql`${sites.archivedAt} IS NULL`,sql`${sites.lifecycle} IN ('active','verified','unreachable','redirected','parked')`,
      eq(rankingSnapshots.strategy,strategy),cursorStart ? sql`(${competitionPeriods.startAt}<${cursorStart.toISOString()}::timestamptz
        OR (${competitionPeriods.startAt}=${cursorStart.toISOString()}::timestamptz AND ${competitionPeriods.periodKey}<${cursor}))` : undefined))
    .orderBy(desc(competitionPeriods.startAt),desc(competitionPeriods.periodKey)).limit(limit+1);
  return { items: rows.slice(0,limit),nextCursor: rows.length>limit ? rows[limit-1].periodKey : null,strategy };
}

/** Scheduler catch-up is bounded: close the immediately previous week/month only. */
export async function finalizePreviousPeriods() {
  const [clock] = await database().execute<{ now_ms: string }>(sql`SELECT extract(epoch FROM now())*1000 AS now_ms`);
  const now = new Date(Number(clock.now_ms));
  const result = [];
  for (const kind of ["weekly","monthly"] as const) {
    const current = getPeriodBounds(kind,now);
    const previous = getPeriodBounds(kind,new Date(current.startAt.getTime()-1));
    result.push(await finalizeCompetitionPeriod(kind,previous.periodKey));
  }
  return result;
}

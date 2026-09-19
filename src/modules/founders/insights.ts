import { sql } from "drizzle-orm";
import type { getDb } from "@/db";
import { PERFORMANCE_METHOD_VERSION } from "@/modules/performance/service";
import { compareRankingCandidates, RANKING_ALGORITHM_VERSION } from "@/modules/rankings/algorithm";

type Database = NonNullable<ReturnType<typeof getDb>>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Measurement = { siteId: string; slug: string; name: string; score: number; lcpMs: number; cls: number; tbtMs: number; testedAt: string; position: number };
type Ranking = { id: string; siteId: string; slug: string; name: string; periodKey: string; kind: "weekly" | "monthly";
  scope: string; scopeKey: string; rank: number; score: number; weeklyWins: number; bestRank: number | null };

/** Public projections only. Each query rechecks attribution and current visibility. */
export async function readFounderInsights(tx: Transaction, founderId: string, strategy: "mobile" | "desktop") {
  // Match the bounded alphabetical website list; never aggregate hidden relationships.
  const eligible = sql`eligible AS (
    SELECT s.id,s.slug,s.name FROM sites s
    JOIN founder_sites fs ON fs.site_id=s.id JOIN founders f ON f.id=fs.founder_id
    WHERE f.id=${founderId} AND f.visibility='public' AND s.is_listed=true
      AND s.lifecycle='active' AND s.archived_at IS NULL
    ORDER BY s.slug LIMIT 100
  )`;
  const [measurements, rankings, technologies, awards, [clock]] = await Promise.all([
    tx.execute<Measurement>(sql`WITH ${eligible}, measured AS (
      SELECT e.id AS "siteId",e.slug,e.name,t.score,t.lcp_ms AS "lcpMs",t.cls,t.tbt_ms AS "tbtMs",t.tested_at AS "testedAt",
        row_number() OVER(PARTITION BY e.id ORDER BY t.tested_at DESC,t.id) AS position
      FROM eligible e JOIN speed_tests t ON t.site_id=e.id
      WHERE t.strategy=${strategy} AND t.methodology_version=${PERFORMANCE_METHOD_VERSION}
        AND t.metrics_source='lab' AND t.sample_count>=2 AND t.tested_at<=now()
        AND t.score BETWEEN 0 AND 100 AND t.lcp_ms>=0 AND t.cls BETWEEN 0 AND 3600000 AND t.tbt_ms>=0
    ) SELECT * FROM measured WHERE position<=2`),
    tx.execute<Ranking>(sql`WITH ${eligible}
      SELECT r.id,e.id AS "siteId",e.slug,e.name,p.period_key AS "periodKey",p.kind,r.scope,r.scope_key AS "scopeKey",r.rank,r.score,
        (count(*) FILTER(WHERE p.kind='weekly' AND r.scope='overall' AND r.rank=1) OVER())::int AS "weeklyWins",
        min(r.rank) FILTER(WHERE r.scope='overall') OVER() AS "bestRank"
      FROM eligible e JOIN ranking_snapshots r ON r.site_id=e.id JOIN competition_periods p ON p.id=r.period_id
      WHERE p.status='closed' AND p.end_at<=now() AND r.strategy=${strategy} AND r.sample_count>=2
        AND p.performance_method_version=${PERFORMANCE_METHOD_VERSION} AND p.ranking_algorithm_version=${RANKING_ALGORITHM_VERSION}
      ORDER BY p.start_at DESC,p.kind,r.scope,r.scope_key,r.rank,r.id LIMIT 24`),
    tx.execute<{ slug: string; name: string }>(sql`WITH ${eligible}
      SELECT DISTINCT t.slug,t.name FROM eligible e JOIN site_technologies st ON st.site_id=e.id
      JOIN technologies t ON t.id=st.technology_id WHERE t.active=true ORDER BY t.name,t.slug LIMIT 40`),
    tx.execute<{ id: string; title: string; description: string; siteId: string; slug: string; name: string; awardedAt: string }>(sql`WITH ${eligible}
      SELECT a.id,d.title,d.description,e.id AS "siteId",e.slug,e.name,a.awarded_at AS "awardedAt"
      FROM eligible e JOIN site_awards a ON a.site_id=e.id JOIN achievements d ON d.id=a.achievement_id
      WHERE d.active=true AND a.evidence->>'strategy'=${strategy} AND a.awarded_at<=now()
        AND coalesce(a.evidence->>'methodologyVersion',${PERFORMANCE_METHOD_VERSION})=${PERFORMANCE_METHOD_VERSION}
        AND (a.period_id IS NULL OR EXISTS(SELECT 1 FROM competition_periods p WHERE p.id=a.period_id
          AND p.status='closed' AND p.performance_method_version=${PERFORMANCE_METHOD_VERSION}
          AND p.ranking_algorithm_version=${RANKING_ALGORITHM_VERSION}))
      ORDER BY a.awarded_at DESC,a.id DESC LIMIT 12`),
    tx.execute<{ now: string }>(sql`SELECT now() AS now`),
  ]);
  const latest = measurements.filter(row => Number(row.position) === 1).sort(compareRankingCandidates);
  const prior = new Map(measurements.filter(row => Number(row.position) === 2).map(row => [row.siteId, row]));
  const minimumDate = new Date(clock.now).getTime() - 30 * 86_400_000;
  const recentlyImproved = latest.flatMap(row => {
    const previous = prior.get(row.siteId);
    return previous && row.score > previous.score && new Date(row.testedAt).getTime() >= minimumDate
      ? [{ siteId: row.siteId, slug: row.slug, name: row.name, score: row.score, previousScore: previous.score,
        improvement: Math.round((row.score - previous.score) * 10) / 10, testedAt: row.testedAt }] : [];
  }).sort((a,b) => b.improvement-a.improvement || (a.siteId<b.siteId?-1:1)).slice(0,8);
  const best = latest[0];
  return {
    strategy, methodologyVersion: PERFORMANCE_METHOD_VERSION, rankingAlgorithmVersion: RANKING_ALGORITHM_VERSION,
    measuredSites: latest.length,
    averageScore: latest.length ? Math.round(latest.reduce((sum,row) => sum+row.score,0)/latest.length*10)/10 : null,
    bestSite: best ? { siteId: best.siteId, slug: best.slug, name: best.name, score: best.score, testedAt: best.testedAt } : null,
    weeklyWins: rankings[0]?.weeklyWins ?? 0, bestRank: rankings[0]?.bestRank ?? null,
    rankings: rankings.map(row => ({ id: row.id, siteId: row.siteId, slug: row.slug, name: row.name,
      periodKey: row.periodKey, kind: row.kind, scope: row.scope, scopeKey: row.scopeKey, rank: row.rank, score: row.score })),
    technologies: [...technologies], awards: [...awards], recentlyImproved,
  };
}

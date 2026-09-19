import { sql } from "drizzle-orm";
import { cache } from "react";
import { getDb } from "@/db";
import { AppError } from "@/lib/http/errors";
import { listRanking } from "./service";
import { parsePeriodKey, type PeriodKind } from "./algorithm";

const visible=sql`s.is_listed=true AND s.archived_at IS NULL AND s.lifecycle IN ('active','verified','unreachable','redirected','parked')`;
/** Read-only archive presentation; a hidden winner never causes remaining ranks to be rewritten. */
export const getCompetitionOverview=cache(async (kind: PeriodKind, key: string, strategy: "mobile" | "desktop" = "mobile") => {
  parsePeriodKey(kind,key);
  const db=getDb();if(!db)throw new AppError("DATABASE_UNAVAILABLE","The archive is temporarily unavailable.",503);
  const [period]=await db.execute<{ id:string;key:string;kind:PeriodKind;startAt:string;endAt:string;method:string;algorithm:string }>(sql`
    SELECT id,period_key AS key,kind,start_at AS "startAt",end_at AS "endAt",performance_method_version AS method,ranking_algorithm_version AS algorithm
    FROM competition_periods WHERE kind=${kind} AND period_key=${key} AND status='closed' AND end_at<=now()`);
  if(!period)return null;
  const [overall,improved,newcomers,[stats],collections,captures,awards]=await Promise.all([
    listRanking({kind,periodKey:key,strategy,limit:10}),
    listRanking({kind,periodKey:key,strategy,scope:"improved",limit:5}),
    listRanking({kind,periodKey:key,strategy,scope:"newcomer",limit:5}),
    db.execute<{ finalists:number;averageScore:number|null;countries:number;categories:number;technologies:number }>(sql`
      SELECT (count(*) FILTER(WHERE r.scope='overall'))::int AS finalists,
        (round((avg(r.score) FILTER(WHERE r.scope='overall'))::numeric,1))::float AS "averageScore",
        (count(*) FILTER(WHERE r.scope='country' AND r.rank=1))::int AS countries,
        (count(*) FILTER(WHERE r.scope='category' AND r.rank=1))::int AS categories,
        (count(*) FILTER(WHERE r.scope='technology' AND r.rank=1))::int AS technologies
      FROM ranking_snapshots r JOIN sites s ON s.id=r.site_id
      WHERE r.period_id=${period.id} AND r.strategy=${strategy} AND ${visible}`),
    db.execute<{ id:string;siteId:string;slug:string;name:string;scope:string;scopeKey:string;score:number }>(sql`
      WITH winners AS(SELECT r.id,s.id AS "siteId",s.slug,coalesce(r.site_snapshot->>'name',s.name) AS name,r.scope,r.scope_key AS "scopeKey",r.score,
        row_number() OVER(PARTITION BY r.scope ORDER BY r.scope_key) AS position
        FROM ranking_snapshots r JOIN sites s ON s.id=r.site_id WHERE r.period_id=${period.id}
          AND r.strategy=${strategy} AND r.rank=1 AND r.scope IN ('country','category','technology') AND ${visible})
      SELECT id,"siteId",slug,name,scope,"scopeKey",score FROM winners WHERE position<=12 ORDER BY scope,"scopeKey"`),
    db.execute<{ id:string;slug:string;name:string;url:string;width:number;height:number;capturedAt:string;rank:number }>(sql`
      SELECT image.id,s.slug,coalesce(r.site_snapshot->>'name',s.name) AS name,image.public_url AS url,image.width,image.height,image.captured_at AS "capturedAt",r.rank
      FROM ranking_snapshots r JOIN sites s ON s.id=r.site_id
      CROSS JOIN LATERAL(SELECT * FROM site_screenshots shot WHERE shot.site_id=s.id AND shot.device=${strategy}
        AND shot.status='ready' AND shot.captured_at>=${period.startAt}::timestamptz AND shot.captured_at<${period.endAt}::timestamptz
        AND (shot.retention_until IS NULL OR shot.retention_until>now()) ORDER BY shot.captured_at DESC,shot.id LIMIT 1) image
      WHERE r.period_id=${period.id} AND r.strategy=${strategy} AND r.scope='overall' AND r.rank<=3 AND ${visible} ORDER BY r.rank`),
    db.execute<{ id:string;title:string;slug:string;name:string }>(sql`
      SELECT a.id,d.title,s.slug,s.name FROM site_awards a JOIN achievements d ON d.id=a.achievement_id JOIN sites s ON s.id=a.site_id
      WHERE a.period_id=${period.id} AND a.evidence->>'strategy'=${strategy} AND d.active=true
        AND s.is_listed=true AND s.archived_at IS NULL AND s.lifecycle='active'
      ORDER BY a.awarded_at DESC,a.id LIMIT 12`),
  ]);
  return {period,strategy,winner:overall.items.find(row=>row.rank===1)??null,top:overall.items.filter(row=>row.rank<=10),
    improved:improved.items,newcomers:newcomers.items,stats,collections:[...collections],captures:[...captures],awards:[...awards]};
});

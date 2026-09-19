import { and,desc,eq,ne,sql } from "drizzle-orm";
import type { Database } from "@/db";
import { notificationPreferences,speedTests } from "@/db/schema";
import { PERFORMANCE_METHOD_VERSION } from "@/modules/performance/service";
import { getPeriodBounds,type PeriodKind } from "@/modules/rankings/algorithm";
import { enqueueNotification } from "./service";
type Transaction=Parameters<Parameters<Database["transaction"]>[0]>[0];
export const PERFORMANCE_NOTIFICATION_DELTA=10;

/** Called only inside the fenced measurement transaction; incomparable history is excluded. */
export async function notifyPerformanceChange(tx:Transaction,input:{measurementId:string;siteId:string;ownerId:string|null;
  name:string;slug:string;score:number;strategy:"mobile"|"desktop"}) {
  if(!input.ownerId) return;
  const [preferences]=await tx.select().from(notificationPreferences).where(eq(notificationPreferences.userId,input.ownerId));
  if(preferences?.performance===false) return;
  const [previous]=await tx.select({score:speedTests.score}).from(speedTests).where(and(eq(speedTests.siteId,input.siteId),
    ne(speedTests.id,input.measurementId),eq(speedTests.strategy,input.strategy),eq(speedTests.methodologyVersion,PERFORMANCE_METHOD_VERSION),
    eq(speedTests.metricsSource,"lab"),sql`${speedTests.sampleCount}>=2 AND ${speedTests.score} BETWEEN 0 AND 100
      AND ${speedTests.lcpMs}>=0 AND ${speedTests.cls}>=0 AND ${speedTests.tbtMs}>=0 AND ${speedTests.testedAt}<=now()`))
    .orderBy(desc(speedTests.testedAt),speedTests.id).limit(1);
  if(!previous || Math.abs(input.score-previous.score)<PERFORMANCE_NOTIFICATION_DELTA) return;
  await enqueueNotification({userId:input.ownerId,eventKey:`performance-change:${input.measurementId}`,
    type:input.score>previous.score ? "performance_improved" : "performance_dropped",
    variables:{siteName:input.name.slice(0,200),score:input.score,previousScore:previous.score,
      period:`${input.strategy} · ${PERFORMANCE_METHOD_VERSION}`,actionPath:`/site/${input.slug}?strategy=${input.strategy}`}},tx);
}

/** Snapshot notifications commit with closure; repeated finalization cannot regenerate them. */
export async function notifyPeriodResults(tx:Transaction,period:{id:string;kind:PeriodKind;periodKey:string;startAt:Date}) {
  const previous=getPeriodBounds(period.kind,new Date(period.startAt.getTime()-1));
  const rows=await tx.execute<{site_id:string;owner_id:string;name:string;slug:string;strategy:"mobile"|"desktop";rank:number;score:number;previous_rank:number|null}>(sql`
    SELECT r.site_id,s.owner_id,s.name,s.slug,r.strategy,r.rank,r.score,old.rank AS previous_rank
    FROM ranking_snapshots r JOIN sites s ON s.id=r.site_id
    LEFT JOIN notification_preferences pref ON pref.user_id=s.owner_id
    LEFT JOIN competition_periods p ON p.period_key=${previous.periodKey} AND p.status='closed'
      AND p.ranking_algorithm_version='ranking-v1' AND p.performance_method_version=${PERFORMANCE_METHOD_VERSION}
    LEFT JOIN ranking_snapshots old ON old.period_id=p.id AND old.site_id=r.site_id
      AND old.scope='overall' AND old.scope_key='' AND old.strategy=r.strategy
    WHERE r.period_id=${period.id} AND r.scope='overall' AND r.scope_key='' AND s.owner_id IS NOT NULL
      AND s.is_listed AND s.lifecycle='active' AND s.archived_at IS NULL AND coalesce(pref.weekly,true)
    ORDER BY r.site_id,r.strategy LIMIT 200`);
  for(const row of rows){
    const variables={siteName:row.name.slice(0,200),score:row.score,rank:row.rank,period:`${period.periodKey} · ${row.strategy}`,
      actionPath:`/${period.kind}/${period.periodKey}?strategy=${row.strategy}`};
    const key=`${period.id}:${row.site_id}:${row.strategy}`;
    if(period.kind==="weekly") {
      await enqueueNotification({userId:row.owner_id,eventKey:`weekly-result:${key}`,type:"weekly_result",variables},tx);
      if(row.rank===1) await enqueueNotification({userId:row.owner_id,eventKey:`weekly-winner:${key}`,type:"weekly_winner",variables},tx);
    }
    if(row.previous_rank!==null && row.previous_rank!==row.rank)
      await enqueueNotification({userId:row.owner_id,eventKey:`ranking-changed:${key}`,type:"ranking_changed",variables},tx);
  }
}

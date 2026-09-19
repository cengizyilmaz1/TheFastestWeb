import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { achievements, backgroundJobs, notificationPreferences, siteAwards, sites, type BackgroundJob } from "@/db/schema";
import { PERFORMANCE_METHOD_VERSION } from "@/modules/performance/service";
import { enqueueNotification } from "@/modules/notifications/service";
import { AppError } from "@/lib/http/errors";
import { recordAnalyticsEvent } from "@/modules/analytics/events";

const definitions = {
  score90: ["90+ performance", "A complete standardized lab batch scored at least 90."],
  score100: ["100 performance", "A complete standardized lab batch scored 100."],
  weeklyWinner: ["Weekly winner", "Finished #1 overall in a closed weekly competition."],
  monthlyWinner: ["Monthly winner", "Finished #1 overall in a closed monthly competition."],
  weeklyTop10: ["Weekly top 10", "Finished among the top ten in a closed weekly competition."],
  monthlyTop10: ["Monthly top 10", "Finished among the top ten in a closed monthly competition."],
  mostImproved: ["Most improved", "Had the highest positive score-point gain in a closed competition."],
  newcomerWinner: ["Fastest newcomer", "Finished #1 among new entrants in a closed competition."],
  countryWinner: ["Country winner", "Finished #1 in an explicit country partition."],
  categoryWinner: ["Category winner", "Finished #1 in a category partition."],
  technologyWinner: ["Technology winner", "Finished #1 in a technology partition."],
  weeklyStreak3: ["Three weekly wins", "Won three consecutive ISO weekly competitions for the same strategy."],
  daily90Streak7: ["Seven days at 90+", "The latest complete batch on each of seven consecutive UTC days scored at least 90."],
} as const;
type AwardKey = keyof typeof definitions;
type Candidate = { key: AwardKey; event: string; periodId?: string; evidence: Record<string, unknown> };
function database() {
  const db=getDb();
  if (!db) throw new AppError("DATABASE_UNAVAILABLE","Awards are temporarily unavailable.",503);
  return db;
}
const eventKey = (siteId:string,key:string,event:string) => `award:${siteId}:${key}:${createHash("sha256").update(event).digest("hex").slice(0,32)}`;

/** Idempotent evidence-derived awards; no account, payment or manually supplied score can award itself. */
export async function evaluateSiteAwards(siteId:string, options:{ notify?:boolean;job?:BackgroundJob }={}) {
  z.uuid().parse(siteId);
  return database().transaction(async (tx) => {
    if(options.job) {
      const [owned]=await tx.select({id:backgroundJobs.id}).from(backgroundJobs).where(and(eq(backgroundJobs.id,options.job.id),
        eq(backgroundJobs.status,"running"),eq(backgroundJobs.leaseToken,options.job.leaseToken!),sql`${backgroundJobs.leasedUntil}>now()`)).for("update");
      if(!owned) return {awarded:0};
    }
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`awards:${siteId}`},0))`);
    const [site]=await tx.select().from(sites).where(eq(sites.id,siteId)).for("share");
    if (!site || !site.isListed || site.lifecycle!=="active" || site.archivedAt) return { awarded:0 };
    const candidates:Candidate[]=[];
    const best=await tx.execute<{ id:string;strategy:string;score:number }>(sql`
      SELECT DISTINCT ON(strategy) id,strategy,score FROM speed_tests WHERE site_id=${siteId}
        AND methodology_version=${PERFORMANCE_METHOD_VERSION} AND metrics_source='lab' AND sample_count>=2
        AND tested_at<=now() AND score BETWEEN 90 AND 100 AND lcp_ms>=0 AND cls BETWEEN 0 AND 3600000 AND tbt_ms>=0
      ORDER BY strategy,score DESC,tested_at,id`);
    for(const row of best) {
      candidates.push({ key:"score90",event:row.strategy,evidence:{ measurementId:row.id,score:row.score,strategy:row.strategy,methodologyVersion:PERFORMANCE_METHOD_VERSION } });
      if(row.score===100) candidates.push({ key:"score100",event:row.strategy,evidence:{ measurementId:row.id,score:row.score,strategy:row.strategy,methodologyVersion:PERFORMANCE_METHOD_VERSION } });
    }
    const snapshots=await tx.execute<{ id:string;period_id:string;period_key:string;kind:"weekly"|"monthly";scope:string;scope_key:string;strategy:string;rank:number;score:number;evidence:Record<string,unknown> }>(sql`
      SELECT r.id,r.period_id,p.period_key,p.kind,r.scope,r.scope_key,r.strategy,r.rank,r.score,r.evidence
      FROM ranking_snapshots r JOIN competition_periods p ON p.id=r.period_id
      WHERE r.site_id=${siteId} AND p.status='closed' AND p.ranking_algorithm_version='ranking-v1'
        AND p.performance_method_version=${PERFORMANCE_METHOD_VERSION} AND r.sample_count>=2
        AND ((r.scope='overall' AND r.rank<=10) OR r.rank=1)
        AND NOT EXISTS(SELECT 1 FROM site_awards a WHERE a.site_id=${siteId} AND a.evidence->>'snapshotId'=r.id::text)
      ORDER BY p.start_at,r.id LIMIT 100`);
    for(const row of snapshots) {
      const evidence={ ...row.evidence,snapshotId:row.id,periodKey:row.period_key,scope:row.scope,scopeKey:row.scope_key,strategy:row.strategy,rank:row.rank,score:row.score };
      const push=(key:AwardKey) => candidates.push({ key,event:row.id,periodId:row.period_id,evidence });
      if(row.scope==="overall") {
        push(row.kind==="weekly" ? "weeklyTop10" : "monthlyTop10");
        if(row.rank===1) push(row.kind==="weekly" ? "weeklyWinner" : "monthlyWinner");
      } else if(row.rank===1) {
        const scoped:Record<string,AwardKey>={ improved:"mostImproved",newcomer:"newcomerWinner",country:"countryWinner",category:"categoryWinner",technology:"technologyWinner" };
        if(scoped[row.scope]) push(scoped[row.scope]);
      }
    }
    for(const strategy of ["mobile","desktop"] as const) {
      const wins=await tx.execute<{ id:string;start_at:string;period_id:string;period_key:string }>(sql`
        SELECT r.id,p.start_at,p.id AS period_id,p.period_key FROM ranking_snapshots r
        JOIN competition_periods p ON p.id=r.period_id WHERE r.site_id=${siteId} AND r.strategy=${strategy}
          AND r.scope='overall' AND r.rank=1 AND p.kind='weekly' AND p.status='closed'
          AND p.performance_method_version=${PERFORMANCE_METHOD_VERSION} AND p.ranking_algorithm_version='ranking-v1'
        ORDER BY p.start_at DESC LIMIT 3`);
      if(wins.length===3 && wins.every((row,index)=>index===0 || new Date(wins[index-1].start_at).getTime()-new Date(row.start_at).getTime()===7*86_400_000)) {
        candidates.push({ key:"weeklyStreak3",event:`${strategy}:${wins[0].period_key}`,periodId:wins[0].period_id,
          evidence:{ strategy,snapshotIds:wins.map((row)=>row.id),periodKeys:wins.map((row)=>row.period_key) } });
      }
      const days=await tx.execute<{ id:string;day:string;score:number }>(sql`
        SELECT * FROM (SELECT DISTINCT ON((tested_at AT TIME ZONE 'UTC')::date)
          id,((tested_at AT TIME ZONE 'UTC')::date)::text AS day,score FROM speed_tests
          WHERE site_id=${siteId} AND strategy=${strategy} AND methodology_version=${PERFORMANCE_METHOD_VERSION}
            AND metrics_source='lab' AND sample_count>=2 AND tested_at<=now() AND lcp_ms>=0 AND cls BETWEEN 0 AND 3600000 AND tbt_ms>=0
          ORDER BY (tested_at AT TIME ZONE 'UTC')::date DESC,tested_at DESC,id) daily LIMIT 7`);
      if(days.length===7 && days.every((row,index)=>row.score>=90 && row.score<=100
        && (index===0 || Date.parse(days[index-1].day)-Date.parse(row.day)===86_400_000))) {
        candidates.push({ key:"daily90Streak7",event:`${strategy}:${days[0].day}`,evidence:{ strategy,measurementIds:days.map((row)=>row.id),days:days.map((row)=>row.day) } });
      }
    }
    const [preferences]=site.ownerId ? await tx.select().from(notificationPreferences).where(eq(notificationPreferences.userId,site.ownerId)) : [];
    let awarded=0;
    // Shared definition inserts lock in one order even when sites earn different sets.
    candidates.sort((a,b)=>a.key.localeCompare(b.key) || a.event.localeCompare(b.event));
    for(const candidate of candidates) {
      const [title,description]=definitions[candidate.key];
      const [insertedDefinition]=await tx.insert(achievements).values({ key:candidate.key,title,description })
        .onConflictDoNothing({ target:achievements.key }).returning();
      const definition=insertedDefinition ?? (await tx.select().from(achievements).where(eq(achievements.key,candidate.key)))[0];
      if(!definition.active) continue;
      const [award]=await tx.insert(siteAwards).values({ siteId,achievementId:definition.id,periodId:candidate.periodId,
        eventKey:eventKey(siteId,candidate.key,candidate.event),evidence:candidate.evidence }).onConflictDoNothing({ target:siteAwards.eventKey }).returning();
      if(!award) continue;
      await recordAnalyticsEvent({name:"badge_awarded",eventKey:`badge-awarded:${award.id}`,siteId,
        properties:{achievementId:definition.id,...(candidate.periodId ? {periodId:candidate.periodId} : {})}},tx);
      awarded++;
      if(options.notify && site.ownerId && (preferences?.badge ?? true)) await enqueueNotification({ userId:site.ownerId,
        eventKey:`badge:${award.id}`,type:"badge_awarded",variables:{ siteName:site.name,actionPath:`/site/${site.slug}` } },tx);
    }
    return { awarded };
  });
}

export async function listSiteAwards(siteId:string, options:{limit?:number;cursor?:string}={}) {
  z.uuid().parse(siteId);
  const limit=z.number().int().min(1).max(100).parse(options.limit ?? 25),db=database();
  const [site]=await db.select({ id:sites.id }).from(sites).where(and(eq(sites.id,siteId),eq(sites.isListed,true),eq(sites.lifecycle,"active"),sql`${sites.archivedAt} IS NULL`));
  if(!site) return { items:[],nextCursor:null };
  const cursor=options.cursor ? z.uuid().parse(options.cursor) : undefined;
  const [after]=cursor ? await db.select({ id:siteAwards.id,at:siteAwards.awardedAt }).from(siteAwards).where(and(eq(siteAwards.id,cursor),eq(siteAwards.siteId,siteId))) : [];
  if(cursor && !after) throw new AppError("INVALID_REQUEST","Invalid award cursor.",400);
  const rows=await db.select({ id:siteAwards.id,key:achievements.key,title:achievements.title,description:achievements.description,
    evidence:siteAwards.evidence,awardedAt:siteAwards.awardedAt,periodId:siteAwards.periodId }).from(siteAwards)
    .innerJoin(achievements,eq(achievements.id,siteAwards.achievementId)).where(and(eq(siteAwards.siteId,siteId),after ?
      sql`(${siteAwards.awardedAt},${siteAwards.id})<(${after.at.toISOString()}::timestamptz,${after.id}::uuid)` : undefined))
    .orderBy(desc(siteAwards.awardedAt),desc(siteAwards.id)).limit(limit+1);
  return { items:rows.slice(0,limit),nextCursor:rows.length>limit ? rows[limit-1].id : null };
}

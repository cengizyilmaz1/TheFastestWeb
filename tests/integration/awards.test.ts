import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { evaluateSiteAwards, listSiteAwards } from "../../src/modules/awards/service";
import { verifySiteBadge } from "../../src/modules/badges/service";
import { operateJob, processBackgroundJob, scheduleDailyProductJobs } from "../../src/modules/jobs/service";
import { cleanupIntegrationDatabase, fixtureSql, prepareIntegrationDatabase, resetIntegrationData } from "./database";

const {badge}=vi.hoisted(()=>({badge:vi.fn()}));
vi.mock("../../src/infrastructure/browser/badge-verification",()=>({getVerifiedBadge:badge}));
vi.mock("../../src/config/env",()=>({getEnv:()=>({EMAIL_ENABLED:false,JOB_MAX_ATTEMPTS:3})}));
let owner:string,siteId:string;
beforeAll(prepareIntegrationDatabase,60_000);
afterAll(cleanupIntegrationDatabase,30_000);
beforeEach(async()=>{
  await resetIntegrationData();
  owner=randomUUID();siteId=randomUUID();
  await fixtureSql()`INSERT INTO users(id,email,name) VALUES(${owner},'awards@example.invalid','Synthetic award owner')`;
  await fixtureSql()`INSERT INTO sites(id,slug,name,url,normalized_url,description,owner_id,owner_name,is_listed,lifecycle,requires_badge)
    VALUES(${siteId},'synthetic-awards','Synthetic award site','https://example.com/','https://example.com/','Fixture',${owner},'Synthetic owner',true,'active',true)`;
  badge.mockReset().mockResolvedValue({verified:false,status:"missing"});
});
async function sample(score:number,dayOffset=0,method="psi-v2-two-sample") {
  const id=randomUUID();
  await fixtureSql()`INSERT INTO speed_tests(id,site_id,score,lcp_ms,cls,tbt_ms,methodology_version,sample_count,tested_at)
    VALUES(${id},${siteId},${score},1000,0.1,20,${method},2,date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'-(${dayOffset}*interval '1 day'))`;
  return id;
}
async function snapshot(index:number,rank=1,scope="overall") {
  const id=randomUUID(),periodId=randomUUID();
  await fixtureSql()`INSERT INTO competition_periods(id,kind,period_key,start_at,end_at,ranking_algorithm_version,performance_method_version)
    VALUES(${periodId},'weekly',${`synthetic-${index}`},date_trunc('week',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'-((${index}+1)*interval '7 days'),
      date_trunc('week',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'-(${index}*interval '7 days'),'ranking-v1','psi-v2-two-sample')`;
  await fixtureSql()`INSERT INTO ranking_snapshots(id,period_id,scope,site_id,rank,score,sample_count,evidence,site_snapshot)
    VALUES(${id},${periodId},${scope},${siteId},${rank},95,2,'{"improvement":15}','{}')`;
  await fixtureSql()`UPDATE competition_periods SET status='closed',closed_at=now() WHERE id=${periodId}`;
  return id;
}

describe("evidence-only idempotent achievements",()=>{
  it("honors account and active site Pro exemptions before badge network work without changing stored requirements",async()=>{
    await fixtureSql()`UPDATE users SET is_pro=true WHERE id=${owner}`;
    expect(await verifySiteBadge(siteId,{dryRun:false,notify:true})).toEqual({status:"skipped"});
    await fixtureSql()`UPDATE users SET is_pro=false WHERE id=${owner}`;
    await fixtureSql()`INSERT INTO entitlements(site_id,kind,source,source_id,ends_at)
      VALUES(${siteId},'PRO','legacy',${`site:${siteId}`},now()+interval '1 day')`;
    expect(await verifySiteBadge(siteId,{dryRun:false})).toEqual({status:"skipped"});
    await scheduleDailyProductJobs();
    expect((await fixtureSql()`SELECT count(*)::int AS total FROM background_jobs WHERE kind='site.badge.verify'`)[0].total).toBe(0);
    expect(badge).not.toHaveBeenCalled();
    const [unchanged]=await fixtureSql()`SELECT requires_badge,badge_status FROM sites WHERE id=${siteId}`;
    expect({...unchanged}).toEqual({requires_badge:true,badge_status:"missing"});
    await fixtureSql()`UPDATE entitlements SET status='revoked' WHERE site_id=${siteId}`;
    expect(await verifySiteBadge(siteId)).toMatchObject({status:"grace_period",dryRun:true});expect(badge).toHaveBeenCalledTimes(1);
  });
  it("rechecks an exemption granted while a badge response was in flight",async()=>{
    badge.mockImplementation(async()=>{await fixtureSql()`UPDATE users SET is_pro=true WHERE id=${owner}`;return {status:"missing",verified:false};});
    expect(await verifySiteBadge(siteId,{dryRun:false,notify:true})).toEqual({status:"skipped"});
    expect((await fixtureSql()`SELECT badge_status FROM sites WHERE id=${siteId}`)[0].badge_status).toBe("missing");
    expect((await fixtureSql()`SELECT count(*)::int AS total FROM notifications`)[0].total).toBe(0);
  });
  it("ignores legacy scores and creates genuine 90/100 awards once under concurrent evaluation",async()=>{
    await sample(100,0,"legacy-unspecified");
    expect(await evaluateSiteAwards(siteId)).toEqual({awarded:0});
    const id=await sample(100);
    const results=await Promise.all([1,2,3].map(()=>evaluateSiteAwards(siteId,{notify:true})));
    expect(results.reduce((n,row)=>n+row.awarded,0)).toBe(2);
    const awards=await listSiteAwards(siteId);
    expect(awards.items.map(row=>row.key).sort()).toEqual(["score100","score90"]);
    expect(awards.items.every(row=>row.evidence.measurementId===id)).toBe(true);
    const [messages]=await fixtureSql()`SELECT (SELECT count(*)::integer FROM notifications) AS notifications,(SELECT count(*)::integer FROM email_deliveries) AS emails`;
    expect({...messages}).toEqual({notifications:2,emails:0});
  });
  it("honors notification preferences and keeps private-site awards out of public responses",async()=>{
    await fixtureSql()`INSERT INTO notification_preferences(user_id,badge) VALUES(${owner},false)`;
    await sample(92);
    expect(await evaluateSiteAwards(siteId,{notify:true})).toEqual({awarded:1});
    const [row]=await fixtureSql()`SELECT count(*)::integer AS total FROM notifications`;
    expect(row.total).toBe(0);
    await fixtureSql()`UPDATE sites SET is_listed=false WHERE id=${siteId}`;
    expect((await listSiteAwards(siteId)).items).toEqual([]);
    expect(await evaluateSiteAwards(siteId)).toEqual({awarded:0});
  });
  it("requires seven consecutive UTC-day latest samples for a 90+ streak",async()=>{
    for(let day=0;day<7;day++) await sample(94,day);
    await evaluateSiteAwards(siteId);
    expect((await listSiteAwards(siteId)).items.map(row=>row.key)).toContain("daily90Streak7");
    // A separate site with a missing day cannot inherit the prior streak evidence.
    await fixtureSql()`TRUNCATE site_awards,achievements CASCADE`;
    await fixtureSql()`DELETE FROM speed_tests WHERE site_id=${siteId} AND tested_at=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'-interval '3 days'`;
    await evaluateSiteAwards(siteId);
    expect((await listSiteAwards(siteId)).items.map(row=>row.key)).not.toContain("daily90Streak7");
  });
  it("derives period wins, top10 and a three-week streak from closed snapshots only",async()=>{
    const ids=await Promise.all([0,1,2].map(index=>snapshot(index)));
    await evaluateSiteAwards(siteId);
    const awards=await listSiteAwards(siteId,{limit:100});
    expect(awards.items.filter(row=>row.key==="weeklyWinner")).toHaveLength(3);
    expect(awards.items.filter(row=>row.key==="weeklyTop10")).toHaveLength(3);
    const streak=awards.items.find(row=>row.key==="weeklyStreak3");
    expect((streak?.evidence.snapshotIds as string[]).sort()).toEqual(ids.sort());
    expect(await evaluateSiteAwards(siteId)).toEqual({awarded:0});
    const first=await listSiteAwards(siteId,{limit:2});
    expect(first.nextCursor).not.toBeNull();
    const next=await listSiteAwards(siteId,{limit:2,cursor:first.nextCursor!});
    expect(next.items.some(row=>first.items.some(previous=>previous.id===row.id))).toBe(false);
  });
});

describe("badge observations without destructive side effects",()=>{
  it("defaults to a dry-run and gives confirmed missing badges a seven-day grace window",async()=>{
    const [before]=await fixtureSql()`SELECT to_jsonb(s) AS value FROM sites s WHERE id=${siteId}`;
    expect(await verifySiteBadge(siteId)).toMatchObject({dryRun:true,status:"grace_period",previous:"missing"});
    const [after]=await fixtureSql()`SELECT to_jsonb(s) AS value FROM sites s WHERE id=${siteId}`;
    expect(after.value).toEqual(before.value);
    expect(await verifySiteBadge(siteId,{dryRun:false})).toMatchObject({dryRun:false,status:"grace_period"});
    const [site]=await fixtureSql()`SELECT is_listed,lifecycle,monitoring_paused,badge_grace_until>now()+interval '6 days' AS grace FROM sites WHERE id=${siteId}`;
    expect({...site}).toEqual({is_listed:true,lifecycle:"active",monitoring_paused:false,grace:true});
  });
  it("preserves history and access across expired grace, network failure and recovery",async()=>{
    await sample(95);
    await fixtureSql()`UPDATE sites SET badge_status='grace_period',badge_grace_until=now()-interval '1 day' WHERE id=${siteId}`;
    badge.mockResolvedValue({verified:false,status:"temporarily_unreachable"});
    expect(await verifySiteBadge(siteId,{dryRun:false})).toMatchObject({status:"temporarily_unreachable"});
    badge.mockResolvedValue({verified:false,status:"missing"});
    expect(await verifySiteBadge(siteId,{dryRun:false,notify:true})).toMatchObject({status:"failed"});
    const [retained]=await fixtureSql()`SELECT is_listed,lifecycle,monitoring_paused,(SELECT count(*)::integer FROM speed_tests) AS history FROM sites WHERE id=${siteId}`;
    expect({...retained}).toEqual({is_listed:true,lifecycle:"active",monitoring_paused:false,history:1});
    badge.mockResolvedValue({verified:true,status:"verified"});
    expect(await verifySiteBadge(siteId,{dryRun:false})).toMatchObject({status:"verified",graceUntil:null});
  });
  it("queues status application only after the dry-run job completes",async()=>{
    await Promise.all([scheduleDailyProductJobs(),scheduleDailyProductJobs()]);
    const [preview]=await fixtureSql()`SELECT id FROM background_jobs WHERE kind='site.badge.verify'`;
    const [counts]=await fixtureSql()`SELECT count(*)::integer AS total FROM background_jobs WHERE kind='site.badge.verify'`;
    expect(counts.total).toBe(1);
    expect(await processBackgroundJob(preview.id)).toEqual({status:"succeeded"});
    const [untouched]=await fixtureSql()`SELECT badge_status,badge_checked_at FROM sites WHERE id=${siteId}`;
    expect({...untouched}).toEqual({badge_status:"missing",badge_checked_at:null});
    await scheduleDailyProductJobs();
    const [apply]=await fixtureSql()`SELECT id FROM background_jobs WHERE kind='site.badge.verify' AND payload->>'dryRun'='false'`;
    expect(await processBackgroundJob(apply.id)).toEqual({status:"succeeded"});
    const [updated]=await fixtureSql()`SELECT badge_status FROM sites WHERE id=${siteId}`;
    expect(updated.badge_status).toBe("grace_period");
  });
  it("runs a queued ranking closure idempotently and leaves periods empty without evidence",async()=>{
    await scheduleDailyProductJobs();
    const [job]=await fixtureSql()`SELECT id FROM background_jobs WHERE kind='ranking.finalize'`;
    expect(await processBackgroundJob(job.id)).toEqual({status:"succeeded"});
    expect(await processBackgroundJob(job.id)).toEqual({status:"skipped"});
    const [result]=await fixtureSql()`SELECT (SELECT count(*)::integer FROM competition_periods WHERE status='closed') AS closed,
      (SELECT count(*)::integer FROM ranking_snapshots) AS snapshots`;
    expect({...result}).toEqual({closed:2,snapshots:0});
  });
  it("does not apply a badge observation after the operator cancels its lease",async()=>{
    const id=randomUUID();
    await fixtureSql()`INSERT INTO background_jobs(id,queue,kind,job_key,site_id,payload)
      VALUES(${id},'badges','site.badge.verify',${`badge-cancel:${id}`},${siteId},${fixtureSql().json({siteId,dryRun:false})})`;
    let enter!:()=>void,release!:()=>void;
    const entered=new Promise<void>(resolve=>{enter=resolve;});
    badge.mockImplementation(()=>new Promise(resolve=>{release=()=>resolve({verified:false,status:"missing"});enter();}));
    const running=processBackgroundJob(id);
    await entered;
    try {await operateJob(id,"cancel");} finally {release();}
    expect(await running).toEqual({status:"deferred"});
    const [row]=await fixtureSql()`SELECT badge_status,badge_checked_at FROM sites WHERE id=${siteId}`;
    expect({...row}).toEqual({badge_status:"missing",badge_checked_at:null});
  });
});

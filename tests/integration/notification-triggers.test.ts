import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from "vitest";
import { getDb } from "../../src/db";
import { notifications,speedTests } from "../../src/db/schema";
import { notifyPerformanceChange } from "../../src/modules/notifications/triggers";
import { finalizeCompetitionPeriod,getPeriodBounds } from "../../src/modules/rankings/service";
import { processBackgroundJob,scheduleManualRetest } from "../../src/modules/jobs/service";
import { cleanupIntegrationDatabase,fixtureSql,prepareIntegrationDatabase,resetIntegrationData } from "./database";
const {psi}=vi.hoisted(()=>({psi:vi.fn()}));
vi.mock("../../src/lib/pagespeed",()=>({runPageSpeedTest:psi}));
vi.mock("../../src/config/env",()=>({getEnv:()=>({EMAIL_ENABLED:false,JOB_MAX_ATTEMPTS:3,SITE_URL:"https://example.com"})}));
let owner:string,siteId:string;
beforeAll(prepareIntegrationDatabase,60_000);afterAll(cleanupIntegrationDatabase,30_000);
beforeEach(async()=>{
  await resetIntegrationData();owner=randomUUID();siteId=randomUUID();
  await fixtureSql()`INSERT INTO users(id,email,name) VALUES(${owner},'notify@example.invalid','Synthetic owner')`;
  await fixtureSql()`INSERT INTO sites(id,slug,name,url,normalized_url,description,owner_id,owner_name,is_listed,lifecycle)
    VALUES(${siteId},'notify-site','Notify fixture','https://example.com/','https://example.com/','Fixture',${owner},'Synthetic owner',true,'active')`;
  psi.mockReset().mockResolvedValue({score:94,loadTimeMs:1000,fcpMs:500,lcpMs:1000,cls:0.01,tbtMs:5,ttiMs:null,siMs:1000,
    fcpScore:0.9,lcpScore:0.9,clsScore:0.9,tbtScore:0.9,ttiScore:null,siScore:0.9,fcp:"0.5 s",lcp:"1 s",clsDisplay:"0.01",tbt:"5 ms",tti:"Unavailable",si:"1 s",loadTime:"1 s",lighthouseVersion:"13.0.0",rawResponse:{}});
});
async function sample(score:number,strategy="mobile",method="psi-v2-two-sample",at=new Date(Date.now()-86_400_000)){
  const id=randomUUID();await fixtureSql()`INSERT INTO speed_tests(id,site_id,score,strategy,methodology_version,sample_count,lcp_ms,cls,tbt_ms,tested_at)
    VALUES(${id},${siteId},${score},${strategy},${method},2,1000,0.01,5,${at})`;return id;
}
describe("transactional evidence notification triggers",()=>{
  it("emits one significant job improvement using the same device/method and no mail when disabled",async()=>{
    await sample(70);await sample(100,"desktop");await sample(99,"mobile","legacy-unspecified");
    const job=await scheduleManualRetest(siteId,owner);
    expect((await processBackgroundJob(job.id)).status).toBe("succeeded");
    await processBackgroundJob(job.id);
    const rows=await fixtureSql()`SELECT type,payload FROM notifications`;
    expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({type:"performance_improved",payload:{score:94,previousScore:70}});
    expect((await fixtureSql()`SELECT count(*)::int AS total FROM email_deliveries`)[0].total).toBe(0);
    const events=await fixtureSql()`SELECT name,properties FROM analytics_events ORDER BY name`;
    expect(events.map(row=>row.name)).toEqual(["speed_test_completed","speed_test_started"]);
    expect(JSON.stringify(events)).not.toContain("example.com");expect(JSON.stringify(events)).not.toContain("Synthetic owner");
  });
  it("suppresses disabled performance preferences and changes smaller than ten points",async()=>{
    await sample(99);const job=await scheduleManualRetest(siteId,owner);await processBackgroundJob(job.id);
    expect((await fixtureSql()`SELECT count(*)::int AS total FROM notifications`)[0].total).toBe(0);
    await fixtureSql()`INSERT INTO notification_preferences(user_id,performance) VALUES(${owner},false)`;
    const current=await sample(30);await getDb()!.transaction(tx=>notifyPerformanceChange(tx,{measurementId:current,siteId,ownerId:owner,name:"Fixture",slug:"notify-site",score:30,strategy:"mobile"}));
    expect((await fixtureSql()`SELECT count(*)::int AS total FROM notifications`)[0].total).toBe(0);
  });
  it("rolls back a decrease notification with its measurement transaction",async()=>{
    await sample(95);
    await expect(getDb()!.transaction(async(tx)=>{
      const [measurement]=await tx.insert(speedTests).values({siteId,score:60,lcpMs:1000,cls:0.01,tbtMs:5,methodologyVersion:"psi-v2-two-sample",sampleCount:2}).returning();
      await notifyPerformanceChange(tx,{measurementId:measurement.id,siteId,ownerId:owner,name:"Fixture",slug:"notify-site",score:60,strategy:"mobile"});
      const [notification]=await tx.select({type:notifications.type}).from(notifications);expect(notification.type).toBe("performance_dropped");
      throw new Error("Synthetic abort");
    })).rejects.toThrow("Synthetic abort");
    expect((await fixtureSql()`SELECT count(*)::int AS total FROM notifications`)[0].total).toBe(0);
    expect((await fixtureSql()`SELECT count(*)::int AS total FROM speed_tests`)[0].total).toBe(1);
  });
  it("records weekly results/winners once, compares matching previous ranks and honors weekly opt-out",async()=>{
    const current=getPeriodBounds("weekly",new Date()),last=getPeriodBounds("weekly",new Date(current.startAt.getTime()-1)),prior=getPeriodBounds("weekly",new Date(last.startAt.getTime()-1));
    await sample(90,"mobile","psi-v2-two-sample",new Date(prior.startAt.getTime()+86400000));
    await finalizeCompetitionPeriod("weekly",prior.periodKey);
    const competitor=randomUUID();await fixtureSql()`INSERT INTO sites(id,slug,name,url,normalized_url,description,owner_name,is_listed,lifecycle)
      VALUES(${competitor},'competitor','Competitor','https://example.org/','https://example.org/','Fixture','Fixture',true,'active')`;
    await sample(90,"mobile","psi-v2-two-sample",new Date(last.startAt.getTime()+86400000));
    await fixtureSql()`INSERT INTO speed_tests(site_id,score,strategy,methodology_version,sample_count,lcp_ms,cls,tbt_ms,tested_at)
      VALUES(${competitor},99,'mobile','psi-v2-two-sample',2,1000,0.01,5,${new Date(last.startAt.getTime()+86400000)})`;
    await Promise.all([1,2].map(()=>finalizeCompetitionPeriod("weekly",last.periodKey)));
    const rows=await fixtureSql()`SELECT type,count(*)::int AS total FROM notifications GROUP BY type ORDER BY type`;
    expect(rows.map(row=>({...row}))).toEqual([{type:"ranking_changed",total:1},{type:"weekly_result",total:2},{type:"weekly_winner",total:1}]);
    await fixtureSql()`INSERT INTO notification_preferences(user_id,weekly) VALUES(${owner},false)`;
    const old=getPeriodBounds("weekly",new Date(prior.startAt.getTime()-1));await sample(98,"mobile","psi-v2-two-sample",new Date(old.startAt.getTime()+86400000));
    await finalizeCompetitionPeriod("weekly",old.periodKey);
    expect((await fixtureSql()`SELECT count(*)::int AS total FROM notifications`)[0].total).toBe(4);
    expect((await fixtureSql()`SELECT count(*)::int AS total FROM analytics_events WHERE name='ranking_finalized'`)[0].total).toBe(3);
  });
});

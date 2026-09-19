import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from "vitest";
import { getSiteProfile } from "../../src/modules/sites/profile";
import { finalizeCompetitionPeriod,getPeriodBounds,getSiteRankingPositions,listRanking } from "../../src/modules/rankings/service";
import { getCompetitionOverview } from "../../src/modules/rankings/overview";
import { evaluateSiteAwards } from "../../src/modules/awards/service";
import { seedRuntimeRankings } from "../../scripts/seed-runtime-rankings";
import { cleanupIntegrationDatabase,fixtureSql,prepareIntegrationDatabase,resetIntegrationData } from "./database";
const {auth}=vi.hoisted(()=>({auth:vi.fn()}));vi.mock("../../src/auth",()=>({auth}));
let owner:string,now:Date;
beforeAll(prepareIntegrationDatabase,60_000);afterAll(cleanupIntegrationDatabase,30_000);
beforeEach(async()=>{
  await resetIntegrationData();auth.mockReset().mockResolvedValue(null);owner=randomUUID();now=(await fixtureSql()`SELECT now() AS at`)[0].at;
  await fixtureSql()`INSERT INTO users(id,email,name) VALUES(${owner},'profile-owner@example.invalid','Private owner')`;
});
async function website(slug:string,createdAt=new Date(now.getTime()-90*86_400_000),country="TR"){
  const id=randomUUID();await fixtureSql()`INSERT INTO sites(id,slug,name,url,normalized_url,description,owner_id,owner_name,is_listed,lifecycle,created_at,country_code,requires_badge,badge_status,badge_checked_at)
    VALUES(${id},${slug},${slug},${`https://example.com/${slug}`},${`https://example.com/${slug}`},'Fixture',${owner},'Private owner',true,'active',${createdAt},${country},true,'verified',now())`;
  return id;
}
async function measure(siteId:string,score:number,at=new Date(now.getTime()-60_000),strategy="mobile",method="psi-v2-two-sample"){
  await fixtureSql()`INSERT INTO speed_tests(site_id,score,lcp_ms,cls,tbt_ms,fcp_ms,si_ms,tested_at,strategy,methodology_version,sample_count)
    VALUES(${siteId},${score},1000,0.05,20,600,1100,${at},${strategy},${method},${method==='legacy-unspecified'?1:2})`;
}
async function capture(siteId:string,at:Date,options:{device?:string;expires?:Date;source?:string}={}){
  const id=randomUUID();await fixtureSql()`INSERT INTO site_screenshots(id,site_id,service_job_id,device,mode,object_key,public_url,width,height,content_type,size,hash,captured_at,retention_until,source_url,status)
    VALUES(${id},${siteId},${randomUUID()},${options.device??'mobile'},'viewport',${`thefastestweb/screens/${id}.webp`},${`https://media.example.com/${id}.webp`},390,844,'image/webp',10,${'a'.repeat(64)},${at},${options.expires??new Date(now.getTime()+86_400_000)},${options.source??'https://example.com/old-version'},'ready')`;
  return id;
}
describe("complete site reports and competition archives",()=>{
  it("seeds only a guarded synthetic browser fixture with valid immutable period transitions",async()=>{
    const first=await website("synthetic-one"),second=await website("synthetic-two"),other=await website("not-synthetic");
    await expect(seedRuntimeRankings(fixtureSql(),[first,other])).rejects.toThrow("guard");
    const periods=await seedRuntimeRankings(fixtureSql(),[first,second]);
    expect((await getCompetitionOverview("weekly",periods.weekly))?.stats.finalists).toBe(2);
    expect((await getCompetitionOverview("monthly",periods.monthly))?.stats.finalists).toBe(2);
    expect((await fixtureSql()`SELECT count(*)::int AS count FROM ranking_snapshots`)[0].count).toBe(8);
  });
  it("uses the ranking engine for positions, separates devices and counts real consecutive UTC batches",async()=>{
    const first=await website("first"),second=await website("second");
    await measure(first,95);await measure(second,80);await measure(first,60,undefined,"desktop");await measure(second,99,undefined,"desktop");
    for(const days of [1,2,4])await measure(first,92,new Date(now.getTime()-days*86_400_000));
    await measure(first,100,new Date(now.getTime()-1_000),"mobile","legacy-unspecified");
    await fixtureSql()`INSERT INTO site_categories(site_id,category_id,is_primary) SELECT ${first},id,true FROM categories WHERE slug='saas'`;
    await fixtureSql()`INSERT INTO site_technologies(site_id,technology_id) SELECT ${first},id FROM technologies WHERE slug='nextjs'`;
    const profile=await getSiteProfile("first","mobile","psi-v2-two-sample");
    expect(profile?.latest).toMatchObject({score:95,fcpMs:600,siMs:1100});expect(profile?.site).toMatchObject({badgeStatus:"verified",badgeRequired:true});
    expect(profile?.streak.days).toBe(3);
    const weekly=await listRanking({kind:"weekly",scope:"country",scopeKey:"TR"});
    expect(profile?.rankingPositions.items.find(row=>row.kind==="weekly"&&row.scope==="country")?.rank).toBe(weekly.items.find(row=>row.siteId===first)?.rank);
    expect((await getSiteRankingPositions(first,"desktop")).items.find(row=>row.kind==="all_time"&&row.scope==="overall")?.rank).toBe(2);
    await fixtureSql()`UPDATE sites SET is_listed=false WHERE id=${first}`;
    expect(await getSiteProfile("first")).toBeNull();auth.mockResolvedValue({user:{id:owner}});
    expect((await getSiteProfile("first"))?.rankingPositions.items).toEqual([]);
  });
  it("paginates retained capture history by device without exposing private reports or unrelated cursors",async()=>{
    const id=await website("captures"),other=await website("other");
    const ids=[];for(let i=1;i<=13;i++)ids.push(await capture(id,new Date(now.getTime()-i*60_000)));
    await capture(id,new Date(now.getTime()-2*86_400_000),{expires:new Date(now.getTime()-86_400_000)});
    await capture(id,new Date(now.getTime()+60_000));await capture(id,new Date(now.getTime()-1_000),{device:"desktop"});
    const otherCapture=await capture(other,new Date(now.getTime()-1_000));
    const first=await getSiteProfile("captures");expect(first?.screenshots.map(row=>row.id)).toEqual(ids.slice(0,12));
    const next=await getSiteProfile("captures","mobile",undefined,first!.nextScreenshotCursor!);
    expect(next?.screenshots.map(row=>row.id)).toEqual(ids.slice(12));expect(next?.nextScreenshotCursor).toBeNull();
    expect(await getSiteProfile("captures","mobile",undefined,otherCapture)).toBeNull();
    expect((await getSiteProfile("captures","desktop"))?.screenshots).toHaveLength(1);
    await fixtureSql()`UPDATE sites SET archived_at=now() WHERE id=${id}`;expect(await getSiteProfile("captures")).toBeNull();
    auth.mockResolvedValue({user:{id:owner}});expect((await getSiteProfile("captures"))?.screenshots).toHaveLength(12);
  });
  it("builds immutable-period overviews from real snapshots, retained period media and public award evidence",async()=>{
    const current=getPeriodBounds("weekly",now),period=getPeriodBounds("weekly",new Date(current.startAt.getTime()-1));
    const at=new Date(period.startAt.getTime()+86_400_000),first=await website("original-winner"),second=await website("newcomer",at,"US");
    await measure(first,60,new Date(period.startAt.getTime()-60_000));await measure(first,95,at);await measure(second,90,at);
    await measure(first,50,at,"desktop");await measure(second,99,at,"desktop");
    await fixtureSql()`INSERT INTO site_categories(site_id,category_id,is_primary) SELECT ${first},id,true FROM categories WHERE slug='saas'`;
    await fixtureSql()`INSERT INTO site_technologies(site_id,technology_id) SELECT ${first},id FROM technologies WHERE slug='nextjs'`;
    const image=await capture(first,at);await capture(first,new Date(period.endAt.getTime()+60_000));
    await finalizeCompetitionPeriod("weekly",period.periodKey);await evaluateSiteAwards(first);
    const before=await fixtureSql()`SELECT to_jsonb(r) AS data FROM ranking_snapshots r ORDER BY id`;
    await fixtureSql()`UPDATE sites SET name='Changed after competition' WHERE id=${first}`;
    const overview=await getCompetitionOverview("weekly",period.periodKey);
    expect(overview).toMatchObject({winner:{siteId:first,score:95},stats:{finalists:2,averageScore:92.5,countries:2,categories:1,technologies:1}});
    expect(overview?.collections.find(row=>row.scope==="technology")?.name).toBe("original-winner");
    expect(overview?.improved[0].evidence.improvement).toBe(35);expect(overview?.newcomers[0].siteId).toBe(second);
    expect(overview?.captures.map(row=>row.id)).toEqual([image]);expect(overview?.awards.length).toBeGreaterThan(0);
    expect((await getCompetitionOverview("weekly",period.periodKey,"desktop"))?.winner?.siteId).toBe(second);
    expect(await getCompetitionOverview("weekly",current.periodKey)).toBeNull();
    await fixtureSql()`UPDATE sites SET is_listed=false WHERE id=${first}`;
    const hidden=await getCompetitionOverview("weekly",period.periodKey);
    expect(hidden?.winner).toBeNull();expect(hidden?.top.map(row=>row.rank)).toEqual([2]);expect(hidden?.stats.finalists).toBe(1);
    expect(hidden?.captures).toEqual([]);expect(hidden?.awards).toEqual([]);
    expect(await fixtureSql()`SELECT to_jsonb(r) AS data FROM ranking_snapshots r ORDER BY id`).toEqual(before);
  });
});

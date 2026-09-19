import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPublicFounder } from "../../src/modules/founders/service";
import { finalizeCompetitionPeriod } from "../../src/modules/rankings/service";
import { getPeriodBounds } from "../../src/modules/rankings/algorithm";
import { evaluateSiteAwards } from "../../src/modules/awards/service";
import { cleanupIntegrationDatabase, fixtureSql, prepareIntegrationDatabase, resetIntegrationData } from "./database";

let owner: string, founder: string, now: Date;
beforeAll(prepareIntegrationDatabase,60_000);
afterAll(cleanupIntegrationDatabase,30_000);
beforeEach(async () => {
  await resetIntegrationData();
  owner=randomUUID();founder=randomUUID();now=(await fixtureSql()`SELECT now() AS at`)[0].at;
  await fixtureSql()`INSERT INTO users(id,email,name) VALUES(${owner},'private-founder@example.invalid','Private account name')`;
  await fixtureSql()`INSERT INTO founders(id,user_id,slug,name,visibility) VALUES(${founder},${owner},'builder','Public builder','public')`;
});
async function website(name: string, linked=true) {
  const id=randomUUID();
  await fixtureSql()`INSERT INTO sites(id,slug,name,url,normalized_url,description,owner_id,owner_name,is_listed,lifecycle,created_at)
    VALUES(${id},${name},${name},${`https://example.com/${name}`},${`https://example.com/${name}`},'Fixture',${owner},'Private account name',true,'active',now()-interval '90 days')`;
  if(linked)await fixtureSql()`INSERT INTO founder_sites(founder_id,site_id) VALUES(${founder},${id})`;
  return id;
}
async function measure(siteId: string, score: number, options: { strategy?: string; method?: string; source?: string; samples?: number; at?: Date } = {}) {
  await fixtureSql()`INSERT INTO speed_tests(site_id,score,lcp_ms,cls,tbt_ms,tested_at,strategy,methodology_version,sample_count,metrics_source)
    VALUES(${siteId},${score},1000,0.05,20,${options.at??new Date(now.getTime()-60_000)},${options.strategy??'mobile'},
      ${options.method??'psi-v2-two-sample'},${options.samples??2},${options.source??'lab'})`;
}
const previousWeek=() => getPeriodBounds("weekly",new Date(getPeriodBounds("weekly",now).startAt.getTime()-1));

describe("public founder evidence",()=>{
  it("separates latest-site averages and improvements by device and complete lab methodology",async()=>{
    const first=await website("first"),second=await website("second");
    await measure(first,60,{at:new Date(now.getTime()-2*86_400_000)});
    await measure(first,90);await measure(second,80);
    await measure(first,40,{strategy:"desktop"});await measure(second,100,{strategy:"desktop"});
    await expect(measure(first,100,{source:"field"})).rejects.toMatchObject({constraint_name:"speed_tests_source_valid"});
    for(const options of [{method:"legacy-unspecified"},{samples:1},{at:new Date(now.getTime()+86_400_000)}])
      await measure(first,100,{at:new Date(now.getTime()-1_000),...options});
    const mobile=await getPublicFounder("builder"),desktop=await getPublicFounder("builder","desktop");
    expect(mobile?.insights).toMatchObject({measuredSites:2,averageScore:85,bestSite:{siteId:first,score:90},weeklyWins:0,bestRank:null});
    expect(mobile?.insights.recentlyImproved).toMatchObject([{siteId:first,previousScore:60,score:90,improvement:30}]);
    expect(desktop?.insights).toMatchObject({measuredSites:2,averageScore:70,bestSite:{siteId:second,score:100},recentlyImproved:[]});
    expect(JSON.stringify(mobile)).not.toContain("private-founder@example.invalid");expect(JSON.stringify(mobile)).not.toContain(owner);
  });
  it("reads closed versioned rankings and strategy-specific earned awards without inventing profile scores",async()=>{
    const first=await website("first"),outsider=await website("outsider",false),period=previousWeek();
    const at=new Date(period.startAt.getTime()+86_400_000);
    await measure(first,95,{at});await measure(outsider,90,{at});
    await measure(first,80,{at,strategy:"desktop"});await measure(outsider,99,{at,strategy:"desktop"});
    await finalizeCompetitionPeriod("weekly",period.periodKey);await evaluateSiteAwards(first);
    const mobile=await getPublicFounder("builder"),desktop=await getPublicFounder("builder","desktop");
    expect(mobile?.insights).toMatchObject({weeklyWins:1,bestRank:1});
    expect(desktop?.insights).toMatchObject({weeklyWins:0,bestRank:2});
    expect(mobile?.insights.rankings.every(row=>row.siteId===first)).toBe(true);
    expect(mobile?.insights.awards.some(row=>row.title==="Weekly winner")).toBe(true);
    expect(desktop?.insights.awards.some(row=>row.title==="Weekly winner")).toBe(false);
    expect(desktop?.insights.awards.some(row=>row.title==="90+ performance")).toBe(false);
    const [closed]=await fixtureSql()`SELECT count(*)::int AS count FROM ranking_snapshots`;
    await fixtureSql()`UPDATE sites SET is_listed=false WHERE id=${first}`;
    const hidden=await getPublicFounder("builder");
    expect(hidden?.insights).toMatchObject({measuredSites:0,averageScore:null,bestSite:null,weeklyWins:0,bestRank:null,rankings:[],awards:[]});
    expect((await fixtureSql()`SELECT count(*)::int AS count FROM ranking_snapshots`)[0].count).toBe(closed.count);
  });
  it("rechecks public attribution for technologies and all metrics after privacy/lifecycle changes",async()=>{
    const publicSite=await website("public-site"),hidden=await website("private-site"),removed=await website("removed-site"),archived=await website("archived-site"),pending=await website("pending-site");
    for(const id of [publicSite,hidden,removed,archived,pending])await measure(id,id===publicSite?70:100);
    await fixtureSql()`INSERT INTO site_technologies(site_id,technology_id) SELECT ${publicSite},id FROM technologies WHERE slug='nextjs'`;
    await fixtureSql()`INSERT INTO site_technologies(site_id,technology_id) SELECT ${hidden},id FROM technologies WHERE slug='react'`;
    await fixtureSql()`UPDATE sites SET is_listed=false WHERE id=${hidden}`;
    await fixtureSql()`UPDATE sites SET lifecycle='removed' WHERE id=${removed}`;
    await fixtureSql()`UPDATE sites SET archived_at=now() WHERE id=${archived}`;
    await fixtureSql()`UPDATE sites SET lifecycle='pending' WHERE id=${pending}`;
    const profile=await getPublicFounder("builder");
    expect(profile?.sites.map(row=>row.id)).toEqual([publicSite]);
    expect(profile?.insights).toMatchObject({measuredSites:1,averageScore:70});
    expect(profile?.insights.technologies.map(row=>row.slug)).toEqual(["nextjs"]);
    expect(JSON.stringify(profile)).not.toContain("private-site");
    await fixtureSql()`DELETE FROM founder_sites WHERE site_id=${publicSite}`;
    expect((await getPublicFounder("builder"))?.insights).toMatchObject({measuredSites:0,technologies:[]});
    await fixtureSql()`UPDATE founders SET visibility='private' WHERE id=${founder}`;
    expect(await getPublicFounder("builder")).toBeNull();
  });
  it("provides explicit empty evidence for legacy-only profiles",async()=>{
    const id=await website("legacy-only");await measure(id,100,{method:"legacy-unspecified",samples:1});
    expect((await getPublicFounder("builder"))?.insights).toMatchObject({measuredSites:0,averageScore:null,bestSite:null,
      weeklyWins:0,bestRank:null,rankings:[],technologies:[],awards:[],recentlyImproved:[]});
  });
});

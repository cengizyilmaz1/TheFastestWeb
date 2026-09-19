import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { finalizeCompetitionPeriod, listHallOfFame, listRanking } from "../../src/modules/rankings/service";
import { getPeriodBounds } from "../../src/modules/rankings/algorithm";
import { cleanupIntegrationDatabase, fixtureSql, prepareIntegrationDatabase, resetIntegrationData } from "./database";

let owner: string;
let period: ReturnType<typeof getPeriodBounds>;
const at = (fraction: number) => new Date(period.startAt.getTime()+fraction*(period.endAt.getTime()-period.startAt.getTime()));

async function site(options: { id?: string; name?: string; listed?: boolean; lifecycle?: string; createdAt?: Date; country?: string } = {}) {
  const id=options.id ?? randomUUID();
  await fixtureSql()`INSERT INTO sites(id,slug,name,url,normalized_url,description,owner_id,owner_name,is_listed,lifecycle,created_at,country_code)
    VALUES(${id},${`fixture-${id}`},${options.name ?? "Synthetic ranking site"},${`https://example.com/${id}`},${`https://example.com/${id}`},
      'Fixture',${owner},'Synthetic owner',${options.listed ?? true},${options.lifecycle ?? "active"},${options.createdAt ?? new Date(period.startAt.getTime()-86_400_000)},${options.country ?? null})`;
  return id;
}
async function measurement(siteId: string, score: number, options: { testedAt?: Date; strategy?: string; method?: string; samples?: number; lcp?: number; cls?: number; tbt?: number } = {}) {
  const id=randomUUID();
  await fixtureSql()`INSERT INTO speed_tests(id,site_id,score,lcp_ms,cls,tbt_ms,tested_at,strategy,methodology_version,sample_count)
    VALUES(${id},${siteId},${score},${options.lcp ?? 1000},${options.cls ?? 0.05},${options.tbt ?? 20},${options.testedAt ?? at(0.5)},
      ${options.strategy ?? "mobile"},${options.method ?? "psi-v2-two-sample"},${options.samples ?? 2})`;
  return id;
}

beforeAll(prepareIntegrationDatabase,60_000);
afterAll(cleanupIntegrationDatabase,30_000);
beforeEach(async () => {
  await resetIntegrationData();
  const [clock]=await fixtureSql()`SELECT now() AS clock`;
  const current=getPeriodBounds("weekly",clock.clock);
  period=getPeriodBounds("weekly",new Date(current.startAt.getTime()-1));
  owner=randomUUID();
  await fixtureSql()`INSERT INTO users(id,email,name) VALUES(${owner},'ranking@example.invalid','Synthetic owner')`;
});

describe("versioned PostgreSQL rankings", () => {
  it("excludes legacy, incomplete, private and archived measurements instead of inventing entrants", async () => {
    const valid=await site(), legacy=await site(), partial=await site();
    const hidden=await site({ listed: false }), archived=await site({ lifecycle: "archived" }), outside=await site();
    await measurement(valid,88);
    await measurement(legacy,100,{ method: "legacy-unspecified" });
    await measurement(partial,100,{ samples: 1 });
    await measurement(hidden,100);
    await measurement(archived,100);
    await measurement(outside,100,{ testedAt: period.endAt });
    const ranking=await listRanking({ kind: "weekly",periodKey: period.periodKey });
    expect(ranking.items.map((row)=>row.siteId)).toEqual([valid]);
    expect(ranking).toMatchObject({ status: "live",rankingAlgorithmVersion: "ranking-v1",performanceMethodVersion: "psi-v2-two-sample" });
  });

  it("uses the latest complete period aggregate and deterministic UUID ties", async () => {
    const first=await site({ id: "00000000-0000-4000-8000-000000000001" });
    const second=await site({ id: "00000000-0000-4000-8000-000000000002" });
    const third=await site({ id: "00000000-0000-4000-8000-000000000003" });
    await measurement(third,95,{ lcp: 900 });
    await measurement(second,95);
    await measurement(first,100,{ testedAt: at(0.1) });
    await measurement(first,95,{ testedAt: at(0.9) });
    const ranking=await listRanking({ kind: "weekly",periodKey: period.periodKey,limit: 2 });
    expect(ranking.items.map((row)=>row.siteId)).toEqual([third,first]);
    expect(ranking.nextCursor).toBe("2");
    const next=await listRanking({ kind: "weekly",periodKey: period.periodKey,limit: 2,cursor: ranking.nextCursor! });
    expect(next.items.map((row)=>row.siteId)).toEqual([second]);
    expect(next.nextCursor).toBeNull();
  });

  it("keeps device, country, category and technology partitions independent", async () => {
    const first=await site({ country: "TR" }),second=await site({ country: "US" });
    await measurement(first,90);
    await measurement(first,75,{ strategy: "desktop" });
    await measurement(second,80);
    await measurement(second,99,{ strategy: "desktop" });
    await fixtureSql()`INSERT INTO site_categories(site_id,category_id,is_primary) SELECT ${first},id,true FROM categories WHERE slug='saas'`;
    await fixtureSql()`INSERT INTO site_technologies(site_id,technology_id) SELECT ${first},id FROM technologies WHERE slug='nextjs'`;
    const input={ kind: "weekly" as const,periodKey: period.periodKey };
    expect((await listRanking({ ...input,strategy: "desktop" })).items[0].siteId).toBe(second);
    expect((await listRanking({ ...input,scope: "country",scopeKey: "TR" })).items.map((x)=>x.siteId)).toEqual([first]);
    expect((await listRanking({ ...input,scope: "category",scopeKey: "saas" })).items.map((x)=>x.siteId)).toEqual([first]);
    expect((await listRanking({ ...input,scope: "technology",scopeKey: "nextjs" })).items.map((x)=>x.siteId)).toEqual([first]);
  });

  it("requires comparable prior evidence for improvement and actual creation dates for newcomers", async () => {
    const improved=await site(), newcomer=await site({ createdAt: at(0.2) }),declined=await site();
    await measurement(improved,60,{ testedAt: new Date(period.startAt.getTime()-1) });
    await measurement(improved,90);
    await measurement(newcomer,98);
    await measurement(declined,99,{ testedAt: new Date(period.startAt.getTime()-1) });
    await measurement(declined,95);
    const input={ kind: "weekly" as const,periodKey: period.periodKey };
    const gains=await listRanking({ ...input,scope: "improved" });
    expect(gains.items.map((row)=>row.siteId)).toEqual([improved]);
    expect(gains.items[0].evidence.improvement).toBe(30);
    expect((await listRanking({ ...input,scope: "newcomer" })).items.map((row)=>row.siteId)).toEqual([newcomer]);
  });

  it("freezes the snapshot once under concurrent finalizers and preserves winner identity after changes", async () => {
    const first=await site({ name: "Original winner" }),second=await site();
    await measurement(first,97);
    await measurement(second,90);
    const results=await Promise.all([1,2,3].map(()=>finalizeCompetitionPeriod("weekly",period.periodKey)));
    expect(results.filter((result)=>result.created)).toHaveLength(1);
    const before=await listRanking({ kind: "weekly",periodKey: period.periodKey });
    await measurement(second,100,{ testedAt: at(0.9) });
    await fixtureSql()`UPDATE sites SET name='Changed later' WHERE id=${first}`;
    expect(await listRanking({ kind: "weekly",periodKey: period.periodKey })).toEqual(before);
    expect(before.status).toBe("closed");
    expect(before.items[0].siteSnapshot.name).toBe("Original winner");
    const fame=await listHallOfFame();
    expect(fame.items).toHaveLength(1);
    expect(fame.items[0].siteId).toBe(first);
  });

  it("hides newly private, removed or archived winners without changing frozen evidence or reassigning ranks",async()=>{
    const first=await site(),second=await site();await measurement(first,97);await measurement(second,90);
    await finalizeCompetitionPeriod("weekly",period.periodKey);
    const [before]=await fixtureSql()`SELECT md5(string_agg(to_jsonb(r)::text,'' ORDER BY id)) AS hash FROM ranking_snapshots r`;
    for(const change of ["is_listed=false","is_listed=true,lifecycle='removed'","lifecycle='active',archived_at=now()"]){
      await fixtureSql().unsafe(`UPDATE sites SET ${change} WHERE id=$1`,[first]);
      const result=await listRanking({kind:"weekly",periodKey:period.periodKey});
      expect(result.items.map(row=>[row.siteId,row.rank])).toEqual([[second,2]]);
      expect((await listHallOfFame()).items).toEqual([]);
    }
    const [after]=await fixtureSql()`SELECT md5(string_agg(to_jsonb(r)::text,'' ORDER BY id)) AS hash FROM ranking_snapshots r`;
    expect(after.hash).toBe(before.hash);
  });

  it("closes empty periods without fabricated rows and refuses premature closure", async () => {
    const result=await finalizeCompetitionPeriod("weekly",period.periodKey);
    expect(result.snapshots).toBe(0);
    expect((await listRanking({ kind: "weekly",periodKey: period.periodKey })).items).toEqual([]);
    const current=getPeriodBounds("weekly",new Date());
    await expect(finalizeCompetitionPeriod("weekly",current.periodKey)).rejects.toMatchObject({ status: 409 });
  });

  it("supports monthly UTC archives and best recorded all-time measurements separately", async () => {
    const first=await site();
    const month=getPeriodBounds("monthly",new Date(period.startAt.getUTCFullYear(),period.startAt.getUTCMonth()-1,15));
    await measurement(first,99,{ testedAt: new Date(month.startAt.getTime()+86_400_000) });
    await measurement(first,80,{ testedAt: at(0.5) });
    const result=await finalizeCompetitionPeriod("monthly",month.periodKey);
    expect(result.created).toBe(true);
    expect((await listRanking({ kind: "monthly",periodKey: month.periodKey })).items[0].score).toBe(99);
    expect((await listRanking({ kind: "all_time" })).items[0].score).toBe(99);
  });
});

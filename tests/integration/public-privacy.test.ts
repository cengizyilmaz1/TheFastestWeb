import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { listDirectory, listFounders, getDiscovery } from "../../src/modules/sites/directory";
import { getSiteProfile } from "../../src/modules/sites/profile";
import { getPublicFounder } from "../../src/modules/founders/service";
import { sitemapDocument, publicCorpusSummary } from "../../src/modules/seo/sitemaps";
import { cleanupIntegrationDatabase, fixtureSql, prepareIntegrationDatabase, resetIntegrationData } from "./database";
const {auth}=vi.hoisted(()=>({auth:vi.fn()}));
vi.mock("../../src/auth",()=>({auth}));
let owner:string;
beforeAll(prepareIntegrationDatabase,60_000);
afterAll(cleanupIntegrationDatabase,30_000);
beforeEach(async()=>{
  await resetIntegrationData();auth.mockReset().mockResolvedValue(null);owner=randomUUID();
  await fixtureSql()`INSERT INTO users(id,email,name) VALUES(${owner},'never-public@example.invalid','Private account name')`;
});
async function site(slug:string,lifecycle="active",listed=true,archived=false) {
  const id=randomUUID();
  await fixtureSql()`INSERT INTO sites(id,slug,name,url,normalized_url,description,owner_id,owner_name,is_listed,lifecycle,archived_at,country_code)
    VALUES(${id},${slug},${slug},${`https://example.com/${slug}`},${`https://example.com/${slug}`},'Synthetic description',${owner},'Private account name',
      ${listed},${lifecycle},${archived?new Date():null},'TR')`;
  await fixtureSql()`INSERT INTO site_categories(site_id,category_id,is_primary) SELECT ${id},id,true FROM categories WHERE slug='saas'`;
  return id;
}
describe("public data boundaries on PostgreSQL",()=>{
  it("excludes private, pending, removed and archived sites from discovery, sitemap and search corpus",async()=>{
    await site("visible");await site("private","active",false);await site("pending","pending");
    await site("removed","removed");await site("archived","active",true,true);
    expect((await listDirectory()).sites.map(row=>row.slug)).toEqual(["visible"]);
    expect((await getDiscovery()).countries).toEqual([{code:"TR",name:"Türkiye",count:1}]);
    const xml=await sitemapDocument("sites",0),corpus=JSON.stringify(await publicCorpusSummary());
    expect(xml).toContain("/site/visible");expect(corpus).toContain("/site/visible");
    for(const hidden of ["private","pending","removed","archived"]){expect(xml).not.toContain(`/site/${hidden}`);expect(corpus).not.toContain(`/site/${hidden}`);}
    expect(JSON.stringify(await listDirectory())).not.toContain("never-public@example.invalid");
    expect(JSON.stringify(await listDirectory())).not.toContain("Private account name");
  });
  it("requires the owner for nonpublic reports, while explicitly listed unreachable history stays available",async()=>{
    await site("private","active",false);await site("pending","pending");await site("removed","removed");await site("archived","active",true,true);
    for(const slug of ["private","pending","removed","archived"])expect(await getSiteProfile(slug)).toBeNull();
    auth.mockResolvedValue({user:{id:randomUUID()}});expect(await getSiteProfile("private")).toBeNull();
    auth.mockResolvedValue({user:{id:owner}});expect((await getSiteProfile("private"))?.site.slug).toBe("private");
    auth.mockResolvedValue(null);
    for(const state of ["unreachable","redirected","parked"]){await site(state,state);expect((await getSiteProfile(state))?.site.lifecycle).toBe(state);}
  });
  it("separates devices and measurement methods in every history series",async()=>{
    const id=await site("measurements");
    for(const [strategy,method,score,days] of [["mobile","legacy-unspecified",31,5],["mobile","psi-v2-two-sample",80,3],
      ["mobile","psi-v2-two-sample",90,2],["desktop","psi-v2-two-sample",99,1]] as const)
      await fixtureSql()`INSERT INTO speed_tests(site_id,score,strategy,methodology_version,sample_count,tested_at)
        VALUES(${id},${score},${strategy},${method},${method==="legacy-unspecified"?1:2},now()-(${days}*interval '1 day'))`;
    const profile=await getSiteProfile("measurements");
    expect(profile?.history.map(row=>row.score)).toEqual([80,90]);
    expect(profile?.site).not.toHaveProperty("ownerId");expect(profile?.site).not.toHaveProperty("ownerName");
    expect(profile?.latest).not.toHaveProperty("rawResponse");
    expect((await getSiteProfile("measurements","desktop"))?.history.map(row=>row.score)).toEqual([99]);
    expect((await getSiteProfile("measurements","mobile","legacy-unspecified"))?.history.map(row=>row.score)).toEqual([31]);
  });
  it("never derives founder identity from private accounts and hides private founder/site relationships",async()=>{
    const visible=await site("visible"),hidden=await site("hidden","active",false),removed=await site("removed","removed"),archived=await site("archived","active",true,true);
    const publicId=randomUUID(),privateId=randomUUID();
    await fixtureSql()`INSERT INTO founders(id,slug,name,visibility) VALUES(${publicId},'public-founder','Chosen public name','public'),(${privateId},'private-founder','Secret profile name','private')`;
    for(const id of [visible,hidden,removed,archived]) await fixtureSql()`INSERT INTO founder_sites(founder_id,site_id) VALUES(${publicId},${id})`;
    await fixtureSql()`INSERT INTO founder_sites(founder_id,site_id) VALUES(${privateId},${visible})`;
    const profile=await getPublicFounder("public-founder");
    expect(profile?.sites.map(row=>row.slug)).toEqual(["visible"]);
    expect(profile).not.toHaveProperty("userId");expect(profile).not.toHaveProperty("email");
    expect(await getPublicFounder("private-founder")).toBeNull();
    expect((await listFounders()).founders.map(row=>row.slug)).toEqual(["public-founder"]);
    expect((await getSiteProfile("visible"))?.founders).toEqual([{slug:"public-founder",name:"Chosen public name"}]);
    expect(await sitemapDocument("founders",0)).not.toContain("private-founder");
  });
});

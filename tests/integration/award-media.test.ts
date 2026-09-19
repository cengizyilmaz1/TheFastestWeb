import { createHash,randomUUID } from "node:crypto";
import sharp from "sharp";
import { NextRequest } from "next/server";
import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from "vitest";
import { getPublicAwardImage,renderAwardSvg,renderAwardPng,promoteAwardImage } from "../../src/modules/awards/media";
import { GET as embed } from "../../src/app/api/awards/[id]/embed.svg/route";
import { GET as png } from "../../src/app/api/awards/[id]/share.png/route";
import { cleanupIntegrationDatabase,fixtureSql,prepareIntegrationDatabase,resetIntegrationData } from "./database";
const {enabled,upload}=vi.hoisted(()=>({enabled:vi.fn(),upload:vi.fn()}));
vi.mock("../../src/infrastructure/storage/r2",()=>({isStorageEnabled:enabled,putObject:upload}));
let owner:string,siteId:string,awardId:string;
beforeAll(prepareIntegrationDatabase,60_000);
afterAll(cleanupIntegrationDatabase,30_000);
beforeEach(async()=>{
  await resetIntegrationData();enabled.mockReset().mockReturnValue(false);upload.mockReset();
  owner=randomUUID();siteId=randomUUID();awardId=randomUUID();const achievement=randomUUID();
  await fixtureSql()`INSERT INTO users(id,email,name) VALUES(${owner},'media@example.invalid','Private person')`;
  await fixtureSql()`INSERT INTO sites(id,slug,name,url,normalized_url,description,owner_id,owner_name,is_listed,lifecycle,current_score)
    VALUES(${siteId},'award-media','<script>alert(1)</script> & title','https://example.com/','https://example.com/','Fixture',${owner},'Private person',true,'active',15)`;
  await fixtureSql()`INSERT INTO achievements(id,key,title,description) VALUES(${achievement},'score90','90+ performance','Recorded evidence')`;
  await fixtureSql()`INSERT INTO site_awards(id,site_id,achievement_id,event_key,evidence)
    VALUES(${awardId},${siteId},${achievement},'synthetic-media','{"score":95,"strategy":"mobile","measurementId":"recorded-proof"}')`;
});
describe("public award image boundaries",()=>{
  it("escapes all dynamic XML, preserves awarded evidence and produces a real bounded PNG without storage",async()=>{
    const award=await getPublicAwardImage(awardId),svg=renderAwardSvg(award);
    expect(svg).toContain("&lt;script&gt;");expect(svg).not.toContain("<script>");expect(svg).toContain(">95</text>");
    expect(svg).not.toContain("href=");expect(svg).not.toContain("Private person");
    const output=await renderAwardPng(award),metadata=await sharp(output).metadata();
    expect(metadata).toMatchObject({format:"png",width:1200,height:630});expect(output.length).toBeLessThan(1_000_000);
    expect(await promoteAwardImage(awardId,owner)).toMatchObject({stored:false,url:expect.stringContaining(`/api/awards/${awardId}/share.png`)});
    expect(upload).not.toHaveBeenCalled();
  });
  it("checks public visibility for both HTTP formats on every request",async()=>{
    const context={params:Promise.resolve({id:awardId})},request=new NextRequest(`http://localhost/api/awards/${awardId}/embed.svg`);
    expect((await embed(request,context)).headers.get("cache-control")).toBe("no-store");
    for(const change of ["is_listed=false","is_listed=true,lifecycle='removed'","lifecycle='active',archived_at=now()"]){
      await fixtureSql().unsafe(`UPDATE sites SET ${change} WHERE id=$1`,[siteId]);
      expect((await embed(request,context)).status).toBe(404);expect((await png(request,context)).status).toBe(404);
    }
    expect(upload).not.toHaveBeenCalled();
  });
  it("requires the owner before promotion and uses a deterministic content-addressed public key",async()=>{
    enabled.mockReturnValue(true);
    upload.mockImplementation(async(input:{bytes:Buffer;objectKey:string})=>({hash:createHash("sha256").update(input.bytes).digest("hex"),objectKey:input.objectKey,publicUrl:`https://media.example.invalid/${input.objectKey}`}));
    await expect(promoteAwardImage(awardId,randomUUID())).rejects.toMatchObject({code:"NOT_FOUND"});expect(upload).not.toHaveBeenCalled();
    const first=await promoteAwardImage(awardId,owner),second=await promoteAwardImage(awardId,owner);
    expect(first).toEqual(second);expect(upload.mock.calls[0][0]).toMatchObject({visibility:"public",contentType:"image/png",objectKey:expect.stringMatching(new RegExp(`^thefastestweb/awards/${awardId}/[a-f0-9]{64}\\.png$`))});
    await fixtureSql()`UPDATE sites SET is_listed=false WHERE id=${siteId}`;
    await expect(promoteAwardImage(awardId,owner)).rejects.toMatchObject({code:"NOT_FOUND"});expect(upload).toHaveBeenCalledTimes(2);
  });
});

import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from "vitest";
import { inviteFounder,listCollaborations,removeFounderLink,respondFounderInvitation } from "../../src/modules/founders/collaborations";
import { getPublicFounder } from "../../src/modules/founders/service";
import { GET,POST } from "../../src/app/api/founders/collaborations/route";
import { cleanupIntegrationDatabase,fixtureSql,prepareIntegrationDatabase,resetIntegrationData } from "./database";
const {auth,limit}=vi.hoisted(()=>({auth:vi.fn(),limit:vi.fn()}));
vi.mock("../../src/auth",()=>({auth}));
vi.mock("../../src/modules/security/rate-limit",()=>({enforceRateLimit:limit}));
vi.mock("../../src/config/env",()=>({getEnv:()=>({NODE_ENV:"test",SITE_URL:"https://example.com"})}));
let owner:string,recipient:string,stranger:string,siteId:string,founderId:string;
beforeAll(prepareIntegrationDatabase,60_000);afterAll(cleanupIntegrationDatabase,30_000);
beforeEach(async()=>{
  await resetIntegrationData();auth.mockReset().mockResolvedValue(null);limit.mockReset().mockResolvedValue(undefined);
  owner=randomUUID();recipient=randomUUID();stranger=randomUUID();siteId=randomUUID();founderId=randomUUID();
  for(const [id,name] of [[owner,"Owner"],[recipient,"Recipient"],[stranger,"Stranger"]])await fixtureSql()`INSERT INTO users(id,email,name) VALUES(${id},${`${id}@example.invalid`},${name})`;
  await fixtureSql()`INSERT INTO sites(id,slug,name,url,normalized_url,description,owner_id,owner_name,is_listed,lifecycle)
    VALUES(${siteId},'collaboration-site','Collaboration site','https://example.com/','https://example.com/','Fixture',${owner},'Owner',true,'active')`;
  await fixtureSql()`INSERT INTO founders(id,user_id,slug,name,visibility) VALUES(${founderId},${recipient},'invited-founder','Chosen public name','public')`;
});
const invite=()=>inviteFounder(owner,{siteId,founderSlug:"invited-founder"});
const accept=(id:string,userId=recipient)=>respondFounderInvitation(userId,{invitationId:id,decision:"accept"});
const links=()=>fixtureSql()`SELECT founder_id,site_id FROM founder_sites`;

describe("consented cross-account founder attribution",()=>{
  it("deduplicates concurrent invitations without linking anyone or sending mail",async()=>{
    const results=await Promise.all([1,2,3].map(()=>invite()));expect(new Set(results.map(row=>row.id)).size).toBe(1);
    expect(await links()).toHaveLength(0);
    expect((await fixtureSql()`SELECT count(*)::int AS count FROM email_deliveries`)[0].count).toBe(0);
    const pending=await listCollaborations(recipient);expect(pending.incoming).toHaveLength(1);expect(pending.incoming[0]).toMatchObject({status:"pending",canRespond:true});
    expect(JSON.stringify(pending)).not.toContain("@example.invalid");expect(JSON.stringify(pending)).not.toContain(owner);
    expect((await listCollaborations(stranger)).incoming).toEqual([]);
  });
  it("rejects nonowners, private profiles and unclaimed founder records",async()=>{
    await expect(inviteFounder(stranger,{siteId,founderId})).rejects.toMatchObject({code:"NOT_FOUND"});
    await fixtureSql()`UPDATE founders SET visibility='private' WHERE id=${founderId}`;
    await expect(invite()).rejects.toMatchObject({code:"NOT_FOUND"});
    await fixtureSql()`UPDATE founders SET visibility='public',user_id=NULL WHERE id=${founderId}`;
    await expect(invite()).rejects.toMatchObject({code:"NOT_FOUND"});expect(await links()).toHaveLength(0);
  });
  it("allows only the invited account to accept and preserves site ownership under concurrent acceptance",async()=>{
    const invitation=await invite();await expect(accept(invitation.id,owner)).rejects.toMatchObject({code:"NOT_FOUND"});
    await expect(accept(invitation.id,stranger)).rejects.toMatchObject({code:"NOT_FOUND"});
    const results=await Promise.all([1,2,3].map(()=>accept(invitation.id)));expect(results.every(row=>row.status==="accepted"&&row.linked)).toBe(true);
    expect(await links()).toHaveLength(1);expect((await fixtureSql()`SELECT owner_id FROM sites WHERE id=${siteId}`)[0].owner_id).toBe(owner);
    expect((await getPublicFounder("invited-founder"))?.sites.map(row=>row.id)).toEqual([siteId]);
  });
  it("commits expiry invalidation and permits a fresh invitation without renewing the old one",async()=>{
    const original=await invite();await fixtureSql()`UPDATE founder_site_invitations SET created_at=now()-interval '8 days',expires_at=now()-interval '1 day' WHERE id=${original.id}`;
    await expect(accept(original.id)).rejects.toMatchObject({code:"CONFLICT"});
    expect((await fixtureSql()`SELECT status FROM founder_site_invitations WHERE id=${original.id}`)[0].status).toBe("expired");
    const fresh=await invite();expect(fresh.id).not.toBe(original.id);expect(fresh.status).toBe("pending");expect(await links()).toHaveLength(0);
  });
  it("revokes stale invitations after site ownership, profile privacy or archive changes",async()=>{
    const original=await invite();await fixtureSql()`UPDATE sites SET owner_id=${stranger},is_listed=false,name='New private title' WHERE id=${siteId}`;
    const inbox=await listCollaborations(recipient);expect(inbox.incoming[0].site.name).toBe("Unavailable website");
    await expect(accept(original.id)).rejects.toMatchObject({code:"CONFLICT"});
    expect((await fixtureSql()`SELECT status FROM founder_site_invitations WHERE id=${original.id}`)[0].status).toBe("revoked");
    await fixtureSql()`UPDATE sites SET owner_id=${owner},is_listed=true WHERE id=${siteId}`;
    const privateInvite=await invite();await fixtureSql()`UPDATE founders SET visibility='private',name='Secret revised name' WHERE id=${founderId}`;
    expect(JSON.stringify(await listCollaborations(owner))).not.toContain("Secret revised name");
    await expect(accept(privateInvite.id)).rejects.toMatchObject({code:"CONFLICT"});
    await fixtureSql()`UPDATE founders SET visibility='public' WHERE id=${founderId}`;
    const archived=await invite();await fixtureSql()`UPDATE sites SET archived_at=now() WHERE id=${siteId}`;
    await expect(accept(archived.id)).rejects.toMatchObject({code:"CONFLICT"});expect(await links()).toHaveLength(0);
  });
  it("supports decline/revoke and owner removal without replay reattaching a consumed invitation",async()=>{
    const declined=await invite();expect((await respondFounderInvitation(recipient,{invitationId:declined.id,decision:"reject"})).status).toBe("declined");
    const revoked=await invite();await expect(respondFounderInvitation(stranger,{invitationId:revoked.id,decision:"revoke"})).rejects.toMatchObject({code:"NOT_FOUND"});
    expect((await respondFounderInvitation(owner,{invitationId:revoked.id,decision:"revoke"})).status).toBe("revoked");
    const accepted=await invite();await accept(accepted.id);
    await expect(removeFounderLink(stranger,{siteId,founderId})).rejects.toMatchObject({code:"NOT_FOUND"});
    expect(await removeFounderLink(owner,{siteId,founderId})).toEqual({removed:true});
    expect(await accept(accepted.id)).toMatchObject({status:"accepted",linked:false});expect(await links()).toHaveLength(0);
  });
  it("allows self-detach from a private site and keeps private founder names off owner/public projections",async()=>{
    const invitation=await invite();await accept(invitation.id);
    await fixtureSql()`UPDATE founders SET visibility='private',name='Hidden founder name' WHERE id=${founderId}`;
    await fixtureSql()`UPDATE sites SET is_listed=false WHERE id=${siteId}`;
    const ownerView=await listCollaborations(owner);expect(ownerView.ownedSites[0].founders).toEqual([{id:founderId,name:"Private profile",slug:null,visibility:"private"}]);
    expect(await getPublicFounder("invited-founder")).toBeNull();expect((await listCollaborations(recipient)).ownLinks).toHaveLength(1);
    expect(await removeFounderLink(recipient,{siteId,founderId})).toEqual({removed:true});expect(await links()).toHaveLength(0);
  });
  it("serializes simultaneous acceptance and owner withdrawal without leaving attribution behind",async()=>{
    const invitation=await invite();await Promise.allSettled([accept(invitation.id),removeFounderLink(owner,{siteId,founderId})]);
    expect(await links()).toHaveLength(0);
  });
  it("keeps the dashboard API authenticated, same-origin for mutation and uncached",async()=>{
    const url="https://example.com/api/founders/collaborations";
    expect((await GET(new NextRequest(url),undefined)).status).toBe(401);
    auth.mockResolvedValue({user:{id:owner}});
    expect((await POST(new NextRequest(url,{method:"POST",headers:{origin:"https://evil.invalid","content-type":"application/json"},body:JSON.stringify({siteId,founderSlug:"invited-founder"})}),undefined)).status).toBe(403);
    const response=await POST(new NextRequest(url,{method:"POST",headers:{origin:"https://example.com","content-type":"application/json"},body:JSON.stringify({siteId,founderSlug:"invited-founder"})}),undefined);
    expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("no-store");expect(limit).toHaveBeenCalledWith("founder-invite",owner,20,86400);
    expect((await GET(new NextRequest(url),undefined)).status).toBe(200);
  });
});

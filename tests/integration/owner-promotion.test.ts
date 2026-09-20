import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPublicAdSlots } from "../../src/modules/ads/public";
import { cleanupIntegrationDatabase, fixtureSql, prepareIntegrationDatabase, resetIntegrationData } from "./database";
beforeAll(prepareIntegrationDatabase, 60_000); afterAll(cleanupIntegrationDatabase, 30_000); beforeEach(resetIntegrationData);
async function campaign(audited = true) {
  const owner = randomUUID(), sql = fixtureSql();
  await sql`INSERT INTO users(id,email,name) VALUES(${owner},'owner@example.invalid','Synthetic owner')`;
  const [slot] = await sql`INSERT INTO ad_slots(position,order_index,name,tagline,url,user_id,expires_at)
    VALUES('right',0,'IndieTools','Discover tools','https://www.indietools.app/',${owner},now()+interval '30 days') RETURNING id`;
  if (audited) await sql`INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,reason,payload)
    SELECT ${owner},'ad.owner_promotion.created','ad_slot',id::text,'Synthetic authorized campaign',
    jsonb_build_object('campaign','indietools-launch-30d','linkPolicy','follow','url',url,'name',name,'expiresAtEpoch',extract(epoch FROM expires_at))
    FROM ad_slots WHERE id=${slot.id}`;
  return slot.id as number;
}
describe("audited owner advertisement link policy", () => {
  it("does not grant followed status from a matching destination alone", async () => {
    await campaign(false); expect((await getPublicAdSlots())[0].ownerPromotion).toBe(false);
  });
  it("permits only the specifically audited live owner campaign", async () => {
    await campaign(); expect((await getPublicAdSlots())[0].ownerPromotion).toBe(true);
  });
  it.each(["url", "position", "expiry"])("drops the exception if its %s changes", async field => {
    const id = await campaign(), sql = fixtureSql();
    if (field === "url") await sql`UPDATE ad_slots SET url='https://unrelated.example/' WHERE id=${id}`;
    if (field === "position") await sql`UPDATE ad_slots SET order_index=1 WHERE id=${id}`;
    if (field === "expiry") await sql`UPDATE ad_slots SET expires_at=expires_at+interval '1 day' WHERE id=${id}`;
    expect((await getPublicAdSlots())[0].ownerPromotion).toBe(false);
  });
  it("stops rendering at the recorded expiry without resetting the campaign", async () => {
    const id = await campaign(); await fixtureSql()`UPDATE ad_slots SET expires_at=now()-interval '1 second' WHERE id=${id}`;
    expect(await getPublicAdSlots()).toHaveLength(0);
  });
});

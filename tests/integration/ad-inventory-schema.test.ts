import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll,beforeAll,beforeEach,describe,expect,it } from "vitest";
import { getDb } from "../../src/db";
import { adReservations } from "../../src/db/schema";
import { checkDatabaseReadiness } from "../../src/infrastructure/health/readiness";
import { cleanupIntegrationDatabase,fixtureSql,prepareIntegrationDatabase,resetIntegrationData } from "./database";
let owner:string,inventory:string,product:string;
beforeAll(prepareIntegrationDatabase,60_000);
afterAll(cleanupIntegrationDatabase,30_000);
beforeEach(async()=>{
  await resetIntegrationData();owner=randomUUID();inventory=randomUUID();product=randomUUID();
  await fixtureSql()`INSERT INTO users(id,email,name) VALUES(${owner},'ads@example.invalid','Synthetic buyer')`;
  await fixtureSql()`INSERT INTO ad_inventory(id,position,order_index,active) VALUES(${inventory},'left',0,true)`;
  await fixtureSql()`INSERT INTO products(id,key,title,kind,amount_cents,currency,billing_interval,entitlement_days)
    VALUES(${product},'synthetic-ad','Synthetic ad','sidebar_ad',1000,'USD','one_time',30)`;
});
async function order(){const id=randomUUID();await fixtureSql()`INSERT INTO checkout_orders(id,user_id,product_id,idempotency_key,product_snapshot)
  VALUES(${id},${owner},${product},${id},'{}')`;return id;}
describe("ad inventory durable capacity guards",()=>{
  it("permits only one simultaneous live reservation per position and never ages out an uncertain hold",async()=>{
    const ids=await Promise.all([order(),order(),order()]);
    const outcomes=await Promise.allSettled(ids.map(orderId=>getDb()!.insert(adReservations).values({inventoryId:inventory,userId:owner,orderId}).returning()));
    expect(outcomes.filter(row=>row.status==="fulfilled")).toHaveLength(1);
    const [held]=await fixtureSql()`SELECT id,status,starts_at,ends_at FROM ad_reservations`;
    expect(held).toMatchObject({status:"held",starts_at:null,ends_at:null});
    await fixtureSql()`UPDATE ad_reservations SET created_at=now()-interval '90 days' WHERE id=${held.id}`;
    await expect(getDb()!.insert(adReservations).values({inventoryId:inventory,userId:owner,orderId:await order()})).rejects.toMatchObject({cause:{code:"23505"}});
    await fixtureSql()`UPDATE ad_reservations SET status='cancelled',release_evidence='synthetic definitive provider cancellation' WHERE id=${held.id}`;
    expect(await getDb()!.insert(adReservations).values({inventoryId:inventory,userId:owner,orderId:await order()}).returning()).toHaveLength(1);
  });
  it("requires a complete positive active window and protects reservation ownership references",async()=>{
    const [held]=await getDb()!.insert(adReservations).values({inventoryId:inventory,userId:owner,orderId:await order()}).returning();
    await expect(getDb()!.execute(sql`UPDATE ad_reservations SET status='active' WHERE id=${held.id}`)).rejects.toMatchObject({cause:{code:"23514"}});
    await expect(getDb()!.execute(sql`UPDATE ad_reservations SET starts_at=now() WHERE id=${held.id}`)).rejects.toMatchObject({cause:{code:"23514"}});
    await expect(getDb()!.execute(sql`DELETE FROM ad_inventory WHERE id=${inventory}`)).rejects.toMatchObject({cause:{code:"23001"}});
    await getDb()!.execute(sql`UPDATE ad_reservations SET status='active',starts_at=now(),ends_at=now()+interval '30 days' WHERE id=${held.id}`);
    const [active]=await fixtureSql()`SELECT status FROM ad_reservations WHERE id=${held.id}`;expect(active.status).toBe("active");
  });
  it("fails readiness when the runtime role lacks reservation write grants",async()=>{
    await expect(checkDatabaseReadiness()).resolves.toBeUndefined();
    const [role]=await getDb()!.execute<{name:string}>(sql`SELECT current_user AS name`);
    await fixtureSql()`REVOKE INSERT ON public.ad_reservations FROM ${fixtureSql()(role.name)}`;
    try {await expect(checkDatabaseReadiness()).rejects.toMatchObject({code:"DATABASE_UNAVAILABLE"});}
    finally {await fixtureSql()`GRANT INSERT ON public.ad_reservations TO ${fixtureSql()(role.name)}`;}
    await expect(checkDatabaseReadiness()).resolves.toBeUndefined();
  });
});

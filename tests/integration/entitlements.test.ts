import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "../../src/db";
import { activeSitePlacementPredicate, hasAccountProAccess, hasSiteProAccess } from "../../src/modules/payments/entitlements";
import { cleanupIntegrationDatabase, fixtureSql, prepareIntegrationDatabase, resetIntegrationData } from "./database";
beforeAll(prepareIntegrationDatabase, 60_000);
afterAll(cleanupIntegrationDatabase, 30_000);
beforeEach(resetIntegrationData);
async function setup() {
  const userId = randomUUID(), siteId = randomUUID();
  await fixtureSql()`INSERT INTO users(id,email,name) VALUES(${userId},${`${userId}@example.com`},'Synthetic')`;
  await fixtureSql()`INSERT INTO sites(id,slug,name,url,normalized_url,description,owner_name,owner_id)
    VALUES(${siteId},${siteId},'Synthetic',${`https://example.com/${siteId}`},${`https://example.com/${siteId}`},'Synthetic','Synthetic',${userId})`;
  return { userId, siteId };
}
async function dodoGrant(siteScoped = false) {
  const data = await setup(), orderId = randomUUID(), productId = randomUUID(), paymentId = `pay_${randomUUID()}`;
  await fixtureSql()`INSERT INTO products(id,key,title,kind,amount_cents,currency,billing_interval) VALUES(${productId},${productId},'Synthetic PRO','pro_listing',1000,'USD','one_time')`;
  await fixtureSql()`INSERT INTO checkout_orders(id,user_id,site_id,product_id,idempotency_key,product_snapshot)
    VALUES(${orderId},${data.userId},${siteScoped ? data.siteId : null},${productId},${orderId},${fixtureSql().json({ scope: siteScoped ? "site" : "account", requiresSite: siteScoped, kind: "pro_listing" })})`;
  await fixtureSql()`INSERT INTO payment_ledger(provider_payment_id,order_id,user_id,amount_cents,currency,status,occurred_at)
    VALUES(${paymentId},${orderId},${data.userId},1000,'USD','succeeded',now())`;
  await fixtureSql()`INSERT INTO entitlements(user_id,site_id,kind,source,source_id)
    VALUES(${data.userId},${siteScoped ? data.siteId : null},'PRO','dodo',${`payment:${paymentId}`})`;
  return { ...data, orderId, paymentId };
}
describe("effective PRO access", () => {
  it("preserves legacy account and site access independently", async () => {
    const { userId, siteId } = await setup();
    expect(await hasAccountProAccess(userId)).toBe(false);
    await fixtureSql()`UPDATE sites SET tier='pro' WHERE id=${siteId}`;
    expect(await hasSiteProAccess(siteId)).toBe(true);
    expect(await hasAccountProAccess(userId)).toBe(false);
    await fixtureSql()`UPDATE users SET is_pro=true WHERE id=${userId}`;
    expect(await hasAccountProAccess(userId)).toBe(true);
  });
  it("accepts an active legacy account grant without changing old flags", async () => {
    const { userId, siteId } = await setup();
    await fixtureSql()`INSERT INTO entitlements(user_id,kind,source,source_id) VALUES(${userId},'PRO','legacy',${`user:${userId}`})`;
    expect(await hasAccountProAccess(userId)).toBe(true);
    expect(await hasSiteProAccess(siteId)).toBe(true);
    expect((await fixtureSql()`SELECT is_pro FROM users WHERE id=${userId}`)[0].is_pro).toBe(false);
  });
  it("accepts a Dodo account purchase anchored to its immutable order", async () => {
    const { userId, siteId } = await dodoGrant();
    expect(await hasAccountProAccess(userId)).toBe(true);
    expect(await hasSiteProAccess(siteId)).toBe(true);
  });
  it("keeps site purchases scoped and never upgrades the account after deletion", async () => {
    const { userId, siteId } = await dodoGrant(true);
    expect(await hasSiteProAccess(siteId)).toBe(true);
    expect(await hasAccountProAccess(userId)).toBe(false);
    await fixtureSql()`DELETE FROM sites WHERE id=${siteId}`;
    expect((await fixtureSql()`SELECT site_id FROM entitlements`)[0].site_id).toBeNull();
    expect(await hasAccountProAccess(userId)).toBe(false);
  });
  it.each(["revoked", "expired", "future"])("rejects a %s account grant", async (state) => {
    const { userId, siteId } = await dodoGrant();
    if (state === "revoked") await fixtureSql()`UPDATE entitlements SET status='revoked'`;
    if (state === "expired") await fixtureSql()`UPDATE entitlements SET ends_at=now()-interval '1 second'`;
    if (state === "future") await fixtureSql()`UPDATE entitlements SET starts_at=now()+interval '1 day'`;
    expect(await hasAccountProAccess(userId)).toBe(false);
    expect(await hasSiteProAccess(siteId)).toBe(false);
  });
  it("denies orphaned or unscoped purchases instead of inferring account privilege", async () => {
    const { userId, orderId } = await dodoGrant();
    await fixtureSql()`UPDATE checkout_orders SET product_snapshot=product_snapshot-'scope' WHERE id=${orderId}`;
    expect(await hasAccountProAccess(userId)).toBe(false);
    await fixtureSql()`UPDATE entitlements SET source_id='payment:unrelated'`;
    expect(await hasAccountProAccess(userId)).toBe(false);
  });
  it("can bind a subscription grant before its first payment event arrives", async () => {
    const { userId, orderId } = await dodoGrant(), resourceId = `sub_${randomUUID()}`;
    await fixtureSql()`DELETE FROM payment_ledger`;
    await fixtureSql()`UPDATE entitlements SET source_id=${`subscription:${resourceId}`}`;
    await fixtureSql()`INSERT INTO payment_events(provider_event_id,type,resource_id,order_id,occurred_at,payload_hash,normalized_payload,processed_at)
      VALUES(${randomUUID()},'subscription.active',${resourceId},${orderId},now(),${"a".repeat(64)},'{}',now())`;
    expect(await hasAccountProAccess(userId)).toBe(true);
  });
  it("does not give a new owner the previous buyer's site subscription", async () => {
    const { siteId } = await dodoGrant(true), second = await setup();
    await fixtureSql()`UPDATE sites SET owner_id=${second.userId} WHERE id=${siteId}`;
    expect(await hasSiteProAccess(siteId)).toBe(false);
    expect(await hasAccountProAccess(second.userId)).toBe(false);
  });
  it.each(["FEATURED", "SPONSORSHIP"] as const)("fulfills %s only for its active owned site-scoped checkout", async (kind) => {
    const data = await dodoGrant(true), productKind = kind === "FEATURED" ? "featured_listing" : "sponsorship";
    await fixtureSql()`UPDATE entitlements SET kind=${kind}`;
    await fixtureSql()`UPDATE checkout_orders SET product_snapshot=jsonb_set(product_snapshot,'{kind}',to_jsonb(${productKind}::text))`;
    const allowed = async (ownerId = data.userId) => {
      const [row] = await getDb()!.execute<{ allowed: boolean }>(sql`SELECT ${activeSitePlacementPredicate(kind, data.siteId, ownerId)} AS allowed`);
      return row.allowed;
    };
    expect(await allowed()).toBe(true);
    expect(await allowed(randomUUID())).toBe(false);
    await fixtureSql()`UPDATE entitlements SET ends_at=now()-interval '1 second'`;
    expect(await allowed()).toBe(false);
    await fixtureSql()`UPDATE entitlements SET ends_at=null`;
    await fixtureSql()`UPDATE checkout_orders SET product_snapshot=jsonb_set(product_snapshot,'{scope}','"account"'::jsonb)`;
    expect(await allowed()).toBe(false);
  });
});

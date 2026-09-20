import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrapAdministrator, executeAdminAction, previewAdminAction } from "../../src/modules/admin/service";
import { getAdminReport } from "../../src/modules/admin/queries";
import { cleanupIntegrationDatabase, fixtureSql, prepareIntegrationDatabase, resetIntegrationData } from "./database";
vi.mock("../../src/config/env", () => ({ getEnv: () => ({ AUTH_SECRET: "synthetic-admin-secret-at-least-32-characters", JOB_MAX_ATTEMPTS: 3 }) }));
beforeAll(prepareIntegrationDatabase, 60_000);
afterAll(cleanupIntegrationDatabase, 30_000);
beforeEach(resetIntegrationData);
async function user(role?: "admin" | "moderator") {
  const userId = randomUUID();
  await fixtureSql()`INSERT INTO users(id,email,name) VALUES(${userId},${`${userId}@example.com`},'Synthetic')`;
  if (role) await fixtureSql()`INSERT INTO admin_roles(user_id,role) VALUES(${userId},${role})`;
  return { userId, role: role ?? "admin" as const };
}
async function site() {
  const id = randomUUID();
  await fixtureSql()`INSERT INTO sites(id,slug,name,url,normalized_url,description,owner_name) VALUES(${id},${id},'Synthetic',${`https://example.com/${id}`},${`https://example.com/${id}`},'Synthetic','Synthetic')`;
  return id;
}
describe("administrator authorization and audited changes", () => {
  it("changes the normalized primary category, preserves secondary taxonomy and audits the exact change", async () => {
    const actor = await user("admin"), siteId = await site();
    await fixtureSql()`INSERT INTO site_categories(site_id,category_id,is_primary) SELECT ${siteId},id,slug='other' FROM categories WHERE slug IN ('other','tool')`;
    const action = { action: "site.category", siteId, categorySlug: "developer-tools", reason: "Development utilities are this product's primary purpose" };
    const preview = await previewAdminAction(actor, action);
    expect((await fixtureSql()`SELECT c.slug FROM site_categories sc JOIN categories c ON c.id=sc.category_id WHERE sc.site_id=${siteId} AND sc.is_primary`)[0].slug).toBe("other");
    await executeAdminAction(actor, action, preview.token);
    const rows = await fixtureSql()`SELECT c.slug,sc.is_primary FROM site_categories sc JOIN categories c ON c.id=sc.category_id WHERE sc.site_id=${siteId} ORDER BY c.slug`;
    expect(rows).toEqual([{ slug: "developer-tools", is_primary: true }, { slug: "tool", is_primary: false }]);
    expect((await fixtureSql()`SELECT category,lifecycle FROM sites WHERE id=${siteId}`)[0]).toMatchObject({ category: "other", lifecycle: "submitted" });
    const [audit] = await fixtureSql()`SELECT action,payload FROM audit_logs`;
    expect(audit.action).toBe("site.category");
    expect(audit.payload.before.categories).toContainEqual(expect.objectContaining({ slug: "other", isPrimary: true }));
    expect(audit.payload.after.categories).toContainEqual(expect.objectContaining({ slug: "developer-tools", isPrimary: true }));
    await expect(executeAdminAction(actor, action, preview.token)).rejects.toMatchObject({ status: 409 });
  });
  it("rejects a category preview when taxonomy or catalog availability changes", async () => {
    const actor = await user("admin"), siteId = await site();
    const action = { action: "site.category", siteId, categorySlug: "seo", reason: "Search engine optimization product" };
    const preview = await previewAdminAction(actor, action);
    await fixtureSql()`INSERT INTO site_categories(site_id,category_id,is_primary) SELECT ${siteId},id,true FROM categories WHERE slug='tool'`;
    await expect(executeAdminAction(actor, action, preview.token)).rejects.toMatchObject({ status: 409 });
    const next = await previewAdminAction(actor, action);
    await fixtureSql()`UPDATE categories SET active=false WHERE slug='seo'`;
    await expect(executeAdminAction(actor, action, next.token)).rejects.toMatchObject({ status: 400 });
    await expect(previewAdminAction(actor, { ...action, categorySlug: "unknown" })).rejects.toThrow();
    expect((await fixtureSql()`SELECT count(*)::int AS count FROM audit_logs`)[0].count).toBe(0);
    await fixtureSql()`UPDATE categories SET active=true WHERE slug='seo'`;
  });
  it("does not accept a caller-provided admin role without a DB grant", async () => {
    const actor = await user();
    await expect(getAdminReport(actor, "users")).rejects.toMatchObject({ status: 403 });
    await expect(previewAdminAction(actor, { action: "site.monitoring", siteId: await site(), paused: true, reason: "Synthetic test reason" })).rejects.toMatchObject({ status: 403 });
  });
  it("bootstrap assigns exactly one first administrator and records a reason", async () => {
    const actor = await user(), second = await user();
    await bootstrapAdministrator(actor.userId, "Initial operator bootstrap");
    await expect(bootstrapAdministrator(second.userId, "Second bootstrap attempt")).rejects.toMatchObject({ status: 409 });
    expect((await fixtureSql()`SELECT count(*)::int AS count FROM admin_roles WHERE role='admin'`)[0].count).toBe(1);
    expect((await fixtureSql()`SELECT action FROM audit_logs`)[0].action).toBe("admin.bootstrap");
  });
  it("preview does not mutate; confirmation atomically changes state and appends audit", async () => {
    const actor = await user("admin"), siteId = await site();
    const action = { action: "site.lifecycle", siteId, lifecycle: "suspended", reason: "Synthetic verification failure" };
    const preview = await previewAdminAction(actor, action);
    expect((await fixtureSql()`SELECT lifecycle FROM sites WHERE id=${siteId}`)[0].lifecycle).toBe("submitted");
    await executeAdminAction(actor, action, preview.token);
    expect((await fixtureSql()`SELECT lifecycle FROM sites WHERE id=${siteId}`)[0].lifecycle).toBe("suspended");
    expect((await fixtureSql()`SELECT count(*)::int AS count FROM audit_logs`)[0].count).toBe(1);
    await expect(executeAdminAction(actor, action, preview.token)).rejects.toMatchObject({ status: 409 });
  });
  it("binds confirmation to exact action and actor", async () => {
    const actor = await user("admin"), other = await user("admin"), siteId = await site();
    const action = { action: "site.monitoring", siteId, paused: true, reason: "Synthetic provider investigation" };
    const preview = await previewAdminAction(actor, action);
    await expect(executeAdminAction(actor, { ...action, paused: false }, preview.token)).rejects.toMatchObject({ status: 403 });
    await expect(executeAdminAction(other, action, preview.token)).rejects.toMatchObject({ status: 403 });
  });
  it("rejects a stale preview after another operator changes the target", async () => {
    const actor = await user("admin"), siteId = await site();
    const action = { action: "site.monitoring", siteId, paused: true, reason: "Synthetic provider investigation" };
    const preview = await previewAdminAction(actor, action);
    await fixtureSql()`UPDATE sites SET lifecycle='verified' WHERE id=${siteId}`;
    await expect(executeAdminAction(actor, action, preview.token)).rejects.toMatchObject({ status: 409 });
  });
  it("rechecks role revocation during confirmation and restricts moderator billing", async () => {
    const actor = await user("admin"), siteId = await site();
    const action = { action: "site.monitoring", siteId, paused: true, reason: "Synthetic provider investigation" };
    const preview = await previewAdminAction(actor, action);
    await fixtureSql()`DELETE FROM admin_roles WHERE user_id=${actor.userId}`;
    await expect(executeAdminAction(actor, action, preview.token)).rejects.toMatchObject({ status: 403 });
    const moderator = await user("moderator");
    await expect(getAdminReport(moderator, "payments")).rejects.toMatchObject({ status: 403 });
    await expect(previewAdminAction(moderator, { action: "payment.review", orderId: randomUUID(), reason: "Synthetic payment investigation" })).rejects.toMatchObject({ status: 403 });
  });
  it("safe user report never includes account email and rejects malformed cursor", async () => {
    const actor = await user("admin");
    const report = await getAdminReport(actor, "users");
    expect(JSON.stringify(report)).not.toContain("@example.com");
    await expect(getAdminReport(actor, "users", "malformed")).rejects.toMatchObject({ status: 400 });
  });
  it.each(["sites", "founders", "categories", "technologies", "countries", "jobs", "failed-jobs", "performance", "badges", "claims", "payments", "orders", "products", "ads", "ad-inventory", "ad-reservations", "emails", "audit", "analytics"] as const)("validates the safe %s projection against the actual migrated schema", async (section) => {
    const actor = await user("admin");
    expect(await getAdminReport(actor, section)).toHaveProperty("rows");
  });
  it("saves approved server catalog values only after preview and retains an audit snapshot", async () => {
    const actor = await user("admin");
    const action = { action: "product.save", reason: "Approved synthetic provider catalog", product: {
      id: randomUUID(), key: "synthetic-pro", providerProductId: "prod_synthetic", title: "Synthetic approved product",
      kind: "pro_listing", amountCents: 1900, currency: "USD", billingInterval: "one_time", entitlementDays: null, requiresSite: true, active: false,
    } };
    const preview = await previewAdminAction(actor, action);
    expect(preview.before).toBeNull();
    await executeAdminAction(actor, action, preview.token);
    expect((await fixtureSql()`SELECT amount_cents,active FROM products`)[0]).toMatchObject({ amount_cents: 1900, active: false });
    expect((await fixtureSql()`SELECT payload FROM audit_logs`)[0].payload.after.amount_cents).toBe(1900);
  });
  it("requires verified fresh claim evidence before an audited ownership transfer", async () => {
    const actor = await user("admin"), claimant = await user(), siteId = await site(), claimId = randomUUID();
    await fixtureSql()`INSERT INTO site_claims(id,site_id,user_id,method,token_hash,status,expires_at)
      VALUES(${claimId},${siteId},${claimant.userId},'dns_txt',${"a".repeat(64)},'pending',now()+interval '1 day')`;
    const action = { action: "claim.transfer", claimId, reason: "Verified synthetic domain control evidence" };
    let preview = await previewAdminAction(actor, action);
    await expect(executeAdminAction(actor, action, preview.token)).rejects.toMatchObject({ status: 409 });
    await fixtureSql()`UPDATE site_claims SET status='verified',verified_at=now() WHERE id=${claimId}`;
    preview = await previewAdminAction(actor, action);
    await executeAdminAction(actor, action, preview.token);
    expect((await fixtureSql()`SELECT owner_id FROM sites WHERE id=${siteId}`)[0].owner_id).toBe(claimant.userId);
  });
});

import { randomUUID } from "node:crypto";
import type { Product, ProductCreateParams } from "dodopayments/resources/products/products";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { executePaymentCatalog, getPaymentCatalog, previewPaymentCatalog } from "../../src/modules/admin/payment-catalog";
import { CatalogProviderError } from "../../src/infrastructure/payments/dodo";
import { productCreateInput, paymentPlans } from "../../src/modules/payments/catalog";
import { cleanupIntegrationDatabase, fixtureSql, prepareIntegrationDatabase, resetIntegrationData } from "./database";

const provider = vi.hoisted(() => ({ create: vi.fn(), retrieve: vi.fn(), update: vi.fn() }));
const config = vi.hoisted(() => ({ AUTH_SECRET: "synthetic-admin-secret-at-least-32-characters", DODO_API_KEY: "synthetic-key",
  DODO_ENVIRONMENT: "test_mode", PAYMENTS_ENABLED: false }));
vi.mock("../../src/config/env", () => ({ getEnv: () => config }));
vi.mock("../../src/infrastructure/payments/dodo", async (original) => ({ ...await original<object>(), dodoCatalog: provider }));
beforeAll(prepareIntegrationDatabase, 60_000);
afterAll(cleanupIntegrationDatabase, 30_000);
beforeEach(async () => { await resetIntegrationData(); config.DODO_ENVIRONMENT = "test_mode";
  provider.create.mockReset().mockImplementation(async (input: ProductCreateParams) => remote(input));
  provider.retrieve.mockReset(); provider.update.mockReset().mockResolvedValue(undefined); });
function remote(input: ProductCreateParams, id = "pdt_synthetic") { return { ...input, product_id: id } as unknown as Product; }
async function actor(role?: "admin" | "moderator") {
  const userId = randomUUID();
  await fixtureSql()`INSERT INTO users(id,email,name) VALUES(${userId},${`${userId}@example.com`},'Synthetic administrator')`;
  if (role) await fixtureSql()`INSERT INTO admin_roles(user_id,role) VALUES(${userId},${role})`;
  return { userId, role: role ?? "admin" as const };
}
const create = { key: "pro_lifetime", mode: "create", reason: "Create the reviewed original Pro package" };
async function confirm(admin: Awaited<ReturnType<typeof actor>>, action: unknown) {
  const preview = await previewPaymentCatalog(admin, action);
  return executePaymentCatalog(admin, action, preview.token);
}

describe("Dodo catalog synchronization", () => {
  it("reports fixed prices without writes or provider calls and enforces DB admin grants", async () => {
    const admin = await actor("admin"), report = await getPaymentCatalog(admin);
    expect(report).toMatchObject({ provider: "dodo", configured: true, enabled: false });
    expect(report.products.map((product) => [product.key, product.amountCents, product.billingInterval, product.active]))
      .toEqual([["pro_lifetime", 900, "one_time", false], ["sidebar_ad_monthly", 1900, "month", false]]);
    expect((await fixtureSql()`SELECT count(*)::int AS count FROM products`)[0].count).toBe(0);
    expect(provider.create).not.toHaveBeenCalled(); expect(provider.retrieve).not.toHaveBeenCalled();
    await expect(getPaymentCatalog(await actor())).rejects.toMatchObject({ status: 403 });
    await expect(previewPaymentCatalog(await actor("moderator"), create)).rejects.toMatchObject({ status: 403 });
  });
  it("creates only after exact actor-bound single-use confirmation and verifies the returned price", async () => {
    const admin = await actor("admin"), preview = await previewPaymentCatalog(admin, create);
    expect(provider.create).not.toHaveBeenCalled();
    await expect(executePaymentCatalog(admin, { ...create, reason: "Changed review reason" }, preview.token)).rejects.toMatchObject({ status: 403 });
    const result = await executePaymentCatalog(admin, create, preview.token);
    expect(result).toMatchObject({ status: "synced", providerMutation: true, product: { active: true, amountCents: 900 } });
    expect(provider.create).toHaveBeenCalledTimes(1);
    expect(provider.create.mock.calls[0][0]).toMatchObject({ name: "TheFastestWeb Pro", price: { type: "one_time_price", currency: "USD", price: 900 } });
    await expect(executePaymentCatalog(admin, create, preview.token)).rejects.toMatchObject({ status: 409 });
  });
  it("allows just one concurrent create and preserves the committed pending barrier", async () => {
    const admin = await actor("admin"), first = await previewPaymentCatalog(admin, create), second = await previewPaymentCatalog(admin, create);
    const results = await Promise.allSettled([executePaymentCatalog(admin, create, first.token), executePaymentCatalog(admin, create, second.token)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(provider.create).toHaveBeenCalledTimes(1);
    expect((await fixtureSql()`SELECT count(*)::int AS count FROM products`)[0].count).toBe(1);
  });
  it("blocks duplicate creation after timeout; explicit matching bind reconciles without creating", async () => {
    const admin = await actor("admin"); provider.create.mockRejectedValue(new CatalogProviderError(true));
    await expect(confirm(admin, create)).rejects.toMatchObject({ uncertain: true });
    expect((await getPaymentCatalog(admin)).products[0]).toMatchObject({ active: false, syncStatus: "uncertain" });
    await expect(previewPaymentCatalog(admin, create)).rejects.toMatchObject({ status: 409 });
    const [product] = await fixtureSql()`SELECT id FROM products`;
    const binding = { ...create, mode: "bind", providerProductId: "pdt_recovered" };
    provider.retrieve.mockResolvedValue(remote({ ...productCreateInput(paymentPlans[0], product.id, "test_mode"), metadata: {} }, "pdt_recovered"));
    await expect(confirm(admin, binding)).rejects.toMatchObject({ status: 409 });
    expect((await getPaymentCatalog(admin)).products[0].syncStatus).toBe("uncertain");
    provider.retrieve.mockResolvedValue(remote(productCreateInput(paymentPlans[0], product.id, "test_mode"), "pdt_recovered"));
    await confirm(admin, binding);
    expect(provider.create).toHaveBeenCalledTimes(1);
    expect((await getPaymentCatalog(admin)).products[0]).toMatchObject({ active: true, providerProductId: "pdt_recovered", syncStatus: "synced" });
  });
  it("rejects remote price mismatch without replacing the remote price or activating local checkout", async () => {
    const admin = await actor("admin"), binding = { ...create, mode: "bind", providerProductId: "pdt_existing" };
    provider.retrieve.mockResolvedValue(remote({ ...productCreateInput(paymentPlans[0], randomUUID(), "test_mode"),
      price: { type: "one_time_price", currency: "USD", price: 1900 } }, "pdt_existing"));
    await expect(confirm(admin, binding)).rejects.toMatchObject({ status: 409 });
    expect((await getPaymentCatalog(admin)).products[0]).toMatchObject({ active: false, syncStatus: "conflict" });
    expect(provider.update).not.toHaveBeenCalled(); expect(provider.create).not.toHaveBeenCalled();
  });
  it("updates only app-owned descriptive fields and preserves remote pricing settings", async () => {
    const admin = await actor("admin"); await confirm(admin, create);
    const [product] = await fixtureSql()`SELECT id FROM products`;
    const input = productCreateInput(paymentPlans[0], product.id, "test_mode");
    provider.retrieve.mockResolvedValue(remote(input));
    await confirm(admin, { ...create, mode: "update" });
    expect(provider.update).toHaveBeenCalledWith("pdt_synthetic", { name: input.name, description: input.description, metadata: input.metadata });
    expect(provider.update.mock.calls[0][1]).not.toHaveProperty("price");
    provider.retrieve.mockResolvedValue(remote({ ...input, metadata: {} }));
    await expect(confirm(admin, { ...create, mode: "update" })).rejects.toMatchObject({ status: 409 });
    expect(provider.update).toHaveBeenCalledTimes(1);
  });
  it("retains original local prices on conflict and rejects environment-switch confirmation", async () => {
    const admin = await actor("admin"), preview = await previewPaymentCatalog(admin, create);
    config.DODO_ENVIRONMENT = "live_mode";
    await expect(executePaymentCatalog(admin, create, preview.token)).rejects.toMatchObject({ status: 403 });
    config.DODO_ENVIRONMENT = "test_mode";
    await executePaymentCatalog(admin, create, preview.token);
    config.DODO_ENVIRONMENT = "live_mode";
    expect((await getPaymentCatalog(admin)).products[0]).toMatchObject({ syncStatus: "conflict", active: false, lastErrorCode: "PROVIDER_ENVIRONMENT_MISMATCH" });
    await expect(previewPaymentCatalog(admin, { ...create, mode: "verify" })).rejects.toMatchObject({ status: 409 });
    config.DODO_ENVIRONMENT = "test_mode";
    await fixtureSql()`UPDATE products SET amount_cents=1200`;
    await expect(previewPaymentCatalog(admin, { ...create, mode: "verify" })).rejects.toMatchObject({ status: 409 });
    expect((await fixtureSql()`SELECT amount_cents FROM products`)[0].amount_cents).toBe(1200);
  });
  it("supports the original monthly advertising package with no trial or pricing discounts", async () => {
    const admin = await actor("admin");
    await confirm(admin, { ...create, key: "sidebar_ad_monthly" });
    expect(provider.create.mock.calls[0][0].price).toMatchObject({ type: "recurring_price", price: 1900, currency: "USD",
      payment_frequency_count: 1, payment_frequency_interval: "Month", trial_period_days: 0, discount_bps: 0, purchasing_power_parity: false });
    expect((await getPaymentCatalog(admin)).products[1]).toMatchObject({ active: true, entitlementDays: null, requiresSite: true });
  });
  it("blocks an environment switch even when the other environment's creation outcome is unknown", async () => {
    const admin = await actor("admin"); provider.create.mockRejectedValue(new CatalogProviderError(true));
    await expect(confirm(admin, create)).rejects.toMatchObject({ uncertain: true });
    config.DODO_ENVIRONMENT = "live_mode";
    expect((await getPaymentCatalog(admin)).products[0]).toMatchObject({ syncStatus: "conflict", lastErrorCode: "PROVIDER_ENVIRONMENT_MISMATCH" });
    await expect(previewPaymentCatalog(admin, create)).rejects.toMatchObject({ status: 409 });
    expect(provider.create).toHaveBeenCalledTimes(1);
  });
});

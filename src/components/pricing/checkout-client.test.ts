import { afterEach, describe, expect, it, vi } from "vitest";
import { accountPro, monthlyAd, startAdCheckout, startProCheckout, type CatalogProduct } from "./checkout-client";

afterEach(() => vi.unstubAllGlobals());
const json = (value: unknown) => new Response(JSON.stringify(value));
const product: CatalogProduct = { key: "pro_lifetime", title: "Pro", kind: "pro_listing", requiresSite: false, amountCents: 900, currency: "USD", billingInterval: "one_time", entitlementDays: null };

describe("original checkout presentation compatibility", () => {
  it("offers lifetime account Pro and monthly ads only through compatible catalog entries", () => {
    const ad: CatalogProduct = { ...product, key: "sidebar_ad_monthly", kind: "sidebar_ad", amountCents: 1900, billingInterval: "month", requiresSite: true };
    const catalog = { products: [{ ...product, billingInterval: "month" as const }, { ...ad, billingInterval: "one_time" as const, entitlementDays: 30 }, product, ad], adInventory: [] };
    expect(accountPro(catalog)).toEqual(product);
    expect(monthlyAd(catalog)).toEqual(ad);
    expect(accountPro({ ...catalog, products: [{ ...product, entitlementDays: 30 }] })).toBeUndefined();
    expect(accountPro({ ...catalog, products: [{ ...product, key: "legacy_pro" }] })).toBeUndefined();
  });
  it("does not start checkout when the payment catalog is disabled", async () => {
    const request = vi.fn().mockImplementation(() => Promise.resolve(json({ products: [], adInventory: [] })));
    vi.stubGlobal("fetch", request);
    await expect(startProCheckout()).rejects.toThrow("not available yet");
    await expect(startAdCheckout("https://example.com")).rejects.toThrow("not available yet");
    expect(request.mock.calls.every(([path]) => path === "/api/payments/catalog")).toBe(true);
  });
  it("uses the catalog key and rejects an untrusted checkout destination", async () => {
    const assign = vi.fn(), storage = new Map<string, string>();
    vi.stubGlobal("window", { location: { assign } });
    vi.stubGlobal("sessionStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
    const request = vi.fn().mockResolvedValueOnce(json({ products: [product], adInventory: [] }))
      .mockResolvedValueOnce(json({ url: "https://untrusted.example/checkout" }));
    vi.stubGlobal("fetch", request);
    await expect(startProCheckout()).rejects.toThrow("could not be verified");
    const [path, options] = request.mock.calls[1];
    expect(path).toBe("/api/payments/checkout");
    expect(JSON.parse(options.body)).toMatchObject({ productKey: "pro_lifetime", idempotencyKey: expect.any(String) });
    expect(JSON.parse(options.body)).not.toHaveProperty("amountCents");
    expect(assign).not.toHaveBeenCalled();
  });
});

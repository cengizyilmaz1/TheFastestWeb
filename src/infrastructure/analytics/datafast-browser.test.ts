import { describe, expect, it, vi } from "vitest";
import { clearDataFastStorage, isAnalyticsReferrer, loadDataFastClient } from "./datafast-browser";

const sdk = vi.hoisted(() => ({ initDataFast: vi.fn().mockResolvedValue({ trackPageview: vi.fn(), flush: vi.fn() }) }));
vi.mock("datafast", () => sdk);

describe("DataFast browser privacy", () => {
  it("initializes the official npm SDK once without automatic route, payment or identity events", async () => {
    const first = loadDataFastClient("dfid_synthetic", "example.test");
    const second = loadDataFastClient("dfid_synthetic", "example.test");
    expect(first).toBe(second);
    await first;
    expect(sdk.initDataFast).toHaveBeenCalledExactlyOnceWith({ websiteId: "dfid_synthetic", domain: "example.test",
      autoCapturePageviews: false, allowLocalhost: false, allowIframe: false, debug: false });
  });
  it.each(["", "https://search.example/", "https://example.test/category/analytics"])("accepts a public referrer: %s", (value) => {
    expect(isAnalyticsReferrer(value)).toBe(true);
  });
  it.each(["https://example.test/?token=secret", "https://example.test/admin", "https://example.test/dashboard/account",
    "https://example.test/auth/callback", "https://example.test/unsubscribe", "https://name:secret@example.test/",
    "https://example.test/user/a%40b.com", "https://example.test/#token", "not-a-url"])("prevents SDK initialization with a sensitive referrer: %s", (value) => {
    expect(isAnalyticsReferrer(value)).toBe(false);
  });
  it("revocation clears all SDK IDs, queued events and opt-out state without touching application data", () => {
    const values = new Map([["datafast_visitor_id", "synthetic-id"], ["datafast_event_queue", "[]"],
      ["datafast_ignore_tracking", "true"], ["theme", "dark"], ["tfw-pending-analytics-revocation", "1"]]);
    clearDataFastStorage({ get length() { return values.size; }, key: (index) => [...values.keys()][index] ?? null,
      removeItem: (key) => { values.delete(key); } });
    expect([...values.keys()]).toEqual(["theme", "tfw-pending-analytics-revocation"]);
  });
});

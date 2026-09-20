import { afterEach, describe, expect, it, vi } from "vitest";
import { browserAnalyticsAllowed, checkoutAnalyticsHeaders, clearDataFastStorage, isAnalyticsReferrer, loadDataFastClient, prepareCookielessAnalytics, rememberCookielessVisitor } from "./datafast-browser";

const sdk = vi.hoisted(() => ({ initDataFast: vi.fn().mockResolvedValue({ trackPageview: vi.fn(), flush: vi.fn(), reset: vi.fn() }) }));
vi.mock("datafast", () => sdk);
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
function browser(cookies = "") {
  const local = new Map<string, string>(), session = new Map<string, string>();
  const storage = (values: Map<string, string>) => ({ get length() { return values.size; }, key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
  const jar = new Map(cookies.split("; ").filter(Boolean).map((value) => value.split("=") as [string, string]));
  vi.stubGlobal("window", {});
  vi.stubGlobal("location", { origin: "https://example.test", hostname: "example.test", pathname: "/pricing", search: "" });
  vi.stubGlobal("navigator", { doNotTrack: null, globalPrivacyControl: false });
  vi.stubGlobal("document", { get cookie() { return [...jar].map(([key, value]) => `${key}=${value}`).join("; "); },
    set cookie(value: string) { const [key] = value.split("="); if (value.includes("Max-Age=0")) jar.delete(key); }, referrer: "" });
  vi.stubGlobal("localStorage", storage(local)); vi.stubGlobal("sessionStorage", storage(session));
  return { local, session, jar };
}

describe("DataFast browser privacy", () => {
  it("initializes the official npm SDK once without automatic route, payment or identity events", async () => {
    const first = loadDataFastClient("dfid_synthetic", "example.test");
    const second = loadDataFastClient("dfid_synthetic", "example.test");
    expect(first).toBe(second);
    await first;
    expect(sdk.initDataFast).toHaveBeenCalledExactlyOnceWith({ websiteId: "dfid_synthetic", domain: "example.test",
      autoCapturePageviews: false, allowLocalhost: false, allowIframe: false, debug: false, cookieless: true, onCookielessVisitorId: rememberCookielessVisitor });
  });
  it.each(["", "https://search.example/", "https://example.test/category/analytics"])("accepts a public referrer: %s", (value) => {
    expect(isAnalyticsReferrer(value)).toBe(true);
  });
  it.each(["https://example.test/?token=secret", "https://example.test/admin", "https://example.test/dashboard/account",
    "https://example.test/auth/callback", "https://example.test/profile/account", "https://example.test/unsubscribe", "https://name:secret@example.test/",
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
  it("resets the SDK's in-memory session before a later UTC day's pageview", async () => {
    const client = await loadDataFastClient("dfid_synthetic", "example.test");
    vi.useFakeTimers(); vi.setSystemTime(new Date(Date.now() + 86_400_000));
    expect(await loadDataFastClient("dfid_synthetic", "example.test")).toBe(client);
    expect(client.reset).toHaveBeenCalledTimes(1);
  });
  it("removes legacy trackers while preserving essential auth cookies and denied preferences", () => {
    const { local, session, jar } = browser("tfw_analytics_v1=denied; datafast_visitor_id=old; _ga=old; __Secure-next-auth.session-token=essential");
    local.set("datafast_event_queue", "old"); session.set("datafast_visitor_id", "old");
    prepareCookielessAnalytics("example.test");
    expect(browserAnalyticsAllowed()).toBe(false);
    expect(local.get("tfw_analytics_opt_out")).toBe("1");
    expect(local.has("datafast_event_queue")).toBe(false);
    expect(session.has("datafast_visitor_id")).toBe(false);
    expect([...jar.keys()]).toEqual(["tfw_analytics_v1", "__Secure-next-auth.session-token"]);
  });
  it("stores a server visitor ID only for the current origin and UTC day without granting cookie consent", () => {
    const { local, jar } = browser("tfw_analytics_v1=granted");
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-20T12:00:00Z"));
    prepareCookielessAnalytics("example.test");
    const visitorId = "00000000-0000-4000-8000-000000000001";
    rememberCookielessVisitor(visitorId);
    expect(checkoutAnalyticsHeaders()).toEqual({ "x-tfw-analytics-mode": "cookieless", "x-tfw-datafast-visitor": visitorId });
    expect([...local.keys()]).toEqual([]); expect([...jar.keys()]).toEqual([]);
    vi.stubGlobal("location", { origin: "https://preview.example.test", pathname: "/pricing", search: "" });
    expect(checkoutAnalyticsHeaders()).toEqual({});
    vi.stubGlobal("location", { origin: "https://example.test", pathname: "/pricing", search: "" });
    vi.setSystemTime(new Date("2026-09-21T00:00:00Z"));
    expect(checkoutAnalyticsHeaders()).toEqual({});
  });
  it("honors GPC, DNT, old SDK opt-out and excludes private/query/referrer attribution", () => {
    const { local } = browser(); const visitorId = "00000000-0000-4000-8000-000000000001";
    rememberCookielessVisitor(visitorId);
    for (const signals of [{ doNotTrack: "1" }, { globalPrivacyControl: true }]) {
      vi.stubGlobal("navigator", signals); expect(browserAnalyticsAllowed()).toBe(false); expect(checkoutAnalyticsHeaders()).toEqual({});
    }
    vi.stubGlobal("navigator", {}); local.set("datafast_ignore", "true");
    expect(browserAnalyticsAllowed()).toBe(false); local.clear();
    for (const url of [{ pathname: "/admin", search: "" }, { pathname: "/pricing", search: "?email=private" }]) {
      vi.stubGlobal("location", { origin: "https://example.test", ...url }); expect(checkoutAnalyticsHeaders()).toEqual({});
    }
    vi.stubGlobal("location", { origin: "https://example.test", pathname: "/pricing", search: "" });
    vi.stubGlobal("document", { cookie: "", referrer: "https://example.test/auth/callback?token=secret" });
    expect(checkoutAnalyticsHeaders()).toEqual({});
  });
});

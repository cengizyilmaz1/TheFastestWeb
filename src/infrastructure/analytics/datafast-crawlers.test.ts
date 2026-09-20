import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isCanonicalCrawlerRequest, recordCrawlerRequest, trustedCrawlerIp } from "./datafast-crawlers";

const config = vi.hoisted(() => ({ DATAFAST_BOT_TRACKING_ENABLED: true, DEPLOYMENT_MODE: "production",
  DATAFAST_WEBSITE_ID: "dfid_synthetic", DATAFAST_DOMAIN: "example.test", SITE_URL: "https://example.test",
  DATAFAST_BOT_TOKEN: "dfbot_synthetic_token_not_real", DATAFAST_BOT_TRUSTED_IP_HEADER: "none" }));
vi.mock("@/config/env", () => ({ getEnv: () => config }));

describe("DataFast server crawler SDK", () => {
  let pending: Promise<unknown>[];
  const fetchMock = vi.fn();
  const track = (path: string, headers: Record<string, string> = {}, method = "GET") => recordCrawlerRequest(
    new Request(`http://localhost:3000${path}`, { method, headers: { host: "example.test", "user-agent": "GPTBot/1.3", ...headers } }),
    { waitUntil: (promise) => { pending.push(promise); } },
  );
  beforeEach(() => {
    pending = []; fetchMock.mockReset().mockResolvedValue(new Response("{}", { status: 200 })); vi.stubGlobal("fetch", fetchMock);
    config.DATAFAST_BOT_TRACKING_ENABLED = true; config.DEPLOYMENT_MODE = "production"; config.DATAFAST_BOT_TRUSTED_IP_HEADER = "none";
  });
  afterEach(() => vi.unstubAllGlobals());

  it("accepts the routed canonical host behind TLS termination without trusting forwarded hosts", () => {
    expect(isCanonicalCrawlerRequest(new Request("http://localhost:3000/", { headers: { host: "example.test" } }), config.SITE_URL)).toBe(true);
    expect(isCanonicalCrawlerRequest(new Request(config.SITE_URL), config.SITE_URL)).toBe(true);
    expect(isCanonicalCrawlerRequest(new Request("https://preview.example.test", {
      headers: { "x-forwarded-host": "example.test", forwarded: "host=example.test;proto=https" },
    }), config.SITE_URL)).toBe(false);
  });
  it.each(["preview.example.test", "localhost:3000", "example.test.attacker.test", "example.test:8443", "example.test@attacker.test", "example.test,preview.example.test"])(
    "does not send bot events from a noncanonical or malformed Host even with spoofed forwarding headers: %s", async (host) => {
      track("/", { host, "x-forwarded-host": "example.test", forwarded: "host=example.test;proto=https" });
      await Promise.all(pending);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("uses the configured public origin and removes private request headers and untrusted IPs", async () => {
    track("/category/analytics", { cookie: "session=private", authorization: "Bearer private", referer: "https://private.test/?token=secret",
      "x-forwarded-for": "203.0.113.1", "cf-connecting-ip": "203.0.113.2" });
    await Promise.all(pending);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://datafa.st/api/ai-crawls");
    const options = fetchMock.mock.calls[0][1];
    expect(JSON.parse(options.body)).toMatchObject({ websiteId: "dfid_synthetic", href: "https://example.test/category/analytics",
      referrer: null, ai: { ip: null, userAgent: "GPTBot/1.3" } });
    expect(options.headers.Authorization).toBe(config.DATAFAST_BOT_TOKEN ? `Bearer ${config.DATAFAST_BOT_TOKEN}` : undefined);
    expect(options.body).not.toMatch(/session=|Bearer|private|secret|203\.0\.113/);
  });
  it.each(["/robots.txt", "/llms.txt", "/sitemap.xml", "/sitemap/pages.xml"])("keeps crawler discovery files visible: %s", async (path) => {
    track(path); await Promise.all(pending); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each(["/admin", "/api/payment", "/dashboard", "/unsubscribe", "/?token=secret", "/privacy?email=x", "/user/a%40b.com"])("excludes private paths and query strings: %s", async (path) => {
    track(path); await Promise.all(pending); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("excludes humans, mutations, privacy signals and Next prefetch/RSC requests", async () => {
    track("/", { "user-agent": "Mozilla/5.0 Chrome/130.0 Safari/537.36" });
    track("/", {}, "POST"); track("/", { "sec-gpc": "1" }); track("/", { dnt: "1" });
    track("/", { rsc: "1" }); track("/", { "next-router-prefetch": "1" }); track("/", { purpose: "prefetch" });
    await Promise.all(pending); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("uses only one validated IP from an explicitly trusted header", async () => {
    config.DATAFAST_BOT_TRUSTED_IP_HEADER = "x-real-ip";
    track("/", { "x-real-ip": "203.0.113.17", "cf-connecting-ip": "spoofed", "x-forwarded-for": "spoofed" });
    await Promise.all(pending);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).ai.ip).toBe("203.0.113.17");
    expect(trustedCrawlerIp(new Headers({ "x-real-ip": "203.0.113.1, 127.0.0.1" }), "x-real-ip")).toBeNull();
    expect(trustedCrawlerIp(new Headers({ "x-real-ip": "invalid" }), "x-real-ip")).toBeNull();
  });
  it("cannot send events when disabled or in the demo", async () => {
    config.DATAFAST_BOT_TRACKING_ENABLED = false; track("/");
    config.DATAFAST_BOT_TRACKING_ENABLED = true; config.DEPLOYMENT_MODE = "demo"; track("/");
    await Promise.all(pending); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("schedules network work without awaiting or surfacing a provider failure", async () => {
    fetchMock.mockRejectedValue(new Error("synthetic upstream failure"));
    expect(track("/")).toBeUndefined(); expect(pending).toHaveLength(1);
    await expect(Promise.all(pending)).resolves.toBeDefined();
  });
});

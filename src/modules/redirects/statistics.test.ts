import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ execute: vi.fn(), warn: vi.fn(), unavailable: false }));
vi.mock("@/db", () => ({ getDb: () => mocks.unavailable ? null : { execute: mocks.execute } }));
vi.mock("@/config/env", () => ({ getEnv: () => ({ SITE_URL: "https://canonical.example.invalid", ANALYTICS_ENABLED: false, DEPLOYMENT_MODE: "demo" }) }));
vi.mock("@/infrastructure/logging/logger", () => ({ logger: { warn: mocks.warn } }));
import { classifyRedirectRequest, prepareRedirectObservation, recordRedirectInBackground, recordRedirectObservation } from "./statistics";

const target = { kind: "managed" as const, ruleId: "00000000-0000-4000-8000-000000000001" };
function request(headers: Record<string, string> = {}, method = "GET", url = "https://canonical.example.invalid/old?email=private@example.invalid") {
  return new Request(url, { method, headers: { "user-agent": "Mozilla/5.0 Chrome/145 Safari/537.36", ...headers } });
}
beforeEach(() => { mocks.unavailable = false; mocks.execute.mockReset().mockResolvedValue([]); mocks.warn.mockReset(); });

describe("redirect request eligibility and privacy", () => {
  it.each(["HEAD", "POST", "OPTIONS"])("excludes %s requests", method => {
    expect(classifyRedirectRequest(request({}, method))).toBeNull();
  });
  it.each([
    { dnt: "1" }, { "sec-gpc": "1" }, { cookie: "session=secret; tfw_analytics_v1=denied" },
    { rsc: "1" }, { "next-router-prefetch": "1" }, { "next-router-segment-prefetch": "/x" },
    { purpose: "prefetch" }, { "sec-purpose": "prefetch;prerender" },
    { "sec-fetch-dest": "image" }, { "sec-fetch-dest": "empty" },
  ])("excludes automatic navigation and opt-out headers %j", headers => {
    expect(classifyRedirectRequest(request(headers))).toBeNull();
  });
  it.each(["Googlebot/2.1", "GPTBot/1.0", "curl/8.0", "Wget/1.0", "python-requests/2", "node", "HeadlessChrome/145", "", "x".repeat(1025)])("classifies detected automation separately (%s)", agent => {
    expect(classifyRedirectRequest(request({ "user-agent": agent }))).toBe("bot");
  });
  it("counts browser navigation without claiming it is a unique human", () => {
    expect(classifyRedirectRequest(request({ "sec-fetch-dest": "document" }))).toBe("human");
  });
  it("discards the complete request before deferred work, including query, headers, cookies and account identifiers", () => {
    const observation = prepareRedirectObservation(request({ cookie: "session=secret", "x-forwarded-for": "192.0.2.1", referer: "https://private.example.invalid" }), target);
    expect(observation).toEqual({ target, classification: "human", observedAt: expect.any(Date) });
    expect(JSON.stringify(observation)).not.toMatch(/secret|email|192\.0\.2|private\.example|Mozilla|cookie|referer/);
  });
  it("is independent of provider/demo switches while excluding noncanonical hosts and forged forwarded hosts", () => {
    expect(prepareRedirectObservation(request(), target)).not.toBeNull();
    expect(prepareRedirectObservation(request({}, "GET", "https://preview.example.invalid/old"), target)).toBeNull();
    expect(prepareRedirectObservation(request({ host: "preview.example.invalid", "x-forwarded-host": "canonical.example.invalid" }), target)).toBeNull();
    expect(prepareRedirectObservation(request({ host: "canonical.example.invalid" }, "GET", "http://localhost:3100/old"), target)).not.toBeNull();
  });
  it("accepts only bounded founder paths or a masked legacy path", () => {
    for (const sourcePath of ["/profile/private-user-id", "/founder/foo?email=x", "/founder/" + "x".repeat(81)]) {
      expect(prepareRedirectObservation(request(), { kind: "founder", founderId: target.ruleId, sourcePath })).toBeNull();
    }
    expect(prepareRedirectObservation(request(), { kind: "founder", founderId: target.ruleId, sourcePath: "/profile/[account-id]" })).not.toBeNull();
  });
});

describe("best-effort durable redirect counters", () => {
  it("contains write errors without disclosing driver messages or request data", async () => {
    mocks.execute.mockRejectedValue(new Error("private SQL/connection detail"));
    await expect(recordRedirectObservation({ target, classification: "human", observedAt: new Date() })).resolves.toBeUndefined();
    expect(mocks.warn).toHaveBeenCalledExactlyOnceWith({ event: "redirect.statistics_failed", code: "COUNTER_UNAVAILABLE" });
  });
  it("is safe without a database", async () => {
    mocks.unavailable = true;
    await expect(recordRedirectObservation({ target, classification: "human", observedAt: new Date() })).resolves.toBeUndefined();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("does not propagate lifecycle scheduler errors or write rejections", async () => {
    mocks.execute.mockRejectedValue(new Error("unavailable"));
    let pending: Promise<unknown> | undefined;
    expect(() => recordRedirectInBackground(request(), target, { waitUntil: promise => { pending = promise; throw new Error("context ended"); } })).not.toThrow();
    await expect(pending).resolves.toBeUndefined();
  });
  it("does not schedule excluded requests", () => {
    const waitUntil = vi.fn();
    recordRedirectInBackground(request({ dnt: "1" }), target, { waitUntil });
    expect(waitUntil).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});

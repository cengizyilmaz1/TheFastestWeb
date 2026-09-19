import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AppError } from "@/lib/http/errors";
const mocks = vi.hoisted(() => ({ config: { UNAVATAR_API_KEY: "unit-test-provider-key" as string | undefined }, rateLimit: vi.fn(), fetch: vi.fn() }));
vi.mock("@/config/env", () => ({ getEnv: () => mocks.config }));
vi.mock("@/modules/security/rate-limit", () => ({ enforceRateLimit: mocks.rateLimit }));
vi.mock("@/infrastructure/logging/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
import { GET } from "./route";

beforeEach(() => {
  mocks.config.UNAVATAR_API_KEY = "unit-test-provider-key";
  mocks.rateLimit.mockReset().mockResolvedValue(undefined);
  mocks.fetch.mockReset();
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => vi.unstubAllGlobals());
const request = (handle: string) => GET(new NextRequest(`https://example.com/api/avatar/${encodeURIComponent(handle)}`), { params: Promise.resolve({ handle }) });

describe("avatar provider quota protection", () => {
  it("rejects invalid handles before quota or provider usage", async () => {
    expect((await request("../../internal")).status).toBe(404);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("does not spend quota or call upstream without a provider key", async () => {
    mocks.config.UNAVATAR_API_KEY = undefined;
    expect((await request("example")).status).toBe(404);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("blocks upstream calls after the shared quota is exhausted", async () => {
    mocks.rateLimit.mockRejectedValue(new AppError("RATE_LIMITED", "Please try again later.", 429));
    expect((await request("example")).status).toBe(429);
    expect(mocks.rateLimit).toHaveBeenCalledWith("avatar-global", "all", 1000, 3600);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("calls only the fixed provider without redirect credential forwarding", async () => {
    mocks.fetch.mockResolvedValue(new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "image/png" } }));
    const response = await request("example");
    expect(response.status).toBe(200);
    expect(mocks.fetch).toHaveBeenCalledWith("https://unavatar.io/x/example", expect.objectContaining({ redirect: "error", headers: { "x-api-key": "unit-test-provider-key" } }));
    expect(mocks.rateLimit.mock.invocationCallOrder[0]).toBeLessThan(mocks.fetch.mock.invocationCallOrder[0]);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
  it("refuses provider SVG instead of serving active content", async () => {
    mocks.fetch.mockResolvedValue(new Response("<svg/>", { headers: { "content-type": "image/svg+xml" } }));
    expect((await request("example")).status).toBe(404);
  });
});

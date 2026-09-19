import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ budget: vi.fn(), fetch: vi.fn(), resolve: vi.fn() }));
vi.mock("./provider-budget", () => ({ consumePageSpeedBudget: mocks.budget }));
vi.mock("@/lib/security/public-url", () => ({ resolvePublicTarget: mocks.resolve }));
vi.mock("@/config/env", () => ({ getEnv: () => ({ GOOGLE_PSI_API_KEY: "synthetic-primary", GOOGLE_PSI_API_KEY_BACKUP: "synthetic-backup" }) }));
import { runPageSpeedTest } from "@/lib/pagespeed";
import { AppError } from "@/lib/http/errors";

beforeEach(() => {
  mocks.budget.mockReset().mockResolvedValue(undefined);
  mocks.fetch.mockReset();
  mocks.resolve.mockReset().mockResolvedValue({ url: new URL("https://example.com/") });
  vi.stubGlobal("fetch", mocks.fetch);
});

describe("provider request quota boundary", () => {
  it("reserves another request before using the backup credential", async () => {
    mocks.fetch.mockResolvedValueOnce(new Response("", { status: 429 })).mockResolvedValueOnce(new Response("", { status: 503 }));
    await expect(runPageSpeedTest("https://example.com/")).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
    expect(mocks.budget).toHaveBeenCalledTimes(2);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.budget.mock.invocationCallOrder[0]).toBeLessThan(mocks.fetch.mock.invocationCallOrder[0]);
    expect(mocks.budget.mock.invocationCallOrder[1]).toBeLessThan(mocks.fetch.mock.invocationCallOrder[1]);
  });
  it("makes no upstream request if the minute, day or dependency guard denies it", async () => {
    mocks.budget.mockRejectedValue(new AppError("RATE_LIMITED", "Quota full", 429));
    await expect(runPageSpeedTest("https://example.com/")).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("does not spend quota before the public URL policy accepts the target", async () => {
    mocks.resolve.mockRejectedValue(new AppError("URL_BLOCKED", "Blocked URL", 400));
    await expect(runPageSpeedTest("http://127.0.0.1/")).rejects.toMatchObject({ code: "URL_BLOCKED" });
    expect(mocks.budget).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

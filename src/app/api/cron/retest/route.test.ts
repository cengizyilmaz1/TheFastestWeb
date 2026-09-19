import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ getDb: vi.fn(), config: { CRON_SECRET: undefined as string | undefined } }));
vi.mock("@/db", () => ({ getDb: mocks.getDb }));
vi.mock("@/config/env", () => ({ getEnv: () => mocks.config }));
vi.mock("@/lib/pagespeed", () => ({ runPageSpeedTest: vi.fn(), METHODOLOGY_VERSION: "test" }));
import { GET } from "./route";
beforeEach(() => { mocks.getDb.mockReset(); mocks.config.CRON_SECRET = undefined; });
describe("cron fail closed", () => {
  it.each([undefined, "", "short"])("never touches DB when secret is %s", async (secret) => {
    mocks.config.CRON_SECRET = secret;
    const response = await GET(new NextRequest("https://example.com/api/cron/retest"), undefined);
    expect(response.status).toBe(401);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it("rejects invalid credentials even with configured secret", async () => {
    mocks.config.CRON_SECRET = "a".repeat(32);
    const response = await GET(new NextRequest("https://example.com/api/cron/retest", { headers: { authorization: "Bearer wrong" } }), undefined);
    expect(response.status).toBe(401);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), schedule: vi.fn() }));
vi.mock("@/db", () => ({ getDb: mocks.getDb }));
vi.mock("@/modules/jobs/service", () => ({ scheduleDailyRetests: mocks.schedule, scheduleMaintenance: mocks.schedule }));
import { GET } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("retired HTTP cron", () => {
  it.each([undefined, "Bearer wrong", `Bearer ${"legacy-secret-".repeat(4)}`])("never enqueues with authorization %s", async (authorization) => {
    const response = await GET(new NextRequest("https://example.com/api/cron/retest", {
      headers: authorization ? { authorization } : {},
    }), undefined);
    expect(response.status).toBe(410);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(await response.json()).toMatchObject({ status: "retired" });
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.schedule).not.toHaveBeenCalled();
  });
});

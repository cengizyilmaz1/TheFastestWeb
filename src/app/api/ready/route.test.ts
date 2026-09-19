import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({ execute: vi.fn(), configured: true, stopping: false }));
vi.mock("@/db", () => ({ getDb: () => state.configured ? { execute: state.execute } : null }));
vi.mock("@/config/lifecycle", () => ({ isShuttingDown: () => state.stopping }));
import { GET } from "./route";

describe("readiness", () => {
  beforeEach(() => {
    state.configured = true;
    state.stopping = false;
    state.execute.mockReset().mockResolvedValue([{ unsafe: false }]);
  });

  it("checks M1 schema and role safety, and prevents caching", async () => {
    const response = await GET(new NextRequest("http://localhost/api/ready"), undefined);
    expect(response.status).toBe(200);
    expect(state.execute).toHaveBeenCalledTimes(2);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ready" });
  });

  it("returns 503 when the database is not configured", async () => {
    state.configured = false;
    const response = await GET(new NextRequest("http://localhost/api/ready"), undefined);
    expect(response.status).toBe(503);
    expect(state.execute).not.toHaveBeenCalled();
  });

  it("does not disclose connection errors", async () => {
    state.execute.mockRejectedValue(new Error("postgresql://app:unit-test-only@db/test"));
    const response = await GET(new NextRequest("http://localhost/api/ready"), undefined);
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.code).toBe("DATABASE_UNAVAILABLE");
    expect(JSON.stringify(body)).not.toContain("unit-test-only");
  });

  it("stops accepting traffic before closing the database", async () => {
    state.stopping = true;
    const response = await GET(new NextRequest("http://localhost/api/ready"), undefined);
    expect(response.status).toBe(503);
    expect(state.execute).not.toHaveBeenCalled();
  });

  it("rejects unsafe administrator, database-owner, schema-create or table-owner roles", async () => {
    state.execute.mockResolvedValue([{ unsafe: true }]);
    const response = await GET(new NextRequest("http://localhost/api/ready"), undefined);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "DATABASE_UNAVAILABLE" });
  });

  it("rejects a missing role result", async () => {
    state.execute.mockResolvedValue([]);
    const response = await GET(new NextRequest("http://localhost/api/ready"), undefined);
    expect(response.status).toBe(503);
  });
});

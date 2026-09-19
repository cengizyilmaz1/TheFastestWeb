import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dependencyCheck = vi.hoisted(() => vi.fn());
vi.mock("./readiness", () => ({ checkReadiness: dependencyCheck }));
import { createBackgroundHealthHandler } from "./background";

describe("background process health", () => {
  let server: Server;
  let ready = false;
  let live = true;
  let base: string;

  beforeEach(async () => {
    ready = false;
    live = true;
    dependencyCheck.mockReset().mockResolvedValue(undefined);
    server = createServer(createBackgroundHealthHandler("worker", {
      isReady: () => ready, isLive: () => live,
    }));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("requires the worker loop to be ready even when its process is live", async () => {
    expect((await fetch(`${base}/health/live`)).status).toBe(200);
    expect((await fetch(`${base}/health/ready`)).status).toBe(503);
    expect(dependencyCheck).not.toHaveBeenCalled();
    ready = true;
    const response = await fetch(`${base}/health/ready`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-correlation-id")).toBeTruthy();
    expect(await response.json()).toEqual({ status: "ready", role: "worker" });
  });

  it("reports dependency failure without leaking credentials", async () => {
    ready = true;
    dependencyCheck.mockRejectedValue(new Error("redis://secret@private/0"));
    const response = await fetch(`${base}/health/ready`);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret");
  });

  it("rechecks loop state after dependencies resolve", async () => {
    ready = true;
    dependencyCheck.mockImplementation(async () => { ready = false; });
    expect((await fetch(`${base}/health/ready`)).status).toBe(503);
    live = false;
    expect((await fetch(`${base}/health/live`)).status).toBe(503);
  });

  it("does not expose other paths or accept mutations", async () => {
    expect((await fetch(`${base}/`)).status).toBe(404);
    expect((await fetch(`${base}/health/live`, { method: "POST" })).status).toBe(405);
  });
});

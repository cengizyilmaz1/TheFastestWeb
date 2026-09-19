import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";
import { createShutdown } from "../../runtime/shutdown.mjs";

describe("production shutdown", () => {
  it("drains an in-flight request before closing Next.js and the database", async () => {
    const events: string[] = [];
    let allowResponse!: () => void;
    let requestArrived!: () => void;
    const responseAllowed = new Promise<void>((resolve) => { allowResponse = resolve; });
    const arrived = new Promise<void>((resolve) => { requestArrived = resolve; });
    const server = createServer((_request, response) => {
      requestArrived();
      void responseAllowed.then(() => {
        events.push("response");
        response.end("ok");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const exit = vi.fn();
    const shutdown = createShutdown({
      server,
      app: { close: async () => { events.push("next.close"); } },
      markStopping: () => { events.push("stopping"); },
      closeResources: async () => { events.push("db.close"); },
      log: () => undefined,
      exit,
    });
    const response = fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    await arrived;
    const closing = shutdown();
    expect(shutdown()).toBe(closing);
    expect(events).toEqual(["stopping"]);
    allowResponse();
    expect(await (await response).text()).toBe("ok");
    await closing;
    expect(events).toEqual(["stopping", "response", "next.close", "db.close"]);
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it("still closes database resources when framework cleanup fails", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const closeResources = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn();
    const shutdown = createShutdown({
      server,
      app: { close: async () => { throw new Error("Test framework failure"); } },
      markStopping: () => undefined,
      closeResources,
      log: () => undefined,
      exit,
    });
    await shutdown();
    expect(closeResources).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });
});

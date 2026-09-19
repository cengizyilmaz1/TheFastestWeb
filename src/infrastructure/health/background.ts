import { createServer, type RequestListener } from "node:http";
import { randomUUID } from "node:crypto";
import { getEnv } from "@/config/env";
import { checkReadiness } from "./readiness";

type BackgroundRole = "worker" | "scheduler";
type HealthState = { isReady: () => boolean; isLive?: () => boolean; mode?:"dispatch-only"|"generation-and-dispatch" };

export function createBackgroundHealthHandler(role: BackgroundRole, state: HealthState): RequestListener {
  return (request, response) => {
    const send = (status: number, value: string) => {
      response.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Correlation-Id": randomUUID(),
      });
      response.end(JSON.stringify({ status: value, role,...(state.mode ? {mode:state.mode} : {}) }));
    };
    if (request.method !== "GET") { send(405, "method_not_allowed"); return; }
    if (request.url === "/health/live") {
      const live = state.isLive?.() ?? true;
      send(live ? 200 : 503, live ? "live" : "stopping");
      return;
    }
    if (request.url !== "/health/ready") { send(404, "not_found"); return; }
    if (!state.isReady()) { send(503, "not_ready"); return; }
    void checkReadiness().then(() => {
      // The loop may stop while its dependency check is in flight.
      const ready = state.isReady();
      send(ready ? 200 : 503, ready ? "ready" : "not_ready");
    }).catch(() => send(503, "not_ready"));
  };
}

export async function startBackgroundHealth(role: BackgroundRole, state: HealthState): Promise<{ close(): Promise<void> }> {
  const env = getEnv();
  const port = role === "worker" ? env.WORKER_HEALTH_PORT : env.SCHEDULER_HEALTH_PORT;
  const server = createServer(createBackgroundHealthHandler(role, state));
  server.headersTimeout = 5000;
  server.requestTimeout = 10000;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", resolve);
  });
  return {
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeIdleConnections();
    }),
  };
}

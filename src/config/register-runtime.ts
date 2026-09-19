import { validateRuntimeEnv } from "./env";
import { logger } from "@/infrastructure/logging/logger";
import { closeDb } from "@/db";
import { markShuttingDown } from "./lifecycle";
import { closeQueues } from "@/infrastructure/queue/queues";

async function closeRuntimeResources(): Promise<void> {
  const results = await Promise.allSettled([closeQueues(), closeDb()]);
  if (results.some((result) => result.status === "rejected")) throw new Error("Runtime resource cleanup failed");
}

export function registerRuntime(): void {
  const env = validateRuntimeEnv();
  process.env.AUTH_URL ??= env.AUTH_URL ?? env.SITE_URL;
  process.env.NEXTAUTH_URL = env.AUTH_URL ?? env.SITE_URL;
  if (env.AUTH_SECRET) process.env.NEXTAUTH_SECRET = env.AUTH_SECRET;

  const state = globalThis as typeof globalThis & {
    __thefastestwebSignalsRegistered?: boolean;
    __thefastestwebManagedLifecycle?: boolean;
    __thefastestwebLifecycle?: { markStopping: () => void; close: () => Promise<void> };
  };
  state.__thefastestwebLifecycle = { markStopping: markShuttingDown, close: closeRuntimeResources };
  // Production uses runtime/server.mjs and awaits this hook after HTTP/Next drain.
  if (!state.__thefastestwebManagedLifecycle && !state.__thefastestwebSignalsRegistered) {
    state.__thefastestwebSignalsRegistered = true;
    const stop = () => {
      markShuttingDown();
      logger.info({ event: "runtime.stopping" });
      void closeRuntimeResources().catch(() => logger.error({ event: "runtime.close_failed" }));
    };
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
  }
  logger.info({ event: "runtime.started", node: process.versions.node });
}

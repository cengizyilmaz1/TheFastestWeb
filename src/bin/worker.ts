import { validateRuntimeEnv } from "@/config/env";
import { closeDb } from "@/db";
import { logger } from "@/infrastructure/logging/logger";
import { startBackgroundHealth } from "@/infrastructure/health/background";
import { checkReadiness } from "@/infrastructure/health/readiness";
import { closeQueues } from "@/infrastructure/queue/queues";
import { startQueueWorkers } from "@/infrastructure/queue/workers";
import { installBackgroundShutdown } from "@/infrastructure/queue/lifecycle";
import { processBackgroundJob } from "@/modules/jobs/service";

async function main() {
  validateRuntimeEnv("worker");
  await checkReadiness();
  const workers = await startQueueWorkers(processBackgroundJob);
  let stopping = false;
  const health = await startBackgroundHealth("worker", { isReady: () => !stopping && workers.isReady(), isLive: () => !stopping });
  installBackgroundShutdown("worker", async () => {
    stopping = true;
    try { await workers.close(); }
    finally {
      await health.close();
      await closeQueues();
      await closeDb();
    }
  });
  logger.info({ event: "worker.started" });
}

void main().catch(async () => {
  logger.error({ event: "worker.start_failed", code: "SERVICE_UNAVAILABLE" });
  await closeQueues();
  await closeDb();
  process.exit(1);
});

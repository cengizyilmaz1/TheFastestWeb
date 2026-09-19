import { validateRuntimeEnv } from "@/config/env";
import { closeDb } from "@/db";
import { logger } from "@/infrastructure/logging/logger";
import { startBackgroundHealth } from "@/infrastructure/health/background";
import { checkReadiness } from "@/infrastructure/health/readiness";
import { closeQueues } from "@/infrastructure/queue/queues";
import { startSchedulerLoop } from "@/infrastructure/queue/scheduler-loop";
import { installBackgroundShutdown } from "@/infrastructure/queue/lifecycle";
import { scheduleDailyRetests, scheduleMaintenance, dispatchDueJobs } from "@/modules/jobs/service";

async function main() {
  const config = validateRuntimeEnv("scheduler");
  if (!config.SCHEDULER_ENABLED) {
    logger.error({ event: "scheduler.disabled", code: "CONFIGURATION_INVALID" });
    process.exitCode = 1;
    return;
  }
  await checkReadiness();
  const scheduler = startSchedulerLoop({ scheduleDailyRetests, scheduleMaintenance, dispatchDueJobs }, config.SCHEDULER_INTERVAL_SECONDS * 1000);
  let stopping = false;
  const health = await startBackgroundHealth("scheduler", { isReady: () => !stopping && scheduler.isReady(), isLive: () => !stopping });
  installBackgroundShutdown("scheduler", async () => {
    stopping = true;
    try { await scheduler.close(); }
    finally {
      await health.close();
      await closeQueues();
      await closeDb();
    }
  });
  logger.info({ event: "scheduler.started" });
}

void main().catch(async () => {
  logger.error({ event: "scheduler.start_failed", code: "SERVICE_UNAVAILABLE" });
  await closeQueues();
  await closeDb();
  process.exit(1);
});

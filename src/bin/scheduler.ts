import { validateRuntimeEnv } from "@/config/env";
import { closeDb } from "@/db";
import { logger } from "@/infrastructure/logging/logger";
import { startBackgroundHealth } from "@/infrastructure/health/background";
import { checkReadiness } from "@/infrastructure/health/readiness";
import { closeQueues } from "@/infrastructure/queue/queues";
import { startSchedulerLoop } from "@/infrastructure/queue/scheduler-loop";
import { installBackgroundShutdown } from "@/infrastructure/queue/lifecycle";
import { scheduleDailyRetests, scheduleMaintenance, scheduleDailyProductJobs, dispatchDueJobs } from "@/modules/jobs/service";

async function main() {
  const config = validateRuntimeEnv("scheduler");
  await checkReadiness();
  const scheduler = startSchedulerLoop({ scheduleDailyRetests, scheduleMaintenance, scheduleDailyProductJobs, dispatchDueJobs }, config.SCHEDULER_INTERVAL_SECONDS * 1000,{generate:config.SCHEDULER_ENABLED});
  let stopping = false;
  const health = await startBackgroundHealth("scheduler", { isReady: () => !stopping && scheduler.isReady(), isLive: () => !stopping,
    mode:config.SCHEDULER_ENABLED ? "generation-and-dispatch" : "dispatch-only" });
  installBackgroundShutdown("scheduler", async () => {
    stopping = true;
    try { await scheduler.close(); }
    finally {
      await health.close();
      await closeQueues();
      await closeDb();
    }
  });
  logger.info({ event: "scheduler.started",mode:config.SCHEDULER_ENABLED ? "generation-and-dispatch" : "dispatch-only" });
}

void main().catch(async () => {
  logger.error({ event: "scheduler.start_failed", code: "SERVICE_UNAVAILABLE" });
  await closeQueues();
  await closeDb();
  process.exit(1);
});

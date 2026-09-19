import { logger } from "@/infrastructure/logging/logger";

export type SchedulerTasks = {
  scheduleDailyRetests(): Promise<unknown>;
  scheduleMaintenance(): Promise<unknown>;
  scheduleDailyProductJobs?(): Promise<unknown>;
  dispatchDueJobs(): Promise<unknown>;
};

/** Serialized ticks avoid local overlap. PostgreSQL deduplication handles replicas. */
export function startSchedulerLoop(tasks: SchedulerTasks, intervalMs: number, options:{generate?:boolean}={}) {
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1000 || intervalMs > 300_000) throw new Error("Invalid scheduler interval");
  let closing = false;
  let lastSuccess = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let wake: (() => void) | undefined;
  const finished = (async () => {
    while (!closing) {
      try {
        // A failing daily insert must not prevent previously saved jobs dispatching.
        const scheduling = await Promise.allSettled(options.generate===false ? [] : [tasks.scheduleDailyRetests(), tasks.scheduleMaintenance(),
          ...(tasks.scheduleDailyProductJobs ? [tasks.scheduleDailyProductJobs()] : [])]);
        if (scheduling.some((result) => result.status === "rejected")) logger.error({ event: "scheduler.schedule_failed", code: "SERVICE_UNAVAILABLE" });
        await tasks.dispatchDueJobs();
        if (scheduling.every((result) => result.status === "fulfilled")) lastSuccess = Date.now();
      } catch {
        logger.error({ event: "scheduler.tick_failed", code: "SERVICE_UNAVAILABLE" });
      }
      if (!closing) await new Promise<void>((resolve) => { wake = resolve; timer = setTimeout(resolve, intervalMs); });
    }
  })();
  return {
    isReady: () => !closing && lastSuccess > 0 && Date.now() - lastSuccess < intervalMs * 3,
    async close() {
      closing = true;
      clearTimeout(timer);
      wake?.();
      await finished;
    },
  };
}

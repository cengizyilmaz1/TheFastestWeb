import { logger } from "@/infrastructure/logging/logger";

export function installBackgroundShutdown(role: "worker" | "scheduler", cleanup: () => Promise<void>) {
  let stopping: Promise<void> | undefined;
  const stop = (signal: string) => stopping ??= (async () => {
    logger.info({ event: "background.stopping", role, signal });
    const timer = setTimeout(() => {
      logger.error({ event: "background.shutdown_deadline", role, code: "SERVICE_UNAVAILABLE" });
      process.exit(1);
    }, 150_000);
    timer.unref();
    try {
      await cleanup();
      logger.info({ event: "background.stopped", role });
    } catch {
      logger.error({ event: "background.shutdown_failed", role, code: "SERVICE_UNAVAILABLE" });
      process.exitCode = 1;
    } finally { clearTimeout(timer); }
  })();
  process.once("SIGTERM", () => { void stop("SIGTERM"); });
  process.once("SIGINT", () => { void stop("SIGINT"); });
  return stop;
}

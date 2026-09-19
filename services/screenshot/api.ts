import { parseScreenshotConfig } from "./config";
import { ScreenshotRepository } from "./repository";
import { ScreenshotBroker } from "./broker";
import { createScreenshotServer } from "./http";
import { logger } from "../../src/infrastructure/logging/logger";
import { isStorageEnabled } from "../../src/infrastructure/storage/r2";

async function main() {
  const config = parseScreenshotConfig(process.env);
  if (!isStorageEnabled()) throw new Error("Storage must be configured");
  const repository = new ScreenshotRepository(config), broker = new ScreenshotBroker(config);
  let stopping = false;
  let tick: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const server = createScreenshotServer(config, repository, broker, { isStopping: () => stopping });
  const reconcile = () => {
    tick = broker.dispatch(repository).catch(() => logger.error({ event: "screenshot.dispatch_failed" })).then(() => {
      if (!stopping) timer = setTimeout(reconcile, 5000);
    });
  };
  await Promise.all([repository.ready(), broker.ready()]);
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(config.SCREENSHOT_PORT, "0.0.0.0", resolve); });
  reconcile();
  const stop = () => {
    if (stopping) return;
    stopping = true; clearTimeout(timer);
    const deadline = setTimeout(() => process.exit(1), 30_000);
    void (async () => {
      await new Promise<void>((resolve) => { server.close(() => resolve()); server.closeIdleConnections(); });
      await tick; await broker.close(); await repository.close();
      clearTimeout(deadline); process.exit(0);
    })().catch(() => process.exit(1));
  };
  process.once("SIGTERM", stop); process.once("SIGINT", stop);
  logger.info({ event: "screenshot.api_started" });
}
void main().catch(() => { logger.error({ event: "screenshot.api_start_failed" }); process.exit(1); });

import { createServer } from "node:http";
import { parseScreenshotConfig } from "./config";
import { ScreenshotRepository } from "./repository";
import { ScreenshotBroker } from "./broker";
import { CapturePool } from "./capture";
import { createRemoteCapture, rendererReady } from "./remote-capture";
import { createCaptureProcessor, cleanExpiredCaptures } from "./processor";
import { logger } from "../../src/infrastructure/logging/logger";
import { isStorageEnabled } from "../../src/infrastructure/storage/r2";

async function main() {
  const config = parseScreenshotConfig(process.env);
  if (!isStorageEnabled()) throw new Error("Storage must be configured");
  const repository = new ScreenshotRepository(config), broker = new ScreenshotBroker(config);
  const pool = new CapturePool(config.CHROMIUM_EXECUTABLE_PATH, config.SCREENSHOT_CONCURRENCY);
  const capture = config.SCREENSHOT_CAPTURE_BACKEND === "remote" ? createRemoteCapture(config) : pool.capture.bind(pool);
  let stopping = false;
  let cleanup: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.all([repository.ready(), broker.ready()]);
  await broker.start(createCaptureProcessor(config, repository, capture));
  const sweep = () => {
    cleanup = cleanExpiredCaptures(repository).catch(() => logger.error({ event: "screenshot.retention_failed" })).then(() => {
      if (!stopping) timer = setTimeout(sweep, 60_000);
    });
  };
  const server = createServer((request, response) => {
    const ready = !stopping && broker.isRunning();
    if (request.method !== "GET" || !["/health/live", "/health/ready"].includes(request.url ?? "")) { response.writeHead(404); response.end(); return; }
    const send = (healthy: boolean) => { response.writeHead(healthy ? 200 : 503, { "content-type": "application/json", "cache-control": "no-store" }); response.end(JSON.stringify({ status: healthy ? "ready" : "unavailable" })); };
    if (request.url === "/health/live") return send(!stopping);
    if (!ready) return send(false);
    void Promise.all([repository.ready(), broker.ready(),
      ...(config.SCREENSHOT_CAPTURE_BACKEND === "remote" ? [rendererReady(config)] : [])])
      .then(() => send(!stopping)).catch(() => send(false));
  });
  server.requestTimeout = 5000; server.headersTimeout = 5000;
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(config.SCREENSHOT_WORKER_PORT, "0.0.0.0", resolve); });
  sweep();
  const stop = () => {
    if (stopping) return;
    stopping = true; clearTimeout(timer);
    const deadline = setTimeout(() => process.exit(1), 120_000);
    void (async () => {
      await broker.close(); await pool.close(); await cleanup;
      await new Promise<void>((resolve) => { server.close(() => resolve()); server.closeIdleConnections(); });
      await repository.close(); clearTimeout(deadline); process.exit(0);
    })().catch(() => process.exit(1));
  };
  process.once("SIGTERM", stop); process.once("SIGINT", stop);
  logger.info({ event: "screenshot.worker_started", backend: config.SCREENSHOT_CAPTURE_BACKEND });
}
void main().catch(() => { logger.error({ event: "screenshot.worker_start_failed" }); process.exit(1); });

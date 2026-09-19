import { UnrecoverableError, Worker } from "bullmq";
import { getEnv } from "@/config/env";
import { withCorrelationId } from "@/lib/http/correlation";
import { logger } from "@/infrastructure/logging/logger";
import { ACTIVE_QUEUES, validateQueuePayload, type QueuePayload } from "./contracts";
import { getQueue } from "./queues";
import { createRedisConnection, waitForRedis, withinRedisDeadline } from "./redis";

export type BackgroundProcessor = (id: string, options: { attempt: number }) => Promise<unknown>;
export type WorkerGroup = { isReady(): boolean; close(): Promise<void> };

export async function startQueueWorkers(processor: BackgroundProcessor): Promise<WorkerGroup> {
  const config = getEnv();
  // Limits live in Redis and apply across every worker replica, not per process.
  for (const name of ACTIVE_QUEUES) await getQueue(name);
  const connection = createRedisConnection("worker");
  const workers: Worker<QueuePayload>[] = [];
  let closing = false;
  try {
    await waitForRedis(connection);
    for (const name of ACTIVE_QUEUES) {
      const worker = new Worker<QueuePayload>(name, async (job) => {
        let payload;
        try {
          payload = validateQueuePayload(name, job.name, job.data);
          if (payload.id !== job.id) throw new Error("Delivery ID mismatch");
        } catch {
          // Never acknowledge unknown future job types with a fake consumer.
          throw new UnrecoverableError("Unsupported or invalid background job");
        }
        return withCorrelationId(payload.correlationId!, async () => {
          try { return await processor(payload.id, { attempt: job.attemptsMade + 1 }); }
          catch {
            // Bull stores error strings in Redis; never persist raw DB/provider errors.
            throw new Error("Background processing is temporarily unavailable");
          }
        });
      }, {
        connection,
        prefix: config.QUEUE_PREFIX,
        concurrency: name === "performance" ? config.WORKER_CONCURRENCY : 1,
        ...(name === "performance" ? { limiter: { max: config.PSI_REQUESTS_PER_MINUTE, duration: 60_000 } } : {}),
        // Bull renews this automatically; the DB lease independently owns commits.
        lockDuration: 30_000,
        maxStalledCount: 1,
      });
      worker.on("error", () => logger.error({ event: "worker.connection_error", queue: name, code: "SERVICE_UNAVAILABLE" }));
      worker.on("failed", (job) => logger.warn({ event: "worker.delivery_failed", queue: name, jobId: job?.id, code: "SERVICE_UNAVAILABLE" }));
      workers.push(worker);
    }
    await withinRedisDeadline(Promise.all(workers.map((worker) => worker.waitUntilReady())));
  } catch (error) {
    await Promise.allSettled(workers.map((worker) => worker.close(true)));
    connection.disconnect();
    throw error;
  }
  return {
    isReady: () => !closing && connection.status === "ready" && workers.every((worker) => worker.isRunning()),
    async close() {
      if (closing) return;
      closing = true;
      // Graceful close stops new claims and awaits active handlers. The process
      // lifecycle owns a bounded deadline and exits if Redis prevents draining.
      try { await Promise.all(workers.map((worker) => worker.close())); }
      finally { connection.disconnect(); }
    },
  };
}

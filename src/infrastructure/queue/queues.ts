import { randomUUID } from "node:crypto";
import { Queue } from "bullmq";
import { getEnv } from "@/config/env";
import { AppError } from "@/lib/http/errors";
import { logger } from "@/infrastructure/logging/logger";
import { QUEUE_NAMES, validateQueueJob, type QueueJob, type QueueName, type QueuePayload } from "./contracts";
import { closeRedis, getRedis, waitForRedis, withinRedisDeadline } from "./redis";

const queues = new Map<QueueName, Queue<QueuePayload>>();

export async function getQueue(name: QueueName): Promise<Queue<QueuePayload>> {
  if (!QUEUE_NAMES.includes(name)) throw new Error("Unknown queue");
  const connection = getRedis();
  await waitForRedis(connection);
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue<QueuePayload>(name, {
      connection,
      prefix: getEnv().QUEUE_PREFIX,
      defaultJobOptions: {
        // DB leases and availableAt own retries; BullMQ is delivery only.
        attempts: 1,
        removeOnComplete: { age: 86_400, count: 10_000 },
        removeOnFail: { age: 7 * 86_400, count: 10_000 },
        stackTraceLimit: 0,
      },
    });
    queue.on("error", () => logger.warn({ event: "queue.error", queue: name, code: "SERVICE_UNAVAILABLE" }));
    queues.set(name, queue);
  }
  await withinRedisDeadline(queue.waitUntilReady());
  // Redis may lose metadata while worker processes remain alive. Re-establish
  // shared limits before every producer add, including outbox recovery. All
  // application roles must use the same queue policy environment values.
  if (name === "performance") {
    await withinRedisDeadline(Promise.all([
      queue.setGlobalConcurrency(getEnv().WORKER_CONCURRENCY),
      queue.setGlobalRateLimit(getEnv().PSI_REQUESTS_PER_MINUTE, 60_000),
    ]));
  } else if (name === "maintenance") {
    await withinRedisDeadline(queue.setGlobalConcurrency(1));
  }
  return queue;
}

/** Call only for a due DB outbox row. PostgreSQL, not Redis retention, owns completion. */
export async function publishJob(input: QueueJob): Promise<void> {
  const job = validateQueueJob(input);
  try {
    const queue = await getQueue(job.queue);
    const previous = await withinRedisDeadline(queue.getJob(job.id));
    if (previous) {
      const state = await withinRedisDeadline(previous.getState());
      if (state !== "completed" && state !== "failed") return;
      // The ledger can be due after DB retry scheduling or restored Redis. Removing
      // only a terminal delivery allows the same ledger UUID to be dispatched again.
      try { await withinRedisDeadline(previous.remove()); }
      catch {
        const current = await withinRedisDeadline(queue.getJob(job.id));
        if (current && ["active", "waiting", "delayed"].includes(await withinRedisDeadline(current.getState()))) return;
        throw new Error("Queue reconciliation failed");
      }
    }
    await withinRedisDeadline(queue.add(job.kind, { jobId: job.id, correlationId: job.correlationId ?? randomUUID() }, { jobId: job.id }));
  } catch {
    throw new AppError("SERVICE_UNAVAILABLE", "The job is saved and will be dispatched when background services recover.", 503);
  }
}

export async function readQueueCounts(): Promise<Record<string, Record<string, number>>> {
  const counts = await Promise.all(QUEUE_NAMES.map(async (name) => {
    const queue = await getQueue(name);
    const [jobs, paused] = await withinRedisDeadline(Promise.all([
      queue.getJobCounts("waiting", "active", "delayed", "completed", "failed"), queue.isPaused(),
    ]));
    return [name, { ...jobs, paused: Number(paused) }] as const;
  }));
  return Object.fromEntries(counts);
}

export async function closeQueues(): Promise<void> {
  const current = [...queues.values()];
  queues.clear();
  await Promise.allSettled(current.map((queue) => withinRedisDeadline(queue.close())));
  await closeRedis();
}

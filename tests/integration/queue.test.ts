import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Worker } from "bullmq";
import { ACTIVE_QUEUES } from "../../src/infrastructure/queue/contracts";
import { closeQueues, getQueue, publishJob } from "../../src/infrastructure/queue/queues";
import { consumeRateLimit, createRedisConnection, getRedis, pingRedis, readRedisHealth } from "../../src/infrastructure/queue/redis";
import { startQueueWorkers, type WorkerGroup } from "../../src/infrastructure/queue/workers";
import { enforceRateLimit } from "../../src/modules/security/rate-limit";
import { closeDb } from "../../src/db";
import { scheduleMaintenance, dispatchDueJobs, processBackgroundJob } from "../../src/modules/jobs/service";
import { cleanupIntegrationDatabase, fixtureSql, prepareIntegrationDatabase, resetIntegrationData } from "./database";

const config = vi.hoisted(() => ({
  REDIS_URL: "", QUEUE_PREFIX: "", WORKER_CONCURRENCY: 2, PSI_REQUESTS_PER_MINUTE: 120, JOB_MAX_ATTEMPTS: 3,
}));
vi.mock("../../src/config/env", () => ({ getEnv: () => config }));
vi.mock("../../src/lib/pagespeed", () => ({ runPageSpeedTest: vi.fn(() => { throw new Error("No provider calls permitted in transport tests"); }), METHODOLOGY_VERSION: "test-only" }));

let group: WorkerGroup | undefined;
async function until(check: () => Promise<boolean>, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (!await check()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for queue state");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

beforeAll(async () => {
  const raw = process.env.REDIS_TEST_URL;
  if (!raw) throw new Error("REDIS_TEST_URL must point to a disposable loopback Redis database 15");
  const url = new URL(raw);
  if (!["redis:", "rediss:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/15") {
    throw new Error("Queue integration tests refuse non-loopback Redis or database other than 15");
  }
  config.REDIS_URL = raw;
  config.QUEUE_PREFIX = `tfw-test-${randomUUID().replaceAll("-", "").slice(0, 24)}`;
  await pingRedis();
  await prepareIntegrationDatabase();
}, 60_000);

beforeEach(resetIntegrationData);

afterEach(async () => {
  await group?.close();
  group = undefined;
  for (const name of ACTIVE_QUEUES) await (await getQueue(name)).obliterate({ force: true });
});
afterAll(async () => {
  // Quota keys also belong exclusively to this run's unguessable namespace.
  if (config.QUEUE_PREFIX) {
    let cursor = "0";
    do {
      const result = await getRedis().scan(cursor, "MATCH", `${config.QUEUE_PREFIX}:*`, "COUNT", 100);
      cursor = result[0];
      if (result[1].length) await getRedis().del(...result[1]);
    } while (cursor !== "0");
  }
  await closeQueues();
  await cleanupIntegrationDatabase();
}, 30_000);

describe("real Redis delivery", () => {
  it("enforces durable queue Redis configuration", async () => {
    expect(await readRedisHealth()).toEqual({ ready: true });
  });
  it("deduplicates concurrent producers by durable job UUID and keeps URL/PII out of payload", async () => {
    const id = randomUUID(), correlationId = randomUUID();
    await Promise.all(Array.from({ length: 10 }, () => publishJob({ id, queue: "performance", kind: "site.performance.daily", correlationId })));
    const queue = await getQueue("performance");
    expect(await queue.getWaitingCount()).toBe(1);
    const job = await queue.getJob(id);
    expect(job?.data).toEqual({ jobId: id, correlationId });
    expect(job?.opts.attempts).toBe(1);
  });
  it("redelivers a terminal Bull record only when the DB dispatcher requests it", async () => {
    const processor = vi.fn().mockResolvedValue({ status: "retry" });
    group = await startQueueWorkers(processor);
    const id = randomUUID();
    const job = { id, queue: "performance" as const, kind: "site.performance.manual" as const };
    await publishJob(job);
    const queue = await getQueue("performance");
    await until(async () => await (await queue.getJob(id))?.getState() === "completed");
    expect(processor).toHaveBeenCalledTimes(1);
    await publishJob(job);
    await until(async () => processor.mock.calls.length === 2 && await (await queue.getJob(id))?.getState() === "completed");
    expect(processor).toHaveBeenLastCalledWith(id, { attempt: 1 });
  });
  it("does not consume unimplemented kinds even when Redis receives a forged delivery", async () => {
    const processor = vi.fn();
    group = await startQueueWorkers(processor);
    const id = randomUUID();
    const queue = await getQueue("performance");
    await queue.add("screenshot.capture", { jobId: id, correlationId: randomUUID() }, { jobId: id });
    await until(async () => await (await queue.getJob(id))?.getState() === "failed");
    expect(processor).not.toHaveBeenCalled();
  });
  it("drains an active handler before completing graceful shutdown", async () => {
    let release!: () => void;
    const processor = vi.fn(() => new Promise((resolve) => { release = () => resolve({ status: "succeeded" }); }));
    group = await startQueueWorkers(processor);
    await publishJob({ id: randomUUID(), queue: "maintenance", kind: "maintenance.cleanup" });
    await until(async () => processor.mock.calls.length === 1);
    let closed = false;
    const stop = group.close().then(() => { closed = true; });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(closed).toBe(false);
    expect(group.isReady()).toBe(false);
    release();
    await stop;
    expect(closed).toBe(true);
    group = undefined;
  });
  it("enforces one atomic quota across concurrent clients", async () => {
    const responses = await Promise.all(Array.from({ length: 20 }, () => consumeRateLimit("integration", "synthetic-user", 5, 60_000)));
    expect(responses.filter((result) => result.allowed)).toHaveLength(5);
    expect(responses.every((result) => result.retryAfterMs > 0 && result.retryAfterMs <= 60_000)).toBe(true);
  });
  it("retains shared HTTP quota after producer reconnect without storing the raw actor", async () => {
    const actor = "203.0.113.7";
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => enforceRateLimit("integration-psi", actor, 3, 60)));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(3);
    const rejected = results.filter((result) => result.status === "rejected") as PromiseRejectedResult[];
    for (const result of rejected) expect(result.reason).toMatchObject({ code: "RATE_LIMITED", status: 429 });
    const [, keys] = await getRedis().scan("0", "MATCH", `${config.QUEUE_PREFIX}:quota:integration-psi:*`, "COUNT", 1000);
    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toContain(actor);
    expect(keys[0]).toMatch(/:[a-f0-9]{64}:\d+$/);
    expect(await getRedis().get(keys[0])).toBe("3");
    expect(await getRedis().pttl(keys[0])).toBeGreaterThan(0);
    await closeQueues();
    await expect(enforceRateLimit("integration-psi", actor, 3, 60)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
  it("expires quota keys and isolates actor and scope counters", async () => {
    const actor = "synthetic-expiry-actor";
    const first = await consumeRateLimit("expiry", actor, 1, 150);
    expect(first.allowed).toBe(true);
    expect((await consumeRateLimit("expiry-other", actor, 1, 150)).allowed).toBe(true);
    expect((await consumeRateLimit("expiry", "another-actor", 1, 150)).allowed).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, first.retryAfterMs + 20));
    expect((await consumeRateLimit("expiry", actor, 1, 150)).allowed).toBe(true);
    const [, keys] = await getRedis().scan("0", "MATCH", `${config.QUEUE_PREFIX}:quota:expiry:*`, "COUNT", 1000);
    for (const key of keys) expect(await getRedis().pttl(key)).toBeGreaterThan(0);
  });
  it("fails producer requests within a bounded deadline when Redis is unreachable", async () => {
    await closeQueues();
    const original = config.REDIS_URL;
    config.REDIS_URL = "redis://127.0.0.1:1/15";
    try {
      const started = Date.now();
      await expect(publishJob({ id: randomUUID(), queue: "maintenance", kind: "maintenance.cleanup" })).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE", status: 503 });
      expect(Date.now() - started).toBeLessThan(4000);
    } finally {
      await closeQueues();
      config.REDIS_URL = original;
    }
  });
  it("shares the performance rate limit across worker replicas", async () => {
    const queue = await getQueue("performance");
    // Previous scenarios used a 60s limiter window. Reset only this test's
    // isolated namespace before changing its duration to one second.
    await queue.removeRateLimitKey();
    await queue.setGlobalRateLimit(1, 1000);
    const connection = createRedisConnection("worker");
    const times: number[] = [];
    const workers = [1, 2].map(() => new Worker("performance", async () => { times.push(Date.now()); }, { connection, prefix: config.QUEUE_PREFIX }));
    try {
      await Promise.all(workers.map((worker) => worker.waitUntilReady()));
      // Use the native queue to exercise this scenario's one-second test policy;
      // the application producer always restores the production minute policy.
      await Promise.all(Array.from({ length: 2 }, () => {
        const id = randomUUID();
        return queue.add("site.performance.daily", { jobId: id, correlationId: randomUUID() }, { jobId: id });
      }));
      await until(async () => times.length === 2);
      expect(times[1] - times[0]).toBeGreaterThanOrEqual(900);
    } finally {
      await Promise.all(workers.map((worker) => worker.close()));
      connection.disconnect();
    }
  });
  it("restores global limits before publishing after Redis metadata loss with workers still running", async () => {
    group = await startQueueWorkers(async () => ({ status: "succeeded" }));
    const meta = `${config.QUEUE_PREFIX}:performance:meta`;
    await getRedis().del(meta);
    expect(await getRedis().exists(meta)).toBe(0);
    await publishJob({ id: randomUUID(), queue: "performance", kind: "site.performance.daily" });
    expect(await getRedis().hmget(meta, "concurrency", "max", "duration")).toEqual([String(config.WORKER_CONCURRENCY), String(config.PSI_REQUESTS_PER_MINUTE), "60000"]);
    const maintenanceMeta = `${config.QUEUE_PREFIX}:maintenance:meta`;
    await getRedis().del(maintenanceMeta);
    await publishJob({ id: randomUUID(), queue: "maintenance", kind: "maintenance.cleanup" });
    expect(await getRedis().hget(maintenanceMeta, "concurrency")).toBe("1");
  });
  it("recovers a queued DB job after Redis loss and preserves completed ledger state across stale redelivery", async () => {
    expect(await scheduleMaintenance()).toEqual({ scheduled: 1 });
    const [job] = await fixtureSql()`SELECT id,correlation_id FROM public.background_jobs`;
    expect(await dispatchDueJobs()).toEqual({ dispatched: 1 });
    const queue = await getQueue("maintenance");
    expect(await queue.getJob(job.id)).toBeDefined();
    await queue.obliterate({ force: true });
    expect(await queue.getJob(job.id)).toBeUndefined();
    expect(await dispatchDueJobs()).toEqual({ dispatched: 1 });
    let processingError: unknown;
    group = await startQueueWorkers(async (id, options) => {
      try { return await processBackgroundJob(id, options); }
      catch (error) { processingError = error; throw error; }
    });
    await until(async () => {
      if (processingError) throw processingError;
      return (await fixtureSql()`SELECT status FROM public.background_jobs WHERE id=${job.id}`)[0].status === "succeeded";
    });
    await group.close();
    group = undefined;
    await queue.obliterate({ force: true });
    expect(await dispatchDueJobs()).toEqual({ dispatched: 0 });
    // A stale outbox delivery can still arrive after DB commit and Redis loss.
    await publishJob({ id: job.id, queue: "maintenance", kind: "maintenance.cleanup", correlationId: job.correlation_id });
    group = await startQueueWorkers(processBackgroundJob);
    await until(async () => await (await queue.getJob(job.id))?.getState() === "completed");
    const [stored] = await fixtureSql()`SELECT status,attempts FROM public.background_jobs WHERE id=${job.id}`;
    expect({ ...stored }).toEqual({ status: "succeeded", attempts: 1 });
    const [events] = await fixtureSql()`SELECT count(*) FILTER (WHERE event='started')::integer AS started,count(*) FILTER (WHERE event='succeeded')::integer AS succeeded FROM public.job_events WHERE job_id=${job.id}`;
    expect({ ...events }).toEqual({ started: 1, succeeded: 1 });
  });
  it("recovers a failed Bull delivery when the DB is temporarily unavailable before claiming", async () => {
    await scheduleMaintenance();
    const [job] = await fixtureSql()`SELECT id FROM public.background_jobs`;
    let first = true;
    group = await startQueueWorkers(async (id, options) => {
      if (!first) return processBackgroundJob(id, options);
      first = false;
      const original = process.env.DATABASE_URL;
      await closeDb();
      delete process.env.DATABASE_URL;
      try { return await processBackgroundJob(id, options); }
      finally { process.env.DATABASE_URL = original; }
    });
    await dispatchDueJobs();
    const queue = await getQueue("maintenance");
    await until(async () => await (await queue.getJob(job.id))?.getState() === "failed");
    const [pending] = await fixtureSql()`SELECT status,attempts FROM public.background_jobs WHERE id=${job.id}`;
    expect({ ...pending }).toEqual({ status: "queued", attempts: 0 });
    expect((await queue.getJob(job.id))?.failedReason).toBe("Background processing is temporarily unavailable");
    await dispatchDueJobs();
    await until(async () => (await fixtureSql()`SELECT status FROM public.background_jobs WHERE id=${job.id}`)[0].status === "succeeded");
    const [completed] = await fixtureSql()`SELECT attempts FROM public.background_jobs WHERE id=${job.id}`;
    expect(completed.attempts).toBe(1);
  });
});

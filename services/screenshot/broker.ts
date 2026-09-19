import { Queue, Worker, UnrecoverableError } from "bullmq";
import IORedis from "ioredis";
import { z } from "zod";
import type { ScreenshotConfig } from "./config";
import type { ScreenshotRepository } from "./repository";
import { checkRedisInfo, redisConnectionOptions, waitForRedis, withinRedisDeadline } from "../../src/infrastructure/queue/redis";
import { logger } from "../../src/infrastructure/logging/logger";

export class ScreenshotBroker {
  readonly producer: IORedis;
  private queue?: Queue<{ id: string }>;
  private consumer?: IORedis;
  private worker?: Worker<{ id: string }>;
  constructor(private readonly config: ScreenshotConfig) {
    this.producer = new IORedis(config.SCREENSHOT_REDIS_URL, redisConnectionOptions("producer"));
    this.producer.on("error", () => logger.warn({ event: "screenshot.redis_unavailable" }));
  }
  async getQueue() {
    await waitForRedis(this.producer);
    if (!this.queue) {
      this.queue = new Queue<{ id: string }>("captures", { connection: this.producer, prefix: this.config.SCREENSHOT_QUEUE_PREFIX,
        defaultJobOptions: { attempts: 1, removeOnComplete: { age: 86400, count: 1000 }, removeOnFail: { age: 604800, count: 1000 }, stackTraceLimit: 0 } });
      this.queue.on("error", () => logger.warn({ event: "screenshot.queue_error" }));
    }
    await withinRedisDeadline(this.queue.setGlobalConcurrency(this.config.SCREENSHOT_CONCURRENCY));
    return this.queue;
  }
  async ready() {
    await waitForRedis(this.producer);
    const [memory, persistence] = await withinRedisDeadline(Promise.all([this.producer.info("memory"), this.producer.info("persistence")]));
    if (!checkRedisInfo(memory, persistence).ready) throw new Error("Redis is not durable");
  }
  async rateLimit(clientId: string, limit: number) {
    await waitForRedis(this.producer);
    const result = await this.producer.eval(`local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('EXPIRE',KEYS[1],60) end;return n`, 1,
      `${this.config.SCREENSHOT_QUEUE_PREFIX}:rate:${clientId}`);
    return Number(result) <= limit;
  }
  async dispatch(repository: ScreenshotRepository) {
    const queue = await this.getQueue();
    for (const { id } of await repository.due()) {
      const previous = await queue.getJob(id);
      if (previous) {
        const state = await previous.getState();
        if (state !== "failed" && state !== "completed") continue;
        await previous.remove();
      }
      await queue.add("capture", { id }, { jobId: id });
    }
  }
  async start(processor: (id: string) => Promise<void>) {
    await this.getQueue();
    this.consumer = new IORedis(this.config.SCREENSHOT_REDIS_URL, redisConnectionOptions("worker"));
    this.consumer.on("error", () => logger.warn({ event: "screenshot.worker_disconnected" }));
    this.worker = new Worker<{ id: string }>("captures", async (job) => {
      if (job.name !== "capture" || !z.uuid().safeParse(job.data?.id).success || job.id !== job.data.id) throw new UnrecoverableError("Invalid capture job");
      try { await processor(job.data.id); } catch { throw new Error("Screenshot processing is temporarily unavailable"); }
    }, { connection: this.consumer, prefix: this.config.SCREENSHOT_QUEUE_PREFIX, concurrency: this.config.SCREENSHOT_CONCURRENCY, lockDuration: 30_000 });
    this.worker.on("error", () => logger.warn({ event: "screenshot.worker_error" }));
    await withinRedisDeadline(this.worker.waitUntilReady());
  }
  isRunning() { return this.consumer?.status === "ready" && this.worker?.isRunning() === true; }
  async close() {
    try { await this.worker?.close(); } finally { this.consumer?.disconnect(); }
    try { await this.queue?.close(); } finally { this.producer.disconnect(); }
  }
}

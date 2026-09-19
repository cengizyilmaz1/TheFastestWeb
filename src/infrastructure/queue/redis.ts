import { createHash } from "node:crypto";
import IORedis, { type RedisOptions } from "ioredis";
import { getEnv } from "@/config/env";
import { AppError } from "@/lib/http/errors";
import { logger } from "@/infrastructure/logging/logger";

export const REDIS_TIMEOUT_MS = 3000;
let producer: IORedis | undefined;

export function redisConnectionOptions(role: "producer" | "worker"): RedisOptions {
  return {
    maxRetriesPerRequest: role === "worker" ? null : 1,
    enableOfflineQueue: role === "worker",
    enableReadyCheck: true,
    connectTimeout: REDIS_TIMEOUT_MS,
    ...(role === "producer" ? { commandTimeout: REDIS_TIMEOUT_MS } : {}),
    retryStrategy: (attempt) => Math.min(attempt * 250, 2000),
  };
}

export function createRedisConnection(role: "producer" | "worker"): IORedis {
  const url = getEnv().REDIS_URL;
  if (!url) throw new AppError("SERVICE_UNAVAILABLE", "Background services are unavailable.", 503);
  const client = new IORedis(url, redisConnectionOptions(role));
  client.on("error", () => logger.warn({ event: "redis.connection_error", role, code: "SERVICE_UNAVAILABLE" }));
  return client;
}

export function getRedis(): IORedis {
  return producer ??= createRedisConnection("producer");
}

export async function withinRedisDeadline<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new AppError("SERVICE_UNAVAILABLE", "Background services are temporarily unavailable.", 503)), REDIS_TIMEOUT_MS);
    })]);
  } finally { clearTimeout(timer); }
}

export async function waitForRedis(client: IORedis): Promise<void> {
  if (client.status === "ready") return;
  await new Promise<void>((resolve, reject) => {
    const done = (error?: Error) => {
      clearTimeout(timer);
      client.off("ready", ready);
      client.off("error", failed);
      client.off("end", failed);
      if (error) reject(error); else resolve();
    };
    const ready = () => done();
    const failed = () => done(new AppError("SERVICE_UNAVAILABLE", "Background services are temporarily unavailable.", 503));
    const timer = setTimeout(failed, REDIS_TIMEOUT_MS);
    client.once("ready", ready);
    client.once("error", failed);
    client.once("end", failed);
    if (client.status === "ready") ready();
    else if (client.status === "end") failed();
  });
}

export async function pingRedis(): Promise<void> {
  try {
    const client = getRedis();
    await waitForRedis(client);
    if (await withinRedisDeadline(client.ping()) !== "PONG") throw new Error("Invalid ping response");
  } catch {
    throw new AppError("SERVICE_UNAVAILABLE", "Background services are temporarily unavailable.", 503);
  }
}

export type RedisHealth = { ready: true } | { ready: false; reason: "unavailable" | "eviction_policy" | "unbounded_memory" | "persistence_disabled" };
export function checkRedisInfo(memory: string, persistence: string): RedisHealth {
  const parse = (info: string) => Object.fromEntries(info.split(/\r?\n/).filter((line) => line && !line.startsWith("#")).map((line) => {
    const split = line.indexOf(":");
    return [line.slice(0, split), line.slice(split + 1)];
  }));
  const m = parse(memory), p = parse(persistence);
  if (m.maxmemory_policy !== "noeviction") return { ready: false, reason: "eviction_policy" };
  if (!(Number(m.maxmemory) > 0)) return { ready: false, reason: "unbounded_memory" };
  if (p.aof_enabled !== "1" || p.aof_last_write_status !== "ok") return { ready: false, reason: "persistence_disabled" };
  return { ready: true };
}

export async function readRedisHealth(): Promise<RedisHealth> {
  try {
    await pingRedis();
    const client = getRedis();
    const [memory, persistence] = await withinRedisDeadline(Promise.all([client.info("memory"), client.info("persistence")]));
    return checkRedisInfo(memory, persistence);
  } catch { return { ready: false, reason: "unavailable" }; }
}

// Redis TIME avoids window disagreement between web/worker replicas. One script owns
// count + expiry, so a terminated producer cannot leave an immortal quota key.
const CONSUME_QUOTA = `
local now = redis.call('TIME')
local nowMs = tonumber(now[1]) * 1000 + math.floor(tonumber(now[2]) / 1000)
local duration = tonumber(ARGV[2])
local window = math.floor(nowMs / duration)
local key = KEYS[1] .. ':' .. window
local count = tonumber(redis.call('GET', key) or '0')
local ttl = duration - (nowMs % duration)
if count >= tonumber(ARGV[1]) then return {0, ttl} end
redis.call('INCR', key)
redis.call('PEXPIRE', key, ttl + 1000)
return {1, ttl}
`;

export async function consumeRateLimit(scope: string, actor: string, limit: number, windowMs: number): Promise<{ allowed: boolean; retryAfterMs: number }> {
  if (!/^[a-z0-9-]{1,64}$/.test(scope) || !Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1 || windowMs > 86_400_000) throw new Error("Invalid rate limit configuration");
  const client = getRedis();
  await waitForRedis(client);
  const actorHash = createHash("sha256").update(actor).digest("hex");
  try {
    const result = await withinRedisDeadline(client.eval(CONSUME_QUOTA, 1, `${getEnv().QUEUE_PREFIX}:quota:${scope}:${actorHash}`, limit, windowMs)) as [number, number];
    return { allowed: result[0] === 1, retryAfterMs: result[1] };
  } catch {
    throw new AppError("SERVICE_UNAVAILABLE", "Request limits are temporarily unavailable.", 503);
  }
}

export async function closeRedis(): Promise<void> {
  const client = producer;
  producer = undefined;
  if (!client) return;
  try { if (client.status === "ready") await withinRedisDeadline(client.quit()); }
  catch { /* Force-close after a bounded drain. */ }
  finally { client.disconnect(); }
}

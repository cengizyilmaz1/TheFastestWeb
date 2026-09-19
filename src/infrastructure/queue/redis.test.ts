import { describe, expect, it } from "vitest";
import { checkRedisInfo, redisConnectionOptions } from "./redis";

describe("Redis connection policies", () => {
  it("fails producer commands promptly without an offline backlog", () => {
    expect(redisConnectionOptions("producer")).toMatchObject({ maxRetriesPerRequest: 1, enableOfflineQueue: false, commandTimeout: 3000 });
  });
  it("retains blocking worker reconnects without a command deadline", () => {
    const worker = redisConnectionOptions("worker");
    expect(worker).toMatchObject({ maxRetriesPerRequest: null, enableOfflineQueue: true });
    expect(worker.commandTimeout).toBeUndefined();
    expect(worker.keyPrefix).toBeUndefined();
  });
});

describe("durable Redis readiness", () => {
  const memory = "# Memory\r\nmaxmemory:268435456\r\nmaxmemory_policy:noeviction\r\n";
  const persistence = "# Persistence\r\naof_enabled:1\r\naof_last_write_status:ok\r\n";
  it("accepts bounded non-evicting Redis with healthy AOF", () => {
    expect(checkRedisInfo(memory, persistence)).toEqual({ ready: true });
  });
  it("rejects eviction of queue keys", () => {
    expect(checkRedisInfo(memory.replace("noeviction", "allkeys-lru"), persistence)).toMatchObject({ ready: false, reason: "eviction_policy" });
  });
  it("rejects unbounded memory", () => {
    expect(checkRedisInfo(memory.replace("268435456", "0"), persistence)).toMatchObject({ ready: false, reason: "unbounded_memory" });
  });
  it.each(["aof_enabled:0\r\n", "aof_enabled:1\r\naof_last_write_status:err\r\n"])("rejects unavailable durability %s", (state) => {
    expect(checkRedisInfo(memory, state)).toMatchObject({ ready: false, reason: "persistence_disabled" });
  });
});

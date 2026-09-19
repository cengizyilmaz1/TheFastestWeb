import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ScreenshotRepository } from "../../services/screenshot/repository";
import { ScreenshotBroker } from "../../services/screenshot/broker";
import { createCaptureProcessor, cleanExpiredCaptures, type ScreenshotStorage } from "../../services/screenshot/processor";
import { prepareCapture, hash, type CaptureResult } from "../../services/screenshot/contracts";
import { screenshotConfig } from "../screenshot/fixtures";

let owner: ReturnType<typeof postgres>, control: ReturnType<typeof postgres>, databaseName: string, role: string;
let repository: ScreenshotRepository, broker: ScreenshotBroker;
let config: ReturnType<typeof screenshotConfig>;
const request = prepareCapture({ url: "https://example.com" });
const images = { original: Buffer.from("fixture-jpeg"), optimized: Buffer.from("fixture-webp"), width: 1440, height: 900, finalUrl: request.url, title: "Fixture" };
const storage: ScreenshotStorage = { put: vi.fn(async (input) => ({ objectKey: input.objectKey, publicUrl: input.visibility === "public" ? `https://media.example.com/${input.objectKey}` : null,
  contentType: input.contentType, size: input.bytes.length, hash: hash(input.bytes), visibility: input.visibility ?? "private" })), remove: vi.fn(async () => undefined) };
const fixtureResult: CaptureResult = { original: { objectKey: "test/original.jpg", contentType: "image/jpeg", width: 1440, height: 900, size: 12, hash: hash("jpeg") },
  optimized: { objectKey: "test/optimized.webp", contentType: "image/webp", width: 1440, height: 900, size: 12, hash: hash("webp") },
  title: "Fixture", finalUrl: request.url, capturedAt: new Date().toISOString(), retentionUntil: new Date(Date.now() + 86400_000).toISOString() };

beforeAll(async () => {
  const raw = process.env.MIGRATION_TEST_DATABASE_URL, redis = process.env.REDIS_TEST_URL;
  if (!raw || !redis) throw new Error("Disposable PostgreSQL and Redis fixtures required");
  const url = new URL(raw), redisUrl = new URL(redis);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !url.pathname.startsWith('/tfw_test_') ||
      !['localhost', '127.0.0.1', '[::1]'].includes(redisUrl.hostname)) throw new Error("Refusing non-test database");
  const suffix = randomBytes(6).toString('hex'); databaseName = `tfw_test_screenshot_${suffix}`; role = `tfw_screenshot_${suffix}`;
  control = postgres(raw, { max: 1, onnotice: () => undefined });
  await control`CREATE DATABASE ${control(databaseName)}`;
  url.pathname = `/${databaseName}`; owner = postgres(url.toString(), { max: 1, onnotice: () => undefined });
  await owner.unsafe(await readFile("services/screenshot/migrations/0001_capture_ledger.sql", "utf8"));
  await control`CREATE ROLE ${control(role)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`;
  await owner`GRANT USAGE ON SCHEMA public TO ${owner(role)}`;
  await owner`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${owner(role)}`;
  url.username = role; url.password = '';
  config = screenshotConfig({ SCREENSHOT_DATABASE_URL: url.toString(), SCREENSHOT_REDIS_URL: redis, SCREENSHOT_QUEUE_PREFIX: `screenshot-test-${suffix}` });
  repository = new ScreenshotRepository(config); broker = new ScreenshotBroker(config);
  await Promise.all([repository.ready(), broker.ready()]);
}, 30_000);
beforeEach(async () => { await owner`TRUNCATE screenshot_idempotency,screenshot_objects,screenshot_captures,screenshot_quotas`; vi.clearAllMocks(); });
afterAll(async () => {
  if (broker) { const queue = await broker.getQueue(); await queue.obliterate({ force: true }); await broker.close(); }
  await repository?.close(); await owner?.end({ timeout: 5 });
  if (control && databaseName) await control`DROP DATABASE ${control(databaseName)} WITH (FORCE)`;
  if (control && role) await control`DROP ROLE ${control(role)}`;
  await control?.end({ timeout: 5 });
});

describe("durable central screenshot jobs", () => {
  it("uses a least-privilege runtime role and rejects the schema owner", async () => {
    const elevated = new ScreenshotRepository({ ...config, SCREENSHOT_DATABASE_URL: (() => { const u = new URL(process.env.MIGRATION_TEST_DATABASE_URL!); u.pathname = `/${databaseName}`; return u.toString(); })() });
    try { await expect(elevated.ready()).rejects.toThrow("DATABASE_ROLE_UNSAFE"); } finally { await elevated.close(); }
  });
  it("atomically deduplicates concurrent cache requests without charging multiple captures", async () => {
    const receipts = await Promise.all(Array.from({ length: 12 }, () => repository.create(config.clients[0], request, randomUUID())));
    expect(new Set(receipts.map((receipt) => receipt.id)).size).toBe(1);
    const [quota] = await owner`SELECT used FROM screenshot_quotas`; expect(quota.used).toBe(1);
    const other = await repository.create(config.clients[1], request, randomUUID());
    expect(other.id).not.toBe(receipts[0].id); expect(await repository.find(config.clients[1].id, receipts[0].id)).toBeNull();
  });
  it("keeps idempotency receipts and detects conflicting request reuse", async () => {
    const key = randomUUID(), receipt = await repository.create(config.clients[0], request, key);
    expect((await repository.create(config.clients[0], request, key)).id).toBe(receipt.id);
    await expect(repository.create(config.clients[0], prepareCapture({ url: "https://example.org" }), key)).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  });
  it("enforces the durable per-client daily quota under concurrency", async () => {
    const client = { ...config.clients[0], requestsPerDay: 2 };
    const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => repository.create(client, prepareCapture({ url: `https://example.com/${i}` }), randomUUID())));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(2);
    const [quota] = await owner`SELECT used FROM screenshot_quotas`; expect(quota.used).toBe(2);
  });
  it("fences stale workers and recovers expired leases", async () => {
    const receipt = await repository.create(config.clients[0], request, randomUUID());
    const first = (await repository.claim(receipt.id))!;
    expect(await repository.claim(receipt.id)).toBeNull();
    await owner`UPDATE screenshot_captures SET lease_until=now()-interval '1 second' WHERE id=${receipt.id}`;
    const second = (await repository.claim(receipt.id))!;
    expect(second.lease_token).not.toBe(first.lease_token);
    expect(await repository.complete(first, fixtureResult)).toBe(false);
    expect(await repository.complete(second, fixtureResult)).toBe(true);
    expect(await repository.claim(receipt.id)).toBeNull();
  });
  it("stores only namespaced private artifacts and removes expired metadata after deleting objects", async () => {
    const receipt = await repository.create(config.clients[1], request, randomUUID());
    await createCaptureProcessor(config, repository, async () => images, storage)(receipt.id);
    const ready = repository.present((await repository.find(config.clients[1].id, receipt.id))!);
    expect(ready.status).toBe("ready"); expect(ready.result?.optimized.publicUrl).toBeUndefined();
    expect(ready.result?.optimized.objectKey).toMatch(/^indietools\/sites\/screenshots\/desktop\//);
    await owner`UPDATE screenshot_captures SET expires_at=now()-interval '1 second' WHERE id=${receipt.id}`;
    await cleanExpiredCaptures(repository, storage);
    expect(storage.remove).toHaveBeenCalledTimes(2);
    expect((await repository.find(config.clients[1].id, receipt.id))?.status).toBe("expired");
    const objects = await owner`SELECT * FROM screenshot_objects`; expect(objects).toHaveLength(0);
  });
  it("retains deletion failures for retry and reclaims crashed partial uploads", async () => {
    const receipt = await repository.create(config.clients[0], request, randomUUID());
    const claimed = (await repository.claim(receipt.id))!;
    await repository.stageObjects(claimed, ["thefastestweb/orphan.jpg"]);
    await owner`UPDATE screenshot_objects SET created_at=now()-interval '11 minutes'`;
    await owner`UPDATE screenshot_captures SET lease_until=now()-interval '1 second',expires_at=now()-interval '1 second' WHERE id=${receipt.id}`;
    const failedStorage = { ...storage, remove: vi.fn(async () => { throw new Error("Synthetic outage"); }) };
    await expect(cleanExpiredCaptures(repository, failedStorage)).rejects.toThrow();
    expect(await repository.objectsToDelete()).toHaveLength(1);
    await cleanExpiredCaptures(repository, storage);
    expect((await repository.find(config.clients[0].id, receipt.id))?.status).toBe("expired");
  });
  it("rejects corrupted persisted requests before rendering or provider writes", async () => {
    const receipt = await repository.create(config.clients[0], request, randomUUID());
    await owner`UPDATE screenshot_captures SET request='{"url":"http://127.0.0.1"}'::jsonb WHERE id=${receipt.id}`;
    const capture = vi.fn(async () => images);
    await createCaptureProcessor(config, repository, capture, storage)(receipt.id);
    expect(capture).not.toHaveBeenCalled(); expect(storage.put).not.toHaveBeenCalled();
    expect((await repository.find(config.clients[0].id, receipt.id))?.error_code).toBe("INVALID_REQUEST");
  });
  it("recovers lost Redis deliveries and never recaptures a terminal DB result", async () => {
    const receipt = await repository.create(config.clients[0], request, randomUUID());
    await broker.dispatch(repository);
    const queue = await broker.getQueue(); await (await queue.getJob(receipt.id))!.remove();
    await broker.dispatch(repository); expect(await queue.getJob(receipt.id)).toBeDefined();
    const capture = vi.fn(async () => images);
    await broker.start(createCaptureProcessor(config, repository, capture, storage));
    await vi.waitFor(async () => expect((await repository.find(config.clients[0].id, receipt.id))?.status).toBe("ready"), { timeout: 5000, interval: 50 });
    await broker.dispatch(repository);
    await createCaptureProcessor(config, repository, capture, storage)(receipt.id);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(await repository.due()).toHaveLength(0);
  });
});

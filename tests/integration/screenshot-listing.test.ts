import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupIntegrationDatabase, fixtureSql, prepareIntegrationDatabase, resetIntegrationData } from "./database";
const mocks = vi.hoisted(() => ({ request: vi.fn(), poll: vi.fn() }));
vi.mock("@/infrastructure/screenshots/client", () => ({ requestScreenshot: mocks.request, getScreenshot: mocks.poll }));
vi.mock("@/config/env", async (original) => {
  const actual = await original<typeof import("@/config/env")>();
  return { ...actual, getEnv: () => ({ ...actual.getEnv(), SCREENSHOTS_ENABLED: true, SCREENSHOT_CLIENT_ID: "thefastestweb", R2_PUBLIC_BASE_URL: "https://media.example.com" }) };
});
import { scheduleScreenshot } from "@/modules/screenshots/service";
import { processBackgroundJob } from "@/modules/jobs/service";

beforeAll(prepareIntegrationDatabase, 30_000);
afterAll(cleanupIntegrationDatabase);
beforeEach(async () => { await resetIntegrationData(); mocks.request.mockReset(); mocks.poll.mockReset(); });
async function listing(lifecycle = "active", isListed = true, url = "https://example.com/") {
  const owner = randomUUID(), id = randomUUID();
  await fixtureSql()`INSERT INTO users(id,email,name,is_pro) VALUES(${owner},${`${owner}@example.invalid`},'Synthetic owner',true)`;
  await fixtureSql()`INSERT INTO sites(id,slug,name,url,normalized_url,description,owner_id,owner_name,is_listed,lifecycle)
    VALUES(${id},${`fixture-${id}`},'Synthetic site',${url},${url},'Synthetic site description',${owner},'Synthetic owner',${isListed},${lifecycle})`;
  return { owner, id };
}
function ready(serviceId: string) {
  const key = `thefastestweb/sites/screenshots/desktop/${serviceId}/artifact.webp`;
  const image = { objectKey: key, publicUrl: `https://media.example.com/${key}`, width: 1440, height: 900, contentType: "image/webp", size: 200, hash: "a".repeat(64) };
  return { id: serviceId, status: "ready", result: { optimized: image, original: { ...image, contentType: "image/jpeg" }, finalUrl: "https://example.com/", title: "Example",
    capturedAt: new Date(Date.now() - 1000).toISOString(), retentionUntil: new Date(Date.now() + 86400_000).toISOString() } };
}
describe("published website screenshot history", () => {
  it("requires ownership and a public approved listing before requesting captures", async () => {
    const privateSite = await listing("active", false);
    await expect(scheduleScreenshot(privateSite.id, privateSite.owner)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const pending = await listing("pending", true, "https://example.org/");
    await expect(scheduleScreenshot(pending.id, pending.owner)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(scheduleScreenshot(pending.id, randomUUID())).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it.each(["active", "verified"])("persists %s listing receipts across polling, refunds waiting attempts and stores one verified image", async (lifecycle) => {
    const site = await listing(lifecycle), receipt = randomUUID();
    const job = await scheduleScreenshot(site.id, site.owner);
    expect((await scheduleScreenshot(site.id, site.owner)).id).toBe(job.id);
    mocks.request.mockResolvedValue({ id: receipt, status: "pending" });
    expect(await processBackgroundJob(job.id)).toEqual({ status: "deferred" });
    const [waiting] = await fixtureSql()`SELECT attempts,result,status FROM background_jobs WHERE id=${job.id}`;
    expect(waiting).toMatchObject({ attempts: 0, status: "pending", result: { serviceJobId: receipt } });
    expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({ url: "https://example.com/", visibility: "public" }), job.id);
    await fixtureSql()`UPDATE background_jobs SET available_at=now() WHERE id=${job.id}`;
    mocks.poll.mockResolvedValue(ready(receipt));
    expect(await processBackgroundJob(job.id)).toEqual({ status: "succeeded" });
    expect(await processBackgroundJob(job.id)).toEqual({ status: "skipped" });
    expect(mocks.request).toHaveBeenCalledTimes(1); expect(mocks.poll).toHaveBeenCalledWith(receipt);
    const records = await fixtureSql()`SELECT * FROM site_screenshots WHERE site_id=${site.id}`;
    expect(records).toHaveLength(1); expect(records[0]).toMatchObject({ service_job_id: receipt, background_job_id: job.id, source_url: "https://example.com/", status: "ready" });
  });
  it("refuses changed sources and cross-origin final pages without saving a false result", async () => {
    const site = await listing(), job = await scheduleScreenshot(site.id, site.owner);
    const result = ready(randomUUID()); result.result.finalUrl = "https://other.example/";
    mocks.request.mockResolvedValue(result);
    expect(await processBackgroundJob(job.id)).toEqual({ status: "failed" });
    expect(await fixtureSql()`SELECT * FROM site_screenshots`).toHaveLength(0);
    const next = await scheduleScreenshot(site.id, site.owner, { device: "mobile" });
    await fixtureSql()`UPDATE sites SET url='https://changed.example/',normalized_url='https://changed.example/' WHERE id=${site.id}`;
    expect(await processBackgroundJob(next.id)).toEqual({ status: "failed" });
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
});

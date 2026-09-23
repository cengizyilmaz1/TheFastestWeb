import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { backfillInitialScreenshots, enqueueExpiringScreenshots, previewInitialScreenshots } from "@/modules/screenshots/initial";
import { getDb } from "@/db";
import { cleanupIntegrationDatabase, fixtureSql, prepareIntegrationDatabase, resetIntegrationData } from "./database";

const feature = vi.hoisted(() => ({ enabled: true }));
vi.mock("@/config/env", () => ({ getEnv: () => ({ SCREENSHOTS_ENABLED: feature.enabled, JOB_MAX_ATTEMPTS: 3 }) }));
beforeAll(prepareIntegrationDatabase, 60_000);
afterAll(cleanupIntegrationDatabase, 30_000);
beforeEach(async () => { feature.enabled = true; await resetIntegrationData(); });

async function site() {
  const id = randomUUID(), url = `https://example.com/${id}`;
  await fixtureSql()`INSERT INTO sites(id,slug,name,url,normalized_url,description,owner_name,is_listed,lifecycle)
    VALUES(${id},${id},'Synthetic',${url},${url},'Synthetic','Synthetic',true,'active')`;
  return id;
}

async function image(siteId: string, hoursRemaining: number) {
  await fixtureSql()`INSERT INTO site_screenshots(site_id,service_job_id,device,mode,object_key,public_url,width,height,content_type,size,hash,captured_at,retention_until,source_url)
    VALUES(${siteId},${randomUUID()},'desktop','viewport',${`thefastestweb/${siteId}.webp`},${`https://media.example.com/${siteId}.webp`},1440,900,'image/webp',10,${'a'.repeat(64)},
      now()-interval '29 days',now()+(${hoursRemaining}*interval '1 hour'),${`https://example.com/${siteId}`})`;
}

async function renew() {
  const [clock] = await fixtureSql()`SELECT to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD') AS day`;
  return getDb()!.transaction((tx) => enqueueExpiringScreenshots(tx, clock.day));
}

describe("initial screenshot backfill", () => {
  it("previews without mutations and skips private, archived, ready, in-flight and already-attempted captures", async () => {
    const needed = await site(), privateId = await site(), archived = await site(), ready = await site(), active = await site(), attempted = await site();
    await fixtureSql()`UPDATE sites SET is_listed=false WHERE id=${privateId}`;
    await fixtureSql()`UPDATE sites SET archived_at=now() WHERE id=${archived}`;
    await fixtureSql()`INSERT INTO site_screenshots(site_id,service_job_id,device,mode,object_key,public_url,width,height,content_type,size,hash,captured_at,retention_until,source_url)
      VALUES(${ready},${randomUUID()},'desktop','viewport','thefastestweb/fixture.webp','https://media.example.com/fixture.webp',1440,900,'image/webp',10,${'a'.repeat(64)},now(),now()+interval '1 day',${`https://example.com/${ready}`})`;
    await fixtureSql()`INSERT INTO background_jobs(site_id,queue,kind,job_key,payload,status) VALUES
      (${active},'screenshots','site.screenshot.capture',${`manual:${active}`},'{}','pending'),
      (${attempted},'screenshots','site.screenshot.capture',${`screenshot:${attempted}:initial`},'{}','failed')`;
    expect(await previewInitialScreenshots()).toMatchObject({ enabled: true, eligible: 1, batchLimit: 25 });
    expect(await fixtureSql()`SELECT id FROM background_jobs WHERE site_id=${needed}`).toHaveLength(0);
    expect(await backfillInitialScreenshots(25)).toEqual({ scheduled: 1, skippedInvalid: 0, batchLimit: 25, spacingSeconds: 10 });
    const [job] = await fixtureSql()`SELECT id,payload,status FROM background_jobs WHERE site_id=${needed}`;
    expect(job).toMatchObject({ status: 'pending', payload: { siteId: needed, sourceUrl: `https://example.com/${needed}`, device: 'desktop', mode: 'viewport', history: 'daily' } });
    expect(await fixtureSql()`SELECT actor,event FROM job_events WHERE job_id=${job.id}`).toEqual([{ actor: 'operator', event: 'scheduled' }]);
    expect(await backfillInitialScreenshots(25)).toMatchObject({ scheduled: 0 });
  });

  it("serializes concurrent batches and spaces all deliveries without duplicate jobs", async () => {
    const ids = await Promise.all(Array.from({ length: 5 }, site));
    const results = await Promise.all([backfillInitialScreenshots(3), backfillInitialScreenshots(3)]);
    expect(results.reduce((sum, row) => sum + row.scheduled, 0)).toBe(5);
    const jobs = await fixtureSql()`SELECT site_id,available_at FROM background_jobs ORDER BY available_at`;
    expect(new Set(jobs.map(row => row.site_id))).toEqual(new Set(ids));
    for (let index = 1; index < jobs.length; index++) {
      expect(jobs[index].available_at.getTime() - jobs[index - 1].available_at.getTime()).toBeGreaterThanOrEqual(10_000);
    }
    expect(await previewInitialScreenshots()).toMatchObject({ eligible: 0 });
  });

  it("includes verified public sites in the same idempotent initial capture path", async () => {
    const verified = await site();
    await fixtureSql()`UPDATE sites SET lifecycle='verified' WHERE id=${verified}`;
    expect(await backfillInitialScreenshots(25)).toMatchObject({ scheduled: 1 });
    expect(await fixtureSql()`SELECT site_id FROM background_jobs WHERE queue='screenshots'`).toEqual([{ site_id: verified }]);
  });

  it("requires the feature and an explicit bounded batch size", async () => {
    await site();
    for (const limit of [0, 26, 1.5, NaN]) await expect(backfillInitialScreenshots(limit)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    feature.enabled = false;
    await expect(backfillInitialScreenshots(1)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    expect(await fixtureSql()`SELECT id FROM background_jobs`).toHaveLength(0);
  });
});

describe("public screenshot renewal", () => {
  it("renews only established public previews within 24 hours of expiry, including overdue and verified listings", async () => {
    const expiring = await site(), overdue = await site(), verified = await site(), fresh = await site(), empty = await site();
    const privateId = await site(), archived = await site(), pending = await site(), active = await site();
    for (const id of [expiring, verified, privateId, archived, pending, active]) await image(id, 12);
    await image(overdue, -1); await image(fresh, 25);
    await fixtureSql()`UPDATE sites SET lifecycle='verified' WHERE id=${verified}`;
    await fixtureSql()`UPDATE sites SET is_listed=false WHERE id=${privateId}`;
    await fixtureSql()`UPDATE sites SET archived_at=now() WHERE id=${archived}`;
    await fixtureSql()`UPDATE sites SET lifecycle='pending' WHERE id=${pending}`;
    await fixtureSql()`INSERT INTO background_jobs(site_id,queue,kind,job_key,payload,status)
      VALUES(${active},'screenshots','site.screenshot.capture',${`manual:${active}`},'{}','pending')`;
    expect(await renew()).toBe(3);
    const jobs = await fixtureSql()`SELECT site_id,job_key,payload FROM background_jobs WHERE job_key LIKE '%:refresh:%'`;
    expect(new Set(jobs.map(row => row.site_id))).toEqual(new Set([expiring, overdue, verified]));
    expect(jobs.every(row => row.payload.history === 'daily' && row.payload.device === 'desktop')).toBe(true);
    expect(await fixtureSql()`SELECT id FROM background_jobs WHERE site_id=${empty}`).toHaveLength(0);
    expect(await renew()).toBe(0);
    await fixtureSql()`UPDATE background_jobs SET status='failed' WHERE job_key LIKE '%:refresh:%'`;
    expect(await renew()).toBe(0);
    await fixtureSql()`UPDATE background_jobs SET job_key=job_key||':previous-day' WHERE job_key LIKE '%:refresh:%'`;
    expect(await renew()).toBe(3);
  });

  it("bounds each scheduler tick to 25 and shares spacing with concurrent operator batches", async () => {
    for (let index = 0; index < 26; index++) await image(await site(), 1);
    const initial = await site();
    expect(await renew()).toBe(25);
    expect(await backfillInitialScreenshots(1)).toMatchObject({ scheduled: 1 });
    expect(await renew()).toBe(1);
    expect(await renew()).toBe(0);
    const jobs = await fixtureSql()`SELECT site_id,available_at FROM background_jobs ORDER BY available_at`;
    expect(jobs).toHaveLength(27);
    expect(jobs.some(row => row.site_id === initial)).toBe(true);
    for (let index = 1; index < jobs.length; index++) {
      expect(jobs[index].available_at.getTime() - jobs[index - 1].available_at.getTime()).toBeGreaterThanOrEqual(10_000);
    }
  });

  it("does not generate renewals when screenshots are disabled", async () => {
    await image(await site(), 1); feature.enabled = false;
    expect(await renew()).toBe(0);
    expect(await fixtureSql()`SELECT id FROM background_jobs`).toHaveLength(0);
  });

  it("refreshes changed sources despite old fresh media and rotates past equivalent legacy URLs without recapturing them", async () => {
    for (let index = 0; index < 105; index++) {
      const unchanged = await site(); await image(unchanged, 720);
      const canonical = `https://${unchanged}.example.com/`;
      const legacy = index % 2 ? canonical.slice(0, -1) : `${canonical}?utm_source=directory#preview`;
      await fixtureSql()`UPDATE sites SET url=${legacy} WHERE id=${unchanged}`;
      await fixtureSql()`UPDATE site_screenshots SET source_url=${canonical} WHERE site_id=${unchanged}`;
    }
    const changed = await site(); await image(changed, 720);
    const currentUrl = `https://example.org/${changed}`;
    await fixtureSql()`UPDATE sites SET url=${currentUrl} WHERE id=${changed}`;
    const scheduled = await renew() + await renew();
    expect(scheduled).toBe(1);
    const [job] = await fixtureSql()`SELECT site_id,payload FROM background_jobs WHERE queue='screenshots'`;
    expect(job).toMatchObject({ site_id: changed, payload: { sourceUrl: currentUrl } });
    expect(await renew()).toBe(0);
  });
});

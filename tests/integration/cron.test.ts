import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { PSIResult } from "@/lib/pagespeed";
import { AppError } from "@/lib/http/errors";
import { cleanupIntegrationDatabase, fixtureSql, prepareIntegrationDatabase, resetIntegrationData } from "./database";

const mocks = vi.hoisted(() => ({ psi: vi.fn(), screenshot: vi.fn(), publish: vi.fn(), auth: vi.fn(), limit: vi.fn(), secret: "synthetic-cron-secret-for-local-integration-tests" }));
vi.mock("@/lib/pagespeed", () => ({ runPageSpeedTest: mocks.psi, METHODOLOGY_VERSION: "psi-v1-single-mobile" }));
vi.mock("@/infrastructure/queue/queues", () => ({ publishJob: mocks.publish }));
vi.mock("@/modules/security/rate-limit", () => ({ enforceRateLimit: mocks.limit }));
vi.mock("@/modules/screenshots/service", () => ({ processSiteScreenshotJob: mocks.screenshot }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/config/env", () => ({ getEnv: () => ({ CRON_SECRET: mocks.secret, JOB_MAX_ATTEMPTS: 3, SITE_URL: "https://example.com", NODE_ENV: "test" }) }));
import { GET } from "@/app/api/cron/retest/route";
import { POST } from "@/app/api/sites/[slug]/retest/route";
import { GET as readJob } from "@/app/api/jobs/[id]/route";
import { scheduleDailyRetests, scheduleMaintenance, scheduleManualRetest, processBackgroundJob, dispatchDueJobs, operateJob } from "@/modules/jobs/service";
import { ProviderQuotaError } from "@/modules/jobs/provider-budget";
import { startSchedulerLoop } from "@/infrastructure/queue/scheduler-loop";

const measurement: PSIResult = {
  lighthouseVersion: "13.0.0", score: 94, loadTimeMs: 1210, fcpMs: 740, lcpMs: 1210, cls: 0.02,
  tbtMs: 10, ttiMs: null, siMs: 1020, fcpScore: 0.99, lcpScore: 0.98, clsScore: 0.99,
  tbtScore: 0.99, ttiScore: null, siScore: 0.99,
  fcp: "0.7 s", lcp: "1.2 s", clsDisplay: "0.02", tbt: "10 ms", tti: "Unavailable", si: "1.0 s", loadTime: "1.2 s", rawResponse: {},
};
const request = () => new NextRequest("https://example.com/api/cron/retest", { headers: { authorization: `Bearer ${mocks.secret}` } });

async function fixture() {
  const owner = randomUUID(), first = randomUUID(), second = randomUUID();
  await fixtureSql()`INSERT INTO public.users (id,email,name) VALUES (${owner},'cron-fixture@example.invalid','Synthetic owner')`;
  await fixtureSql()`INSERT INTO public.sites (id,slug,name,url,normalized_url,description,owner_id,owner_name,is_listed,current_score,last_tested_at,lifecycle)
    VALUES (${first},'first','First fixture','https://example.com/','https://example.com/','Fixture',${owner},'Synthetic owner',true,88,now()-interval '3 days','active'),
           (${second},'second','Second fixture','https://example.org/','https://example.org/','Fixture',${owner},'Synthetic owner',true,91,now()-interval '2 days','active')`;
  await fixtureSql()`INSERT INTO public.speed_tests (site_id,score,lcp_ms) VALUES (${first},88,1400),(${second},91,1300)`;
  return { first, second, owner };
}
async function jobFor(siteId: string) {
  const [row] = await fixtureSql()`SELECT * FROM background_jobs WHERE site_id=${siteId} AND payload->>'strategy'='mobile'`;
  return row;
}
async function makeDue(id: string) { await fixtureSql()`UPDATE background_jobs SET available_at=now()-interval '1 second' WHERE id=${id}`; }
async function history(siteId: string) { return fixtureSql()`SELECT * FROM speed_tests WHERE site_id=${siteId} ORDER BY tested_at,id`; }
function holdMeasurement() {
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>((resolve) => { enter = resolve; });
  const value = new Promise<PSIResult>((resolve) => { release = () => resolve(measurement); });
  mocks.psi.mockImplementationOnce(() => { enter(); return value; });
  return { entered, release };
}

beforeAll(prepareIntegrationDatabase, 60_000);
afterAll(cleanupIntegrationDatabase, 30_000);
beforeEach(async () => {
  await resetIntegrationData();
  mocks.psi.mockReset().mockResolvedValue(measurement);
  mocks.publish.mockReset().mockResolvedValue(undefined);
  mocks.auth.mockReset().mockResolvedValue(null);
  mocks.limit.mockReset().mockResolvedValue(undefined);
  mocks.screenshot.mockReset().mockResolvedValue({ status: "pending",delayMs: 15_000 });
});

describe("durable retesting with real PostgreSQL transactions", () => {
  it("dispatches a persisted manual job with recurring generation disabled",async()=>{
    const {first,owner}=await fixture();const job=await scheduleManualRetest(first,owner);
    const loop=startSchedulerLoop({scheduleDailyRetests,scheduleMaintenance,dispatchDueJobs},1000,{generate:false});
    try {await vi.waitFor(()=>expect(mocks.publish).toHaveBeenCalledTimes(1));}
    finally {await loop.close();}
    expect((await fixtureSql()`SELECT kind FROM background_jobs`).map(row=>row.kind)).toEqual(["site.performance.manual"]);
    expect(mocks.psi).not.toHaveBeenCalled();
    expect((await processBackgroundJob(job.id)).status).toBe("succeeded");expect(mocks.psi).toHaveBeenCalledTimes(2);
  });
  it("rejects unauthorized cron and returns202 without measuring inside HTTP", async () => {
    await fixture();
    expect((await GET(new NextRequest("https://example.com/api/cron/retest"), undefined)).status).toBe(401);
    const response = await GET(request(), undefined);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ status: "accepted", scheduled: 4, maintenance: 1 });
    expect(mocks.psi).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it("deduplicates concurrent scheduler replicas and manual triggers by UTCday", async () => {
    const { first, owner } = await fixture();
    const outcomes = await Promise.all(Array.from({ length: 8 }, () => scheduleDailyRetests()));
    expect(outcomes.reduce((sum, result) => sum + result.scheduled, 0)).toBe(4);
    expect((await scheduleManualRetest(first, owner)).id).toBe((await jobFor(first)).id);
    await Promise.all(Array.from({ length: 5 }, () => scheduleMaintenance()));
    const [row] = await fixtureSql()`SELECT count(*)::integer AS total FROM background_jobs`;
    expect(row.total).toBe(5);
  });
  it("does not schedule private, paused or already measured sites", async () => {
    const { first, second } = await fixture();
    await fixtureSql()`UPDATE sites SET is_listed=false WHERE id=${first}`;
    await fixtureSql()`UPDATE sites SET monitoring_paused=true WHERE id=${second}`;
    expect(await scheduleDailyRetests()).toEqual({ scheduled: 0 });
    await fixtureSql()`UPDATE sites SET is_listed=true,monitoring_paused=false,last_tested_at=now()`;
    await fixtureSql()`INSERT INTO speed_tests(site_id,score,lcp_ms,cls,tbt_ms,strategy,methodology_version,sample_count)
      SELECT s.id,90,1000,0.1,20,d.strategy::public.strategy,'psi-v2-two-sample',2
      FROM sites s CROSS JOIN (VALUES ('mobile'),('desktop')) d(strategy)`;
    expect(await scheduleDailyRetests()).toEqual({ scheduled: 0 });
  });
  it("leases concurrent deliveries and commits a single history row atomically", async () => {
    const { first } = await fixture();
    await scheduleDailyRetests();
    const job = await jobFor(first), hold = holdMeasurement();
    const active = processBackgroundJob(job.id);
    await hold.entered;
    try {
      expect(await processBackgroundJob(job.id)).toEqual({ status: "skipped" });
      expect(mocks.psi).toHaveBeenCalledTimes(2);
    } finally { hold.release(); }
    expect(await active).toEqual({ status: "succeeded" });
    expect(await processBackgroundJob(job.id)).toEqual({ status: "skipped" });
    expect(await history(first)).toHaveLength(2);
    expect((await jobFor(first)).status).toBe("succeeded");
    const [site] = await fixtureSql()`SELECT current_score,current_tti FROM sites WHERE id=${first}`;
    expect({ ...site }).toEqual({ current_score: 94, current_tti: "Unavailable" });
  });
  it("preserves failure metrics, retries with backoff and lets other sites progress", async () => {
    const { first, second } = await fixture();
    const before = await history(first);
    await scheduleDailyRetests();
    const job = await jobFor(first);
    mocks.psi.mockRejectedValueOnce(new AppError("UPSTREAM_UNAVAILABLE", "Safe provider failure", 502));
    expect(await processBackgroundJob(job.id)).toEqual({ status: "retry" });
    expect(await history(first)).toEqual(before);
    expect((await jobFor(first)).available_at.getTime()).toBeGreaterThan(Date.now());
    expect(await processBackgroundJob((await jobFor(second)).id)).toEqual({ status: "succeeded" });
    await makeDue(job.id);
    expect(await processBackgroundJob(job.id)).toEqual({ status: "succeeded" });
    expect(await history(first)).toHaveLength(2);
  });
  it("dead-letters bounded failures, redacts details and records operator retry", async () => {
    const { first } = await fixture();
    await scheduleDailyRetests();
    const job = await jobFor(first);
    mocks.psi.mockRejectedValue(new Error("secret-credential-from-provider"));
    for (let i = 0; i < 3; i++) { await makeDue(job.id); await processBackgroundJob(job.id); }
    const failed = await jobFor(first);
    expect(failed.status).toBe("failed");
    expect(failed.attempts).toBe(3);
    expect(JSON.stringify(failed)).not.toContain("secret-credential");
    await operateJob(job.id, "retry");
    mocks.psi.mockResolvedValue(measurement);
    expect(await processBackgroundJob(job.id)).toEqual({ status: "succeeded" });
    const events = await fixtureSql()`SELECT event,actor FROM job_events WHERE job_id=${job.id} AND event='operator_retry'`;
    expect(events).toHaveLength(1);
    expect(events[0].actor).toBe("operator");
    await expect(operateJob(job.id, "retry")).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("defers quota exhaustion without consuming retry attempts", async () => {
    const { first } = await fixture();
    await scheduleDailyRetests();
    const job = await jobFor(first);
    mocks.psi.mockRejectedValueOnce(new ProviderQuotaError(120_000));
    expect(await processBackgroundJob(job.id)).toEqual({ status: "retry" });
    const deferred = await jobFor(first);
    expect(deferred.attempts).toBe(0);
    expect(deferred.available_at.getTime()).toBeGreaterThan(Date.now() + 110_000);
    expect(await history(first)).toHaveLength(1);
  });
  it("cancels in-flight work and fences the eventual provider response", async () => {
    const { first } = await fixture();
    await scheduleDailyRetests();
    const job = await jobFor(first), hold = holdMeasurement();
    const active = processBackgroundJob(job.id);
    await hold.entered;
    try { await operateJob(job.id, "cancel"); } finally { hold.release(); }
    expect(await active).toEqual({ status: "deferred" });
    expect(await history(first)).toHaveLength(1);
    expect((await jobFor(first)).status).toBe("cancelled");
    await operateJob(job.id, "retry");
    expect(await processBackgroundJob(job.id)).toEqual({ status: "succeeded" });
    expect(await history(first)).toHaveLength(2);
  });
  it("recovers an expired lease and rejects an obsolete worker commit", async () => {
    const { first } = await fixture();
    await scheduleDailyRetests();
    const job = await jobFor(first), hold = holdMeasurement();
    const stale = processBackgroundJob(job.id);
    await hold.entered;
    try {
      await fixtureSql()`UPDATE background_jobs SET leased_until=now()-interval '1 second' WHERE id=${job.id}`;
      expect(await processBackgroundJob(job.id)).toEqual({ status: "succeeded" });
    } finally { hold.release(); }
    expect(await stale).toEqual({ status: "deferred" });
    expect(await history(first)).toHaveLength(2);
  });
  it("skips yesterday's backlog without creating fictitious old measurements", async () => {
    const { first } = await fixture();
    await scheduleDailyRetests();
    const job = await jobFor(first);
    await fixtureSql()`UPDATE background_jobs SET payload=jsonb_set(payload,'{day}',to_jsonb(to_char((now() AT TIME ZONE 'UTC')-interval '1 day','YYYY-MM-DD'))) WHERE id=${job.id}`;
    expect(await processBackgroundJob(job.id)).toEqual({ status: "skipped" });
    expect(mocks.psi).not.toHaveBeenCalled();
    expect((await jobFor(first)).result).toEqual({ skipped: "SUPERSEDED" });
  });
  it("does not save measurements after the target URL changes", async () => {
    const { first } = await fixture();
    await scheduleDailyRetests();
    const job = await jobFor(first), hold = holdMeasurement();
    const active = processBackgroundJob(job.id);
    await hold.entered;
    try { await fixtureSql()`UPDATE sites SET url='https://example.net/' WHERE id=${first}`; }
    finally { hold.release(); }
    expect(await active).toEqual({ status: "skipped" });
    expect(await history(first)).toHaveLength(1);
  });
  it("retains the outbox on transport outage and reconciles queued deliveries", async () => {
    const { first } = await fixture();
    await scheduleDailyRetests();
    mocks.publish.mockRejectedValueOnce(new Error("Synthetic Redis outage"));
    await expect(dispatchDueJobs()).rejects.toThrow();
    expect((await jobFor(first)).status).toBe("pending");
    expect(await dispatchDueJobs()).toEqual({ dispatched: 4 });
    expect((await jobFor(first)).status).toBe("queued");
    expect(await dispatchDueJobs()).toEqual({ dispatched: 4 });
  });
  it("maintenance retains accounts, sites, measurements and job idempotency records", async () => {
    const { first } = await fixture();
    await scheduleMaintenance();
    const [job] = await fixtureSql()`SELECT id FROM background_jobs WHERE queue='maintenance'`;
    expect(await processBackgroundJob(job.id)).toEqual({ status: "succeeded" });
    expect(await history(first)).toHaveLength(1);
    const [row] = await fixtureSql()`SELECT count(*)::integer AS total FROM sites`;
    expect(row.total).toBe(2);
    expect(await processBackgroundJob(job.id)).toEqual({ status: "skipped" });
  });
  it("dead-letters an invalid outbox row without starving supported jobs", async () => {
    await fixture();
    await scheduleDailyRetests();
    await fixtureSql()`INSERT INTO background_jobs(queue,kind,job_key,payload,updated_at)
      VALUES('webhooks','unimplemented','invalid-fixture','{}',now()-interval '1 day')`;
    expect(await dispatchDueJobs()).toEqual({ dispatched: 4 });
    const [invalid] = await fixtureSql()`SELECT status,last_error_code FROM background_jobs WHERE job_key='invalid-fixture'`;
    expect({ ...invalid }).toEqual({ status: "failed", last_error_code: "INVALID_PAYLOAD" });
  });
  it("does not overwrite retry scheduling when a fast worker beats the publisher acknowledgement", async () => {
    const { first, owner } = await fixture();
    const job = await scheduleManualRetest(first, owner);
    mocks.psi.mockRejectedValueOnce(new ProviderQuotaError(60_000));
    mocks.publish.mockImplementationOnce(async () => { await processBackgroundJob(job.id); });
    expect(await dispatchDueJobs()).toEqual({ dispatched: 1 });
    const retry = await jobFor(first);
    expect(retry.status).toBe("pending");
    expect(retry.available_at.getTime()).toBeGreaterThan(Date.now());
    expect(retry.attempts).toBe(0);
  });
  it("restricts manual enqueue and status inspection to the current site owner", async () => {
    const { first, owner } = await fixture();
    await expect(scheduleManualRetest(first, randomUUID())).rejects.toMatchObject({ code: "NOT_FOUND" });
    const job = await scheduleManualRetest(first, owner);
    const context = { params: Promise.resolve({ id: job.id }) };
    const req = new NextRequest(`https://example.com/api/jobs/${job.id}`);
    expect((await readJob(req, context)).status).toBe(401);
    mocks.auth.mockResolvedValue({ user: { id: randomUUID() } });
    expect((await readJob(req, context)).status).toBe(404);
    mocks.auth.mockResolvedValue({ user: { id: owner } });
    const response = await readJob(req, context);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.job.id).toBe(job.id);
    expect(body.job).not.toHaveProperty("payload");
    const badOrigin = new NextRequest("https://example.com/api/sites/first/retest", { method: "POST", headers: { origin: "https://evil.invalid" } });
    expect((await POST(badOrigin, { params: Promise.resolve({ slug: "first" }) })).status).toBe(403);
    const good = new NextRequest("https://example.com/api/sites/first/retest", { method: "POST", headers: { origin: "https://example.com" } });
    expect((await POST(good, { params: Promise.resolve({ slug: "first" }) })).status).toBe(202);
    mocks.auth.mockResolvedValue({ user: { id: randomUUID() } });
    expect((await POST(good, { params: Promise.resolve({ slug: "first" }) })).status).toBe(404);
  });
  it("keeps desktop aggregates separate from the mobile current score", async () => {
    const { first,owner } = await fixture();
    const desktop = await scheduleManualRetest(first,owner,"desktop");
    expect(await processBackgroundJob(desktop.id)).toEqual({ status: "succeeded" });
    expect(mocks.psi.mock.calls).toEqual([["https://example.com/","desktop"],["https://example.com/","desktop"]]);
    const [row] = await fixtureSql()`SELECT strategy,sample_count,methodology_version,metrics_source FROM speed_tests WHERE background_job_id=${desktop.id}`;
    expect({ ...row }).toEqual({ strategy: "desktop",sample_count: 2,methodology_version: "psi-v2-two-sample",metrics_source: "lab" });
    const [site] = await fixtureSql()`SELECT current_score FROM sites WHERE id=${first}`;
    expect(site.current_score).toBe(88);
  });
  it("defers screenshot polling without consuming failure attempts, then completes once", async () => {
    const { first } = await fixture();
    const id = randomUUID();
    await fixtureSql()`INSERT INTO background_jobs(id,queue,kind,job_key,payload,site_id)
      VALUES(${id},'screenshots','site.screenshot.capture',${`screen:${id}`},'{}',${first})`;
    expect(await processBackgroundJob(id)).toEqual({ status: "deferred" });
    const [pending] = await fixtureSql()`SELECT attempts,status,lease_token,available_at>now() AS delayed FROM background_jobs WHERE id=${id}`;
    expect({ ...pending }).toEqual({ attempts: 0,status: "pending",lease_token: null,delayed: true });
    await makeDue(id);
    mocks.screenshot.mockResolvedValue({ status: "succeeded" });
    expect(await processBackgroundJob(id)).toEqual({ status: "succeeded" });
    expect(await processBackgroundJob(id)).toEqual({ status: "skipped" });
    expect(mocks.screenshot).toHaveBeenCalledTimes(2);
  });
  it("honors bounded provider retry-after delays in addition to exponential backoff",async()=>{
    const {first,owner}=await fixture();
    const job=await scheduleManualRetest(first,owner);
    mocks.psi.mockRejectedValueOnce(Object.assign(new Error("Synthetic throttle"),{retryAfterMs:120_000}));
    expect(await processBackgroundJob(job.id)).toEqual({status:"retry"});
    const pending=await jobFor(first);
    expect(pending.attempts).toBe(1);
    expect(pending.available_at.getTime()).toBeGreaterThan(Date.now()+110_000);
  });
});

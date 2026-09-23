import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, lt, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { backgroundJobs, jobEvents, sites, speedTests, requestRateLimits, verifiedSpeedTests, type BackgroundJob } from "@/db/schema";
import { getEnv } from "@/config/env";
import { publishJob } from "@/infrastructure/queue/queues";
import { validateQueueJob } from "@/infrastructure/queue/contracts";
import { logger } from "@/infrastructure/logging/logger";
import { getCorrelationId, withCorrelationId } from "@/lib/http/correlation";
import { AppError } from "@/lib/http/errors";
import { runPerformanceTest, PERFORMANCE_METHOD_VERSION, type PerformanceResult, type PerformanceStrategy } from "@/modules/performance/service";
import { ProviderQuotaError } from "./provider-budget";
import { processPaymentWebhook } from "@/modules/payments/service";
import { deliverNotificationEmail } from "@/modules/notifications/service";
import { processPaymentAnalytics } from "@/infrastructure/analytics/datafast";
import { processSiteScreenshotJob } from "@/modules/screenshots/service";
import { processSubmissionPreparation } from "@/modules/submissions/service";
import { finalizePreviousPeriods } from "@/modules/rankings/service";
import { evaluateSiteAwards } from "@/modules/awards/service";
import { verifySiteBadge } from "@/modules/badges/service";
import { expireAdReservations } from "@/modules/payments/ads";
import { notifyPerformanceChange } from "@/modules/notifications/triggers";
import { siteProPredicate } from "@/modules/payments/entitlements";
import { recordAnalyticsEvent } from "@/modules/analytics/events";
import { loadSiteMetadata } from "@/modules/sites/metadata";
import { identityFieldsForSource, websiteIdentity, type WebsiteIdentity } from "@/modules/sites/identity";

const terminal = ["succeeded", "failed", "cancelled"] as const;
const leaseMs = 180_000;
const performancePayload = z.object({ siteId: z.uuid(), strategy: z.enum(["mobile", "desktop"]), day: z.iso.date() }).strict();
const maintenancePayload = z.object({ day: z.iso.date() }).strict();
const webhookPayload = z.object({ eventId: z.uuid() }).strict();
const emailPayload = z.object({ deliveryId: z.uuid() }).strict();
const analyticsPayload = z.object({ paymentId: z.uuid() }).strict();
const badgePayload = z.object({ siteId:z.uuid(),dryRun:z.boolean() }).strict();
const awardPayload = z.object({ siteId:z.uuid() }).strict();
type Outcome = { status: "succeeded" | "retry" | "failed" | "cancelled" | "deferred" | "skipped" };

function database() {
  const db = getDb();
  if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Background services are temporarily unavailable.", 503);
  return db;
}
type Transaction = Parameters<Parameters<ReturnType<typeof database>["transaction"]>[0]>[0];
async function utcDay(tx: Transaction) {
  const [row] = await tx.execute<{ day: string }>(sql`SELECT to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD') AS day`);
  return row.day;
}
const keyFor = (siteId: string, day: string, strategy: PerformanceStrategy) => `site:${siteId}:${day}:${strategy}`;
const event = (job: BackgroundJob, name: string, actor = "service", errorCode?: string) => ({
  jobId: job.id, event: name, actor, attempt: job.attempts, errorCode,
});

/** Bounded replica-safe materialization. Unique keys are the outbox dedup barrier. */
export async function scheduleDailyRetests(): Promise<{ scheduled: number }> {
  return database().transaction(async (tx) => {
    const day = await utcDay(tx);
    const eligible = await tx.execute<{ id: string; strategy: PerformanceStrategy }>(sql`
      SELECT s.id, device.strategy FROM public.sites s
      CROSS JOIN (VALUES ('mobile'),('desktop')) AS device(strategy)
      WHERE s.is_listed AND NOT s.monitoring_paused AND s.lifecycle='active' AND s.archived_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM public.speed_tests t WHERE t.site_id=s.id
          AND t.strategy::text=device.strategy AND t.methodology_version=${PERFORMANCE_METHOD_VERSION}
          AND t.sample_count>=2 AND t.metrics_source='lab'
          AND t.tested_at>=(${day}::date::timestamp AT TIME ZONE 'UTC'))
        AND NOT EXISTS (SELECT 1 FROM public.background_jobs j
          WHERE j.job_key='site:'||s.id::text||':'||${day}||':'||device.strategy)
      ORDER BY s.id,device.strategy LIMIT 500`);
    if (!eligible.length) return { scheduled: 0 };
    const inserted = await tx.insert(backgroundJobs).values(eligible.map(({ id, strategy }) => ({
      queue: "performance", kind: "site.performance.daily", jobKey: keyFor(id, day, strategy), siteId: id,
      payload: { siteId: id, strategy, day }, maxAttempts: getEnv().JOB_MAX_ATTEMPTS,
      correlationId: getCorrelationId() ?? randomUUID(),
    }))).onConflictDoNothing({ target: backgroundJobs.jobKey }).returning();
    if (inserted.length) await tx.insert(jobEvents).values(inserted.map((job) => event(job, "scheduled")));
    return { scheduled: inserted.length };
  });
}

/** Manual and daily retests share one site/day/strategy key and provider budget. */
export async function scheduleManualRetest(siteId: string, userId: string, strategy: PerformanceStrategy = "mobile"): Promise<BackgroundJob> {
  z.enum(["mobile", "desktop"]).parse(strategy);
  return database().transaction(async (tx) => {
    const [site] = await tx.select().from(sites).where(and(eq(sites.id, siteId), eq(sites.ownerId, userId))).for("share");
    if (!site) throw new AppError("NOT_FOUND", "Website not found.", 404);
    const day = await utcDay(tx);
    const [inserted] = await tx.insert(backgroundJobs).values({
      queue: "performance", kind: "site.performance.manual", jobKey: keyFor(siteId, day, strategy), siteId,
      payload: { siteId, strategy, day }, maxAttempts: getEnv().JOB_MAX_ATTEMPTS,
      correlationId: getCorrelationId() ?? randomUUID(),
    }).onConflictDoNothing({ target: backgroundJobs.jobKey }).returning();
    if (inserted) {
      await tx.insert(jobEvents).values(event(inserted, "scheduled", "owner"));
      return inserted;
    }
    const [existing] = await tx.select().from(backgroundJobs).where(eq(backgroundJobs.jobKey, keyFor(siteId, day, strategy)));
    return existing;
  });
}

export async function scheduleMaintenance(): Promise<{ scheduled: number }> {
  return database().transaction(async (tx) => {
    const day = await utcDay(tx);
    const [job] = await tx.insert(backgroundJobs).values({
      queue: "maintenance", kind: "maintenance.cleanup", jobKey: `maintenance:${day}`,
      payload: { day }, maxAttempts: getEnv().JOB_MAX_ATTEMPTS, correlationId: getCorrelationId() ?? randomUUID(),
    }).onConflictDoNothing({ target: backgroundJobs.jobKey }).returning();
    if (job) await tx.insert(jobEvents).values(event(job, "scheduled"));
    return { scheduled: job ? 1 : 0 };
  });
}

/** Bounded public-site maintenance. Badge previews complete before a live status-only check is queued. */
export async function scheduleDailyProductJobs():Promise<{scheduled:number}> {
  return database().transaction(async(tx)=>{
    const day=await utcDay(tx);
    const jobs:{queue:string;kind:string;jobKey:string;siteId?:string;payload:Record<string,unknown>}[]=[
      {queue:"rankings",kind:"ranking.finalize",jobKey:`ranking:${day}`,payload:{day}},
    ];
    const needsBadge=sql`(s.requires_badge AND NOT ${siteProPredicate(sql`s.id`,sql`s.owner_id`,sql`s.tier`)})`;
    const eligible=await tx.execute<{id:string;requires_badge:boolean;preview_ready:boolean}>(sql`
      SELECT s.id,${needsBadge} AS requires_badge,EXISTS(SELECT 1 FROM background_jobs p
        WHERE p.job_key='badge-preview:'||s.id::text||':'||${day} AND p.status='succeeded') AS preview_ready
      FROM sites s WHERE s.is_listed AND s.lifecycle='active' AND s.archived_at IS NULL
        AND (NOT EXISTS(SELECT 1 FROM background_jobs a WHERE a.job_key='awards-daily:'||s.id::text||':'||${day})
          OR (${needsBadge} AND NOT EXISTS(SELECT 1 FROM background_jobs b WHERE b.job_key='badge-preview:'||s.id::text||':'||${day}))
          OR (${needsBadge} AND EXISTS(SELECT 1 FROM background_jobs p WHERE p.job_key='badge-preview:'||s.id::text||':'||${day} AND p.status='succeeded')
            AND NOT EXISTS(SELECT 1 FROM background_jobs b WHERE b.job_key='badge-apply:'||s.id::text||':'||${day})))
      ORDER BY s.id LIMIT 100`);
    for(const site of eligible) {
      jobs.push({queue:"badges",kind:"site.awards.evaluate",jobKey:`awards-daily:${site.id}:${day}`,siteId:site.id,payload:{siteId:site.id}});
      if(site.requires_badge) jobs.push({queue:"badges",kind:"site.badge.verify",jobKey:`badge-${site.preview_ready ? "apply":"preview"}:${site.id}:${day}`,
        siteId:site.id,payload:{siteId:site.id,dryRun:!site.preview_ready}});
    }
    const inserted=await tx.insert(backgroundJobs).values(jobs.map(job=>({...job,maxAttempts:getEnv().JOB_MAX_ATTEMPTS,
      correlationId:getCorrelationId() ?? randomUUID()}))).onConflictDoNothing({target:backgroundJobs.jobKey}).returning();
    if(inserted.length) await tx.insert(jobEvents).values(inserted.map(job=>event(job,"scheduled")));
    return {scheduled:inserted.length};
  });
}

/** Reconcile queued rows after Redis loss and running rows after lease expiry. */
export async function dispatchDueJobs(): Promise<{ dispatched: number }> {
  const db = database();
  const ranked = db.$with("ranked_due_jobs").as(db.select({
    id: backgroundJobs.id,
    position: sql<number>`row_number() over (partition by ${backgroundJobs.queue} order by ${backgroundJobs.updatedAt}, ${backgroundJobs.id})`.as("position"),
  }).from(backgroundJobs).where(and(
    lte(backgroundJobs.availableAt, sql`now()`),
    or(inArray(backgroundJobs.status, ["pending", "queued"]), and(eq(backgroundJobs.status, "running"), lte(backgroundJobs.leasedUntil, sql`now()`))),
  )));
  // Take turns across queues so a daily measurement backlog cannot delay payment
  // events, email or maintenance until every older performance delivery rotates.
  const due = await db.with(ranked).select({ job: backgroundJobs }).from(backgroundJobs)
    .innerJoin(ranked, eq(backgroundJobs.id, ranked.id))
    .orderBy(asc(ranked.position), asc(backgroundJobs.updatedAt), asc(backgroundJobs.id)).limit(100);
  let dispatched = 0;
  for (const { job } of due) {
    let delivery;
    try { delivery = validateQueueJob({ id: job.id, queue: job.queue, kind: job.kind, correlationId: job.correlationId }); }
    catch {
      await db.transaction(async (tx) => {
        const [invalid] = await tx.update(backgroundJobs).set({ status: "failed", lastErrorCode: "INVALID_PAYLOAD",
          leaseToken: null, leasedUntil: null, finishedAt: sql`now()`, updatedAt: sql`now()` })
          .where(and(eq(backgroundJobs.id, job.id), or(inArray(backgroundJobs.status, ["pending", "queued"]),
            and(eq(backgroundJobs.status, "running"), lte(backgroundJobs.leasedUntil, sql`now()`))))).returning();
        if (invalid) await tx.insert(jobEvents).values(event(invalid, "failed", "service", "INVALID_PAYLOAD"));
      });
      continue;
    }
    await publishJob(delivery);
    await db.update(backgroundJobs).set({ status: "queued", updatedAt: sql`now()` })
      .where(and(eq(backgroundJobs.id, job.id), inArray(backgroundJobs.status, ["pending", "queued"]),
        lte(backgroundJobs.availableAt, sql`now()`), eq(backgroundJobs.attempts, job.attempts)));
    // An expired running delivery can still hold a Bull lock until stalled-job
    // recovery. Rotate it too, without changing its fenced lease or retry state.
    if (job.status === "running") await db.update(backgroundJobs).set({ updatedAt: sql`now()` })
      .where(and(eq(backgroundJobs.id, job.id), eq(backgroundJobs.status, "running"),
        eq(backgroundJobs.leaseToken, job.leaseToken!), lte(backgroundJobs.leasedUntil, sql`now()`)));
    dispatched++;
  }
  return { dispatched };
}

async function claim(id: string): Promise<BackgroundJob | null> {
  return database().transaction(async (tx) => {
    const [job] = await tx.select().from(backgroundJobs).where(eq(backgroundJobs.id, id)).for("update");
    if (!job || terminal.includes(job.status as typeof terminal[number])) return null;
    const [clock] = await tx.execute<{ now_ms: string }>(sql`SELECT extract(epoch FROM now()) * 1000 AS now_ms`);
    const now = new Date(Number(clock.now_ms));
    if (job.availableAt > now || (job.leasedUntil && job.leasedUntil > now)) return null;
    if (job.attempts >= job.maxAttempts) {
      await tx.update(backgroundJobs).set({ status: "failed", lastErrorCode: "LEASE_EXPIRED", leaseToken: null, leasedUntil: null, finishedAt: now, updatedAt: now }).where(eq(backgroundJobs.id, id));
      await tx.insert(jobEvents).values(event(job, "failed", "service", "LEASE_EXPIRED"));
      return null;
    }
    if (job.siteId) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`job-site:${job.siteId}`}, 0))`);
      const [active] = await tx.select({ id: backgroundJobs.id }).from(backgroundJobs).where(and(
        eq(backgroundJobs.siteId, job.siteId), eq(backgroundJobs.status, "running"),
        sql`${backgroundJobs.id} <> ${id}`, sql`${backgroundJobs.leasedUntil} > now()`,
      )).limit(1);
      if (active) {
        await tx.update(backgroundJobs).set({ status: "pending", leaseToken: null, leasedUntil: null, availableAt: new Date(now.getTime() + 30_000), updatedAt: now }).where(eq(backgroundJobs.id, id));
        return null;
      }
    }
    const [claimed] = await tx.update(backgroundJobs).set({
      status: "running", leaseToken: randomUUID(), leasedUntil: new Date(now.getTime() + leaseMs),
      attempts: job.attempts + 1, startedAt: now, updatedAt: now,
    }).where(eq(backgroundJobs.id, id)).returning();
    await tx.insert(jobEvents).values(event(claimed, "started"));
    return claimed;
  });
}

const ownsLease = (job: BackgroundJob) => and(eq(backgroundJobs.id, job.id), eq(backgroundJobs.status, "running"),
  eq(backgroundJobs.leaseToken, job.leaseToken!), sql`${backgroundJobs.leasedUntil} > now()`);

async function finish(tx: Transaction, job: BackgroundJob, result: Record<string, unknown>) {
  await tx.update(backgroundJobs).set({ status: "succeeded", result, leaseToken: null, leasedUntil: null,
    lastErrorCode: null, finishedAt: sql`now()`, updatedAt: sql`now()` }).where(ownsLease(job));
  await tx.insert(jobEvents).values(event(job, "succeeded"));
}

async function saveMeasurement(job: BackgroundJob, url: string, strategy: PerformanceStrategy, result: PerformanceResult, identity: WebsiteIdentity | null): Promise<Outcome> {
  return database().transaction(async (tx) => {
    if (identity) for (const key of identity.keys) await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"site-url:" + key}, 0))`);
    const [owned] = await tx.select().from(backgroundJobs).where(ownsLease(job)).for("update");
    if (!owned) return { status: "deferred" };
    const [site] = await tx.select().from(sites).where(eq(sites.id, job.siteId!)).for("update");
    if (!site || site.url !== url || site.archivedAt || ["archived","removed","suspended"].includes(site.lifecycle)
      || (job.kind === "site.performance.daily" && (!site.isListed || site.monitoringPaused || site.lifecycle !== "active"))) {
      await finish(tx, job, { skipped: "SITE_CHANGED" });
      return { status: "skipped" };
    }
    const [measurement] = await tx.insert(speedTests).values({
      siteId: site.id, backgroundJobId: job.id, score: result.score, loadTimeMs: result.loadTimeMs,
      fcpMs: result.fcpMs, lcpMs: result.lcpMs, cls: result.cls, tbtMs: result.tbtMs,
      ttiMs: result.ttiMs, siMs: result.siMs, strategy, methodologyVersion: PERFORMANCE_METHOD_VERSION,
      sampleCount: result.sampleCount, metricsSource: result.metricsSource,
    }).returning({id:speedTests.id});
    // Legacy current_* columns represent mobile only; desktop has separate history.
    if (strategy === "mobile") await tx.update(sites).set({
      ...(identity ? identityFieldsForSource(site.url, identity) : {}),
      currentScore: result.score, currentLoadTime: result.loadTime, currentFcp: result.fcp,
      currentLcp: result.lcp, currentCls: result.clsDisplay, currentTbt: result.tbt,
      currentTti: result.tti, currentSi: result.si, lastTestedAt: sql`now()`,
      trend: site.currentScore > 0 ? Math.round((result.score - site.currentScore) / site.currentScore * 100) : 0,
    }).where(eq(sites.id, site.id));
    await notifyPerformanceChange(tx,{measurementId:measurement.id,siteId:site.id,ownerId:site.ownerId,
      name:site.name,slug:site.slug,score:result.score,strategy});
    await recordAnalyticsEvent({name:"speed_test_completed",eventKey:`speed-test-completed:${job.id}`,siteId:site.id,
      properties:{strategy,score:result.score,methodologyVersion:PERFORMANCE_METHOD_VERSION}},tx);
    await finish(tx, job, { score: result.score, strategy, sampleCount: result.sampleCount, methodologyVersion: PERFORMANCE_METHOD_VERSION });
    const [awardJob]=await tx.insert(backgroundJobs).values({queue:"badges",kind:"site.awards.evaluate",
      jobKey:`awards-measurement:${job.id}`,siteId:site.id,payload:{siteId:site.id},correlationId:job.correlationId,
      maxAttempts:getEnv().JOB_MAX_ATTEMPTS}).onConflictDoNothing({target:backgroundJobs.jobKey}).returning();
    if(awardJob) await tx.insert(jobEvents).values(event(awardJob,"scheduled"));
    return { status: "succeeded" };
  });
}

async function perform(job: BackgroundJob): Promise<Outcome> {
  validateQueueJob({ id: job.id, queue: job.queue, kind: job.kind });
  if(job.kind==="ranking.finalize") {
    maintenancePayload.parse(job.payload);
    const finalized=await finalizePreviousPeriods();
    return database().transaction(async(tx)=>{
      const [owned]=await tx.select().from(backgroundJobs).where(ownsLease(job)).for("update");
      if(!owned) return {status:"deferred"};
      for(const {period} of finalized) {
        const targets=await tx.execute<{site_id:string}>(sql`SELECT DISTINCT site_id FROM ranking_snapshots WHERE period_id=${period.id}`);
        if(!targets.length) continue;
        const inserted=await tx.insert(backgroundJobs).values(targets.map(({site_id})=>({queue:"badges",kind:"site.awards.evaluate",
          jobKey:`awards-period:${period.id}:${site_id}`,siteId:site_id,payload:{siteId:site_id},correlationId:job.correlationId,
          maxAttempts:getEnv().JOB_MAX_ATTEMPTS}))).onConflictDoNothing({target:backgroundJobs.jobKey}).returning();
        if(inserted.length) await tx.insert(jobEvents).values(inserted.map(row=>event(row,"scheduled")));
      }
      await finish(tx,job,{periods:finalized.map(({period})=>period.periodKey)});
      return {status:"succeeded"};
    });
  }
  if(job.kind==="site.awards.evaluate" || job.kind==="site.badge.verify") {
    const payload=job.kind==="site.awards.evaluate" ? awardPayload.parse(job.payload) : badgePayload.parse(job.payload);
    if(payload.siteId!==job.siteId) throw new AppError("INVALID_REQUEST","The job target is no longer available.",400);
    const result=job.kind==="site.awards.evaluate" ? await evaluateSiteAwards(payload.siteId,{notify:true,job})
      : await verifySiteBadge(payload.siteId,{dryRun:(payload as z.infer<typeof badgePayload>).dryRun,notify:true,job});
    return database().transaction(async(tx)=>{
      const [owned]=await tx.select().from(backgroundJobs).where(ownsLease(job)).for("update");
      if(!owned) return {status:"deferred"};
      await finish(tx,job,result);
      return {status:"succeeded"};
    });
  }
  if (job.kind === "site.screenshot.capture" || job.kind === "submission.prepare") {
    const result = job.kind === "submission.prepare" ? await processSubmissionPreparation(job) : await processSiteScreenshotJob(job);
    return database().transaction(async (tx) => {
      const [owned] = await tx.select().from(backgroundJobs).where(ownsLease(job)).for("update");
      if (!owned) return { status: "deferred" };
      if (result.status === "pending") {
        const delayMs = Math.min(Math.max(result.delayMs, 1000), 300_000);
        await tx.update(backgroundJobs).set({ status: "pending", attempts: job.attempts - 1,
          availableAt: sql`now() + (${delayMs} * interval '1 millisecond')`,
          leaseToken: null, leasedUntil: null, updatedAt: sql`now()` }).where(ownsLease(job));
        await tx.insert(jobEvents).values(event(job, "poll_deferred"));
        return { status: "deferred" };
      }
      await finish(tx, job, { ...owned.result, completed: true });
      return { status: "succeeded" };
    });
  }
  if (job.kind === "payment.webhook" || job.kind === "email.deliver" || job.kind === "analytics.payment") {
    const result = job.kind === "payment.webhook"
      ? await processPaymentWebhook(webhookPayload.parse(job.payload).eventId)
      : job.kind === "analytics.payment" ? await processPaymentAnalytics(analyticsPayload.parse(job.payload).paymentId)
      : await deliverNotificationEmail(emailPayload.parse(job.payload).deliveryId);
    return database().transaction(async (tx) => {
      const [owned] = await tx.select().from(backgroundJobs).where(ownsLease(job)).for("update");
      if (!owned) return { status: "deferred" };
      await finish(tx, job, result);
      return { status: "succeeded" };
    });
  }
  if (job.kind === "maintenance.cleanup") {
    maintenancePayload.parse(job.payload);
    return database().transaction(async (tx) => {
      const [owned] = await tx.select().from(backgroundJobs).where(ownsLease(job)).for("update");
      if (!owned) return { status: "deferred" };
        await expireAdReservations(tx);
        await tx.delete(requestRateLimits).where(lt(requestRateLimits.windowStartedAt, sql`now() - interval '1 day'`));
      await tx.delete(verifiedSpeedTests).where(lt(verifiedSpeedTests.expiresAt, sql`now() - interval '30 days'`));
      await finish(tx, job, { completed: true });
      return { status: "succeeded" };
    });
  }
  const payload = performancePayload.parse(job.payload);
  if (payload.siteId !== job.siteId) throw new AppError("INVALID_REQUEST", "The job target is no longer available.", 400);
  const [clock] = await database().execute<{ day: string }>(sql`SELECT to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD') AS day`);
  const [site] = await database().select().from(sites).where(eq(sites.id, payload.siteId));
  if (payload.day !== clock.day || !site || site.archivedAt || ["archived","removed","suspended"].includes(site.lifecycle)
    || (job.kind === "site.performance.daily" && (!site.isListed || site.monitoringPaused || site.lifecycle !== "active"))) {
    return database().transaction(async (tx) => {
      const [owned] = await tx.select().from(backgroundJobs).where(ownsLease(job)).for("update");
      if (owned) await finish(tx, job, { skipped: payload.day !== clock.day ? "SUPERSEDED" : "SITE_UNAVAILABLE" });
      return { status: "skipped" };
    });
  }
  const mayStart=await database().transaction(async(tx)=>{
    const [owned]=await tx.select({id:backgroundJobs.id}).from(backgroundJobs).where(ownsLease(job)).for("update");
    if(!owned) return false;
    await recordAnalyticsEvent({name:"speed_test_started",eventKey:`speed-test-started:${job.id}:${job.attempts}`,siteId:site.id,
      properties:{strategy:payload.strategy,methodologyVersion:PERFORMANCE_METHOD_VERSION}},tx);
    return true;
  });
  if(!mayStart) return {status:"deferred"};
  // Bounded metadata observation runs alongside mobile measurement. A timeout,
  // private redirect or other transport failure cannot delete history, change
  // visibility, or turn a temporary outage into a lifecycle transition.
  const observed = payload.strategy === "mobile"
    ? loadSiteMetadata(site.url).then((metadata) => websiteIdentity(site.url, metadata)).catch(() => null)
    : Promise.resolve(null);
  const [result, identity] = await Promise.all([runPerformanceTest(site.url, payload.strategy), observed]);
  return saveMeasurement(job, site.url, payload.strategy, result, identity);
}

async function recordFailure(job: BackgroundJob, error: unknown): Promise<Outcome> {
  const quota = error instanceof ProviderQuotaError;
  const code = error instanceof AppError ? error.code : error instanceof z.ZodError ? "INVALID_PAYLOAD" : "JOB_FAILED";
  const permanent = ["URL_BLOCKED", "INVALID_REQUEST", "INVALID_PAYLOAD", "NOT_FOUND", "FORBIDDEN"].includes(code)
    || (error instanceof Error && "retryable" in error && error.retryable === false);
  const retry = quota || (!permanent && job.attempts < job.maxAttempts);
  const status = retry ? "pending" : "failed";
  const retryAfter = error instanceof Error && "retryAfterMs" in error && typeof error.retryAfterMs==="number"
    && Number.isFinite(error.retryAfterMs) ? Math.min(Math.max(error.retryAfterMs,0),86_400_000) : 0;
  const delay = quota ? error.retryAfterMs + 1000 : Math.max(Math.min(60_000 * 2 ** (job.attempts - 1), 3_600_000),retryAfter);
  return database().transaction(async (tx) => {
    const [updated] = await tx.update(backgroundJobs).set({
      status, attempts: quota ? job.attempts - 1 : job.attempts, availableAt: sql`now() + (${delay} * interval '1 millisecond')`,
      leaseToken: null, leasedUntil: null, lastErrorCode: code, updatedAt: sql`now()`,
      finishedAt: retry ? null : sql`now()`,
    }).where(ownsLease(job)).returning();
    if (!updated) return { status: "deferred" };
    await tx.insert(jobEvents).values(event(job, quota ? "quota_deferred" : retry ? "retry_scheduled" : "failed", "service", code));
    if(!quota && ["site.performance.daily","site.performance.manual"].includes(job.kind)) {
      const payload=performancePayload.safeParse(job.payload);
      if(payload.success) await recordAnalyticsEvent({name:"speed_test_failed",eventKey:`speed-test-failed:${job.id}:${job.attempts}`,
        siteId:job.siteId,properties:{strategy:payload.data.strategy,methodologyVersion:PERFORMANCE_METHOD_VERSION,errorCode:code}},tx);
    }
    return { status: retry ? "retry" : "failed" };
  });
}

export async function processBackgroundJob(id: string, _delivery?: { attempt?: number }): Promise<Outcome> {
  void _delivery;
  if (!z.uuid().safeParse(id).success) throw new Error("Invalid job ID");
  const job = await claim(id);
  if (!job) return { status: "skipped" };
  return withCorrelationId(job.correlationId, async () => {
    const started = Date.now();
    let outcome: Outcome;
    let errorCode: string | undefined;
    try { outcome = await perform(job); }
    catch (error) {
      errorCode = error instanceof AppError ? error.code : error instanceof z.ZodError ? "INVALID_PAYLOAD" : "JOB_FAILED";
      outcome = await recordFailure(job, error);
    }
    logger.info({ event: "job.finished", jobId: job.id, siteId: job.siteId, queue: job.queue,
      attempt: job.attempts, durationMs: Date.now() - started, status: outcome.status, errorCode });
    return outcome;
  });
}

export async function operateJob(id: string, operation: "retry" | "cancel"): Promise<BackgroundJob> {
  if (!z.uuid().safeParse(id).success) throw new AppError("INVALID_REQUEST", "Invalid job ID.", 400);
  return database().transaction(async (tx) => {
    const [job] = await tx.select().from(backgroundJobs).where(eq(backgroundJobs.id, id)).for("update");
    if (!job) throw new AppError("NOT_FOUND", "Job not found.", 404);
    if (operation === "retry" && !["failed", "cancelled"].includes(job.status)) throw new AppError("CONFLICT", "Only failed or cancelled jobs can be retried.", 409);
    if (operation === "cancel" && terminal.includes(job.status as typeof terminal[number])) throw new AppError("CONFLICT", "The job has already finished.", 409);
    const [updated] = await tx.update(backgroundJobs).set(operation === "cancel" ? {
      status: "cancelled", leaseToken: null, leasedUntil: null, finishedAt: sql`now()`, updatedAt: sql`now()`,
    } : {
      status: "pending", leaseToken: null, leasedUntil: null, availableAt: sql`now()`, finishedAt: null,
      maxAttempts: job.attempts + getEnv().JOB_MAX_ATTEMPTS, lastErrorCode: null, updatedAt: sql`now()`,
    }).where(eq(backgroundJobs.id, id)).returning();
    await tx.insert(jobEvents).values(event(job, operation === "cancel" ? "cancelled" : "operator_retry", "operator"));
    return updated;
  });
}

export function publicJob(job: BackgroundJob) {
  return { id: job.id, kind: job.kind, status: job.status, attempts: job.attempts,
    availableAt: job.availableAt, createdAt: job.createdAt, finishedAt: job.finishedAt, errorCode: job.lastErrorCode,
    skipped: typeof job.result?.skipped === "string" ? job.result.skipped : undefined };
}

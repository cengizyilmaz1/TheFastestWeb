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
import { runPageSpeedTest, METHODOLOGY_VERSION, type PSIResult } from "@/lib/pagespeed";
import { ProviderQuotaError } from "./provider-budget";
import { processPaymentWebhook } from "@/modules/payments/service";
import { deliverNotificationEmail } from "@/modules/notifications/service";

const terminal = ["succeeded", "failed", "cancelled"] as const;
const leaseMs = 180_000;
const performancePayload = z.object({ siteId: z.uuid(), strategy: z.literal("mobile"), day: z.iso.date() }).strict();
const maintenancePayload = z.object({ day: z.iso.date() }).strict();
const webhookPayload = z.object({ eventId: z.uuid() }).strict();
const emailPayload = z.object({ deliveryId: z.uuid() }).strict();
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
const keyFor = (siteId: string, day: string) => `site:${siteId}:${day}:mobile`;
const event = (job: BackgroundJob, name: string, actor = "service", errorCode?: string) => ({
  jobId: job.id, event: name, actor, attempt: job.attempts, errorCode,
});

/** Bounded replica-safe materialization. Unique keys are the outbox dedup barrier. */
export async function scheduleDailyRetests(): Promise<{ scheduled: number }> {
  return database().transaction(async (tx) => {
    const day = await utcDay(tx);
    const eligible = await tx.select({ id: sites.id }).from(sites).where(and(
      eq(sites.isListed, true), eq(sites.monitoringPaused, false),
      or(sql`${sites.lastTestedAt} IS NULL`, lt(sites.lastTestedAt, new Date(`${day}T00:00:00Z`))),
      sql`NOT EXISTS (SELECT 1 FROM background_jobs j WHERE j.job_key = 'site:' || ${sites.id}::text || ':' || ${day} || ':mobile')`,
    )).orderBy(asc(sites.id)).limit(500);
    if (!eligible.length) return { scheduled: 0 };
    const inserted = await tx.insert(backgroundJobs).values(eligible.map(({ id }) => ({
      queue: "performance", kind: "site.performance.daily", jobKey: keyFor(id, day), siteId: id,
      payload: { siteId: id, strategy: "mobile", day }, maxAttempts: getEnv().JOB_MAX_ATTEMPTS,
      correlationId: getCorrelationId() ?? randomUUID(),
    }))).onConflictDoNothing({ target: backgroundJobs.jobKey }).returning();
    if (inserted.length) await tx.insert(jobEvents).values(inserted.map((job) => event(job, "scheduled")));
    return { scheduled: inserted.length };
  });
}

/** Manual and daily retests share one site/day/strategy key and provider budget. */
export async function scheduleManualRetest(siteId: string, userId: string): Promise<BackgroundJob> {
  return database().transaction(async (tx) => {
    const [site] = await tx.select().from(sites).where(and(eq(sites.id, siteId), eq(sites.ownerId, userId))).for("share");
    if (!site) throw new AppError("NOT_FOUND", "Website not found.", 404);
    const day = await utcDay(tx);
    const [inserted] = await tx.insert(backgroundJobs).values({
      queue: "performance", kind: "site.performance.manual", jobKey: keyFor(siteId, day), siteId,
      payload: { siteId, strategy: "mobile", day }, maxAttempts: getEnv().JOB_MAX_ATTEMPTS,
      correlationId: getCorrelationId() ?? randomUUID(),
    }).onConflictDoNothing({ target: backgroundJobs.jobKey }).returning();
    if (inserted) {
      await tx.insert(jobEvents).values(event(inserted, "scheduled", "owner"));
      return inserted;
    }
    const [existing] = await tx.select().from(backgroundJobs).where(eq(backgroundJobs.jobKey, keyFor(siteId, day)));
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

/** Reconcile queued rows after Redis loss and running rows after lease expiry. */
export async function dispatchDueJobs(): Promise<{ dispatched: number }> {
  const db = database();
  const due = await db.select().from(backgroundJobs).where(and(
    lte(backgroundJobs.availableAt, sql`now()`),
    or(inArray(backgroundJobs.status, ["pending", "queued"]), and(eq(backgroundJobs.status, "running"), lte(backgroundJobs.leasedUntil, sql`now()`))),
  )).orderBy(asc(backgroundJobs.updatedAt), asc(backgroundJobs.id)).limit(100);
  let dispatched = 0;
  for (const job of due) {
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

async function saveMeasurement(job: BackgroundJob, url: string, result: PSIResult): Promise<Outcome> {
  return database().transaction(async (tx) => {
    const [owned] = await tx.select().from(backgroundJobs).where(ownsLease(job)).for("update");
    if (!owned) return { status: "deferred" };
    const [site] = await tx.select().from(sites).where(eq(sites.id, job.siteId!)).for("update");
    if (!site || site.url !== url || (job.kind === "site.performance.daily" && (!site.isListed || site.monitoringPaused))) {
      await finish(tx, job, { skipped: "SITE_CHANGED" });
      return { status: "skipped" };
    }
    await tx.insert(speedTests).values({
      siteId: site.id, backgroundJobId: job.id, score: result.score, loadTimeMs: result.loadTimeMs,
      fcpMs: result.fcpMs, lcpMs: result.lcpMs, cls: result.cls, tbtMs: result.tbtMs,
      ttiMs: result.ttiMs, siMs: result.siMs, strategy: "mobile", methodologyVersion: METHODOLOGY_VERSION,
    });
    await tx.update(sites).set({
      currentScore: result.score, currentLoadTime: result.loadTime, currentFcp: result.fcp,
      currentLcp: result.lcp, currentCls: result.clsDisplay, currentTbt: result.tbt,
      currentTti: result.tti, currentSi: result.si, lastTestedAt: sql`now()`,
      trend: site.currentScore > 0 ? Math.round((result.score - site.currentScore) / site.currentScore * 100) : 0,
    }).where(eq(sites.id, site.id));
    await finish(tx, job, { score: result.score, methodologyVersion: METHODOLOGY_VERSION });
    return { status: "succeeded" };
  });
}

async function perform(job: BackgroundJob): Promise<Outcome> {
  validateQueueJob({ id: job.id, queue: job.queue, kind: job.kind });
  if (job.kind === "payment.webhook" || job.kind === "email.deliver") {
    const result = job.kind === "payment.webhook"
      ? await processPaymentWebhook(webhookPayload.parse(job.payload).eventId)
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
  if (payload.day !== clock.day || !site || (job.kind === "site.performance.daily" && (!site.isListed || site.monitoringPaused))) {
    return database().transaction(async (tx) => {
      const [owned] = await tx.select().from(backgroundJobs).where(ownsLease(job)).for("update");
      if (owned) await finish(tx, job, { skipped: payload.day !== clock.day ? "SUPERSEDED" : "SITE_UNAVAILABLE" });
      return { status: "skipped" };
    });
  }
  return saveMeasurement(job, site.url, await runPageSpeedTest(site.url, "mobile"));
}

async function recordFailure(job: BackgroundJob, error: unknown): Promise<Outcome> {
  const quota = error instanceof ProviderQuotaError;
  const code = error instanceof AppError ? error.code : error instanceof z.ZodError ? "INVALID_PAYLOAD" : "JOB_FAILED";
  const permanent = ["URL_BLOCKED", "INVALID_REQUEST", "INVALID_PAYLOAD"].includes(code)
    || (error instanceof Error && "retryable" in error && error.retryable === false);
  const retry = quota || (!permanent && job.attempts < job.maxAttempts);
  const status = retry ? "pending" : "failed";
  const delay = quota ? error.retryAfterMs + 1000 : Math.min(60_000 * 2 ** (job.attempts - 1), 3_600_000);
  return database().transaction(async (tx) => {
    const [updated] = await tx.update(backgroundJobs).set({
      status, attempts: quota ? job.attempts - 1 : job.attempts, availableAt: sql`now() + (${delay} * interval '1 millisecond')`,
      leaseToken: null, leasedUntil: null, lastErrorCode: code, updatedAt: sql`now()`,
      finishedAt: retry ? null : sql`now()`,
    }).where(ownsLease(job)).returning();
    if (!updated) return { status: "deferred" };
    await tx.insert(jobEvents).values(event(job, quota ? "quota_deferred" : retry ? "retry_scheduled" : "failed", "service", code));
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

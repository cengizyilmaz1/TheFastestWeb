import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { backgroundJobs, jobEvents, sites, verifiedSpeedTests, type BackgroundJob } from "@/db/schema";
import { getEnv } from "@/config/env";
import { AppError } from "@/lib/http/errors";
import { normalizeSubmittedUrl } from "@/modules/sites/input";
import { loadSiteMetadata, type SiteMetadata } from "@/modules/sites/metadata";
import { runPerformanceTest, PERFORMANCE_METHOD_VERSION, type PerformanceResult } from "@/modules/performance/service";
import { requestScreenshot, getScreenshot, getScreenshotOriginal } from "@/infrastructure/screenshots/client";
import { UnsafeUrlError } from "@/lib/security/public-url";

export const preparationInput = z.object({ url: z.string().trim().min(1).max(2048) }).strict();
const payloadSchema = z.object({ userId: z.uuid(), url: z.string().max(2048) }).strict();
export type ExistingListing = { existing: true; site: { id: string; slug: string; name: string; owned: boolean } | null; canClaim: boolean };
export type PreparationResult = { metadata?: SiteMetadata; warnings?: string[]; mobileProofId?: string; desktopProofId?: string; screenshotId?: string; duplicate?: ExistingListing };
function database() { const db = getDb(); if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Website preparation is temporarily unavailable.", 503); return db; }
const ownsLease = (job: BackgroundJob) => and(eq(backgroundJobs.id, job.id), eq(backgroundJobs.status, "running"), eq(backgroundJobs.leaseToken, job.leaseToken!), sql`${backgroundJobs.leasedUntil}>now()`);

async function duplicate(url: string, userId: string): Promise<ExistingListing | null> {
  const [site] = await database().select({ id: sites.id, slug: sites.slug, name: sites.name, ownerId: sites.ownerId,
    isListed: sites.isListed, lifecycle: sites.lifecycle, archivedAt: sites.archivedAt }).from(sites).where(eq(sites.normalizedUrl, url)).limit(1);
  if (!site) return null;
  const owned = site.ownerId === userId, isPublic = site.isListed && site.lifecycle === "active" && !site.archivedAt;
  return { existing: true, site: owned || isPublic ? { id: site.id, slug: site.slug, name: site.name, owned } : null, canClaim: isPublic && !owned };
}

export async function startSubmissionPreparation(userId: string, raw: unknown) {
  const url = normalizeSubmittedUrl(preparationInput.parse(raw).url);
  const existing = await duplicate(url, userId);
  if (existing) return existing;
  return database().transaction(async (tx) => {
    const fingerprint = createHash("sha256").update(url).digest("hex");
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`prepare:${userId}:${fingerprint}`},0))`);
    const [active] = await tx.select().from(backgroundJobs).where(and(eq(backgroundJobs.kind, "submission.prepare"),
      sql`${backgroundJobs.payload}->>'userId'=${userId}`, sql`${backgroundJobs.payload}->>'url'=${url}`,
      inArray(backgroundJobs.status, ["pending", "queued", "running", "succeeded"]), gt(backgroundJobs.createdAt, sql`now()-interval '15 minutes'`)))
      .orderBy(desc(backgroundJobs.createdAt)).limit(1);
    if (active) return { jobId: active.id, status: active.status };
    const [job] = await tx.insert(backgroundJobs).values({ queue: "performance", kind: "submission.prepare", jobKey: `submission:${randomUUID()}`,
      payload: { userId, url }, correlationId: randomUUID(), maxAttempts: getEnv().JOB_MAX_ATTEMPTS }).returning();
    await tx.insert(jobEvents).values({ jobId: job.id, event: "scheduled", actor: "owner", attempt: 0 });
    return { jobId: job.id, status: job.status };
  });
}

async function savePartial(job: BackgroundJob, patch: PreparationResult) {
  return database().transaction(async (tx) => {
    const [owned] = await tx.select().from(backgroundJobs).where(ownsLease(job)).for("update");
    if (!owned) throw new AppError("CONFLICT", "The preparation job is being recovered.", 409);
    const previousWarnings = Array.isArray(owned.result?.warnings) ? owned.result.warnings.filter((value): value is string => typeof value === "string") : [];
    const result = { ...owned.result, ...patch, ...(patch.warnings ? { warnings: [...new Set([...previousWarnings, ...patch.warnings])] } : {}) };
    await tx.update(backgroundJobs).set({ result, updatedAt: sql`now()` }).where(ownsLease(job));
  });
}

async function measure(job: BackgroundJob, userId: string, url: string, strategy: "mobile" | "desktop", previousId?: string) {
  const db = database();
  if (previousId && z.uuid().safeParse(previousId).success) {
    const [valid] = await db.select({ id: verifiedSpeedTests.id }).from(verifiedSpeedTests).where(and(eq(verifiedSpeedTests.id, previousId),
      eq(verifiedSpeedTests.userId, userId), eq(verifiedSpeedTests.normalizedUrl, url), eq(verifiedSpeedTests.strategy, strategy),
      eq(verifiedSpeedTests.methodologyVersion, PERFORMANCE_METHOD_VERSION), isNull(verifiedSpeedTests.consumedAt), gt(verifiedSpeedTests.expiresAt, sql`now()`)));
    if (valid) return;
  }
  const { rawResponse: _raw, ...result } = await runPerformanceTest(url, strategy); void _raw;
  await db.transaction(async (tx) => {
    const [owned] = await tx.select().from(backgroundJobs).where(ownsLease(job)).for("update");
    if (!owned) throw new AppError("CONFLICT", "The preparation job is being recovered.", 409);
    const [proof] = await tx.insert(verifiedSpeedTests).values({ userId, normalizedUrl: url, strategy, jobId: randomUUID(),
      result, methodologyVersion: PERFORMANCE_METHOD_VERSION, expiresAt: sql`now()+interval '1 hour'` }).returning({ id: verifiedSpeedTests.id });
    await tx.update(backgroundJobs).set({ result: { ...owned.result, [strategy === "mobile" ? "mobileProofId" : "desktopProofId"]: proof.id }, updatedAt: sql`now()` }).where(ownsLease(job));
  });
}

export async function processSubmissionPreparation(job: BackgroundJob): Promise<{ status: "pending"; delayMs: number } | { status: "succeeded" }> {
  const input = payloadSchema.parse(job.payload), url = normalizeSubmittedUrl(input.url);
  if (url !== input.url || !job.leaseToken || job.createdAt.getTime() < Date.now() - 86_400_000) throw new AppError("INVALID_REQUEST", "Start a new preparation request.", 400);
  const existing = await duplicate(url, input.userId);
  if (existing) { await savePartial(job, { duplicate: existing }); return { status: "succeeded" }; }
  const previous = (job.result ?? {}) as PreparationResult;
  if (!previous.metadata) {
    try { await savePartial(job, { metadata: await loadSiteMetadata(url) }); }
    catch (error) {
      if (error instanceof AppError && error.code === "CONFLICT") throw error;
      if (error instanceof UnsafeUrlError) throw new AppError("URL_BLOCKED", "The website must resolve to a public address.", 400);
      await savePartial(job, { warnings: ["Website details could not be read. You can enter them manually."] });
    }
  }
  // Each strategy contains two actual samples. Partial successful strategies are
  // persisted under the lease and reused by a later retry, never invented.
  const measured = await Promise.allSettled([measure(job, input.userId, url, "mobile", previous.mobileProofId), measure(job, input.userId, url, "desktop", previous.desktopProofId)]);
  const failed = measured.find((result) => result.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
  if (getEnv().SCREENSHOTS_ENABLED && !previous.screenshotId) {
    try { const receipt = await requestScreenshot({ url, visibility: "private", history: "none" }, job.id); await savePartial(job, { screenshotId: receipt.id }); }
    catch { await savePartial(job, { warnings: ["The screenshot preview is temporarily unavailable."] }); }
  }
  return { status: "succeeded" };
}

export async function getSubmissionPreparation(userId: string, id: string) {
  if (!z.uuid().safeParse(id).success) throw new AppError("NOT_FOUND", "Preparation request not found.", 404);
  const db = database();
  const [job] = await db.select().from(backgroundJobs).where(and(eq(backgroundJobs.id, id), eq(backgroundJobs.kind, "submission.prepare"), sql`${backgroundJobs.payload}->>'userId'=${userId}`));
  if (!job) throw new AppError("NOT_FOUND", "Preparation request not found.", 404);
  const input = payloadSchema.parse(job.payload), result = (job.result ?? {}) as PreparationResult;
  const proof = async (id: string | undefined, strategy: "mobile" | "desktop") => {
    if (!id || !z.uuid().safeParse(id).success) return null;
    const [row] = await db.select({ id: verifiedSpeedTests.id, result: verifiedSpeedTests.result, expiresAt: verifiedSpeedTests.expiresAt }).from(verifiedSpeedTests)
      .where(and(eq(verifiedSpeedTests.id, id), eq(verifiedSpeedTests.userId, userId), eq(verifiedSpeedTests.normalizedUrl, input.url),
        eq(verifiedSpeedTests.strategy, strategy), eq(verifiedSpeedTests.methodologyVersion, PERFORMANCE_METHOD_VERSION), isNull(verifiedSpeedTests.consumedAt), gt(verifiedSpeedTests.expiresAt, sql`now()`)));
    return row ? { id: row.id, result: row.result as PerformanceResult, expiresAt: row.expiresAt.toISOString() } : null;
  };
  const [mobile, desktop] = await Promise.all([proof(result.mobileProofId, "mobile"), proof(result.desktopProofId, "desktop")]);
  return { id: job.id, status: job.status, url: input.url, metadata: result.metadata ?? null, warnings: result.warnings ?? [],
    duplicate: result.duplicate ?? null, mobile, desktop, hasScreenshot: Boolean(result.screenshotId), errorCode: job.lastErrorCode };
}

export async function getSubmissionScreenshot(userId: string, id: string) {
  if (!z.uuid().safeParse(id).success) throw new AppError("NOT_FOUND", "Preview not found.", 404);
  const [job] = await database().select().from(backgroundJobs).where(and(eq(backgroundJobs.id, id), eq(backgroundJobs.kind, "submission.prepare"), sql`${backgroundJobs.payload}->>'userId'=${userId}`));
  const serviceId = z.uuid().safeParse(job?.result?.screenshotId);
  if (!job || !serviceId.success) throw new AppError("NOT_FOUND", "Preview not found.", 404);
  const input = payloadSchema.parse(job.payload), receipt = await getScreenshot(serviceId.data);
  if (receipt.status !== "ready" || !receipt.result || new URL(normalizeSubmittedUrl(receipt.result.finalUrl)).origin !== new URL(input.url).origin) {
    throw new AppError("UPSTREAM_UNAVAILABLE", "The screenshot preview is not ready.", 503);
  }
  return getScreenshotOriginal(serviceId.data);
}

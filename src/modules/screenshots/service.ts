import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getEnv } from "@/config/env";
import { getDb } from "@/db";
import { backgroundJobs, jobEvents, sites, siteScreenshots, type BackgroundJob } from "@/db/schema";
import { requestScreenshot, getScreenshot, type ScreenshotResponse } from "@/infrastructure/screenshots/client";
import { normalizePublicUrl } from "@/lib/security/public-url";
import { AppError } from "@/lib/http/errors";

const profile = z.object({ device: z.enum(["desktop", "mobile"]).default("desktop"), mode: z.enum(["viewport", "fullpage"]).default("viewport"),
  history: z.enum(["none", "daily", "weekly", "monthly"]).default("daily") }).strict();
const payloadSchema = profile.extend({ siteId: z.uuid(), sourceUrl: z.string().max(2048) }).strict();
const publicLifecycle = ["active"] as const;
function matchesSource(current: string, expected: string): boolean {
  try { return normalizePublicUrl(current) === expected; } catch { return false; }
}
function database() {
  const db = getDb();
  if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Screenshot history is temporarily unavailable.", 503);
  return db;
}
const ownsLease = (job: BackgroundJob) => and(eq(backgroundJobs.id, job.id), eq(backgroundJobs.status, "running"),
  eq(backgroundJobs.leaseToken, job.leaseToken!), sql`${backgroundJobs.leasedUntil}>now()`);

/** Public captures require an approved public listing and its owner's request. */
export async function scheduleScreenshot(siteId: string, ownerId: string, options: z.input<typeof profile> = {}): Promise<BackgroundJob> {
  if (!getEnv().SCREENSHOTS_ENABLED) throw new AppError("FEATURE_DISABLED", "Screenshots are temporarily unavailable.", 503);
  const settings = profile.parse(options);
  return database().transaction(async (tx) => {
    const [site] = await tx.select().from(sites).where(and(eq(sites.id, siteId), eq(sites.ownerId, ownerId), eq(sites.isListed, true), isNull(sites.archivedAt), inArray(sites.lifecycle, [...publicLifecycle]))).for("share");
    if (!site) throw new AppError("NOT_FOUND", "A published website was not found.", 404);
    const [clock] = await tx.execute<{ period: string }>(sql`SELECT to_char(date_trunc(${settings.history === "monthly" ? "month" : settings.history === "weekly" ? "week" : "day"},now() AT TIME ZONE 'UTC'),'YYYY-MM-DD') AS period`);
    const key = `screenshot:${site.id}:${settings.device}:${settings.mode}:${settings.history}:${clock.period}`;
    const [created] = await tx.insert(backgroundJobs).values({ queue: "screenshots", kind: "site.screenshot.capture", jobKey: key, siteId,
      payload: { ...settings, siteId, sourceUrl: normalizePublicUrl(site.url) }, correlationId: randomUUID(), maxAttempts: getEnv().JOB_MAX_ATTEMPTS })
      .onConflictDoNothing({ target: backgroundJobs.jobKey }).returning();
    if (created) { await tx.insert(jobEvents).values({ jobId: created.id, event: "scheduled", actor: "owner", attempt: 0 }); return created; }
    const [existing] = await tx.select().from(backgroundJobs).where(eq(backgroundJobs.jobKey, key));
    return existing;
  });
}

export function validatePublicScreenshot(result: NonNullable<ScreenshotResponse["result"]>, sourceUrl: string) {
  const env = getEnv(), image = result.optimized;
  let source: URL, final: URL;
  try { source = new URL(normalizePublicUrl(sourceUrl)); final = new URL(normalizePublicUrl(result.finalUrl)); }
  catch { throw new AppError("INVALID_REQUEST", "The screenshot target could not be verified.", 400); }
  if (source.origin !== final.origin || image.contentType !== "image/webp" || !image.publicUrl || !env.R2_PUBLIC_BASE_URL ||
    !image.objectKey.startsWith(`${env.SCREENSHOT_CLIENT_ID}/sites/screenshots/`) || image.objectKey.split("/").some((part) => part === ".." || part === ".")) {
    throw new AppError("INVALID_REQUEST", "The screenshot result could not be verified.", 400);
  }
  const publicUrl = new URL(image.publicUrl), expected = new URL(`/${image.objectKey.split("/").map(encodeURIComponent).join("/")}`, env.R2_PUBLIC_BASE_URL);
  if (publicUrl.href !== expected.href || publicUrl.protocol !== "https:" || Date.parse(result.retentionUntil) <= Date.now() ||
    Date.parse(result.capturedAt) > Date.now() + 60_000 || Date.parse(result.capturedAt) >= Date.parse(result.retentionUntil)) {
    throw new AppError("INVALID_REQUEST", "The screenshot result could not be verified.", 400);
  }
  return image;
}

export async function processSiteScreenshotJob(job: BackgroundJob): Promise<{ status: "pending"; delayMs: number } | { status: "succeeded" }> {
  const input = payloadSchema.parse(job.payload);
  if (job.siteId !== input.siteId || !job.leaseToken) throw new AppError("INVALID_REQUEST", "Invalid screenshot job.", 400);
  if (job.createdAt.getTime() < Date.now() - 86_400_000) throw new AppError("INVALID_REQUEST", "The screenshot request expired.", 400);
  const db = database();
  const [site] = await db.select().from(sites).where(and(eq(sites.id, input.siteId), eq(sites.isListed, true), isNull(sites.archivedAt), inArray(sites.lifecycle, [...publicLifecycle])));
  if (!site || !matchesSource(site.url, input.sourceUrl)) throw new AppError("NOT_FOUND", "The public website changed or is no longer available.", 404);
  const previousId = z.uuid().safeParse(job.result?.serviceJobId);
  const response = previousId.success ? await getScreenshot(previousId.data) : await requestScreenshot({ url: input.sourceUrl,
    device: input.device, mode: input.mode, history: input.history, visibility: "public" }, job.id);
  if (response.status === "failed" || response.status === "expired") throw new AppError("INVALID_REQUEST", "The screenshot could not be captured.", 400);
  if (response.status !== "ready" || !response.result) {
    await db.update(backgroundJobs).set({ result: { serviceJobId: response.id }, updatedAt: sql`now()` }).where(ownsLease(job));
    return { status: "pending", delayMs: 15_000 };
  }
  const result = response.result, image = validatePublicScreenshot(result, input.sourceUrl);
  await db.transaction(async (tx) => {
    const [owned] = await tx.select({ id: backgroundJobs.id }).from(backgroundJobs).where(ownsLease(job)).for("update");
    if (!owned) return;
    const [stillPublic] = await tx.select().from(sites).where(and(eq(sites.id, input.siteId), eq(sites.isListed, true), isNull(sites.archivedAt), inArray(sites.lifecycle, [...publicLifecycle]))).for("share");
    if (!stillPublic || !matchesSource(stillPublic.url, input.sourceUrl)) throw new AppError("NOT_FOUND", "The public website changed.", 404);
    await tx.insert(siteScreenshots).values({ siteId: input.siteId, serviceJobId: response.id, backgroundJobId: job.id, device: input.device, mode: input.mode,
      objectKey: image.objectKey, publicUrl: image.publicUrl!, width: image.width, height: image.height, contentType: image.contentType, size: image.size, hash: image.hash,
      capturedAt: new Date(result.capturedAt), retentionUntil: new Date(result.retentionUntil), sourceUrl: input.sourceUrl })
      .onConflictDoNothing({ target: siteScreenshots.serviceJobId });
    await tx.update(backgroundJobs).set({ result: { serviceJobId: response.id }, updatedAt: sql`now()` }).where(ownsLease(job));
  });
  return { status: "succeeded" };
}

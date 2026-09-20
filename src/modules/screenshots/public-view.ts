import { and, desc, eq, gt, isNull, lte } from "drizzle-orm";
import { getEnv } from "@/config/env";
import { getDb } from "@/db";
import { sites, siteScreenshots } from "@/db/schema";
import { logger } from "@/infrastructure/logging/logger";
import { normalizePublicUrl } from "@/lib/security/public-url";

type ScreenshotCandidate = {
  siteUrl: string;
  isListed: boolean;
  archivedAt: Date | null;
  lifecycle: string;
  sourceUrl: string;
  status: string;
  contentType: string;
  objectKey: string;
  publicUrl: string;
  width: number;
  height: number;
  capturedAt: Date;
  retentionUntil: Date | null;
};

type PublicationConfig = { publicBaseUrl: string; clientId: string };
export type PublicScreenshot = { url: string; width: number; height: number; capturedAt: string };

/** Recheck persisted captures before publication; never expose storage or job metadata. */
export function publicScreenshot(
  candidate: ScreenshotCandidate,
  config: PublicationConfig,
  now = new Date(),
): PublicScreenshot | null {
  if (!candidate.isListed || candidate.archivedAt !== null || candidate.lifecycle !== "active" ||
    candidate.status !== "ready" || candidate.contentType !== "image/webp") return null;

  const capturedAt = candidate.capturedAt.getTime();
  const retentionUntil = candidate.retentionUntil?.getTime() ?? NaN;
  if (!Number.isFinite(now.getTime()) || !Number.isFinite(capturedAt) || !Number.isFinite(retentionUntil) ||
    retentionUntil <= now.getTime() || capturedAt > now.getTime() + 60_000 || capturedAt >= retentionUntil ||
    !Number.isSafeInteger(candidate.width) || candidate.width < 1 || candidate.width > 16_384 ||
    !Number.isSafeInteger(candidate.height) || candidate.height < 1 || candidate.height > 32_768) return null;

  try {
    if (normalizePublicUrl(candidate.siteUrl) !== candidate.sourceUrl || !/^[a-z0-9-]{1,40}$/.test(config.clientId) ||
      !candidate.objectKey.startsWith(`${config.clientId}/sites/screenshots/`) || !candidate.objectKey.endsWith(".webp") ||
      candidate.objectKey.split("/").some((part) => !part || part === "." || part === "..") ||
      /[\\\u0000-\u0020\u007f]/.test(candidate.objectKey)) return null;
    const base = new URL(config.publicBaseUrl);
    if (base.protocol !== "https:" || base.username || base.password || base.pathname !== "/" || base.search || base.hash) return null;
    const expected = new URL(`/${candidate.objectKey.split("/").map(encodeURIComponent).join("/")}`, base);
    // Compare the stored string, not a normalized URL that could hide traversal or extra credentials.
    if (candidate.publicUrl !== expected.href) return null;
    return { url: expected.href, width: candidate.width, height: candidate.height, capturedAt: candidate.capturedAt.toISOString() };
  } catch {
    return null;
  }
}

export async function getLatestPublicScreenshot(siteId: string): Promise<PublicScreenshot | null> {
  try {
    const env = getEnv();
    if (!env.SCREENSHOTS_ENABLED || !env.R2_PUBLIC_BASE_URL) return null;
    const db = getDb();
    if (!db) return null;
    const now = new Date();
    const rows = await db.select({
      siteUrl: sites.url, isListed: sites.isListed, archivedAt: sites.archivedAt, lifecycle: sites.lifecycle,
      sourceUrl: siteScreenshots.sourceUrl, status: siteScreenshots.status, contentType: siteScreenshots.contentType,
      objectKey: siteScreenshots.objectKey, publicUrl: siteScreenshots.publicUrl,
      width: siteScreenshots.width, height: siteScreenshots.height,
      capturedAt: siteScreenshots.capturedAt, retentionUntil: siteScreenshots.retentionUntil,
    }).from(siteScreenshots).innerJoin(sites, eq(siteScreenshots.siteId, sites.id))
      .where(and(eq(sites.id, siteId), eq(sites.isListed, true), isNull(sites.archivedAt), eq(sites.lifecycle, "active"),
        eq(siteScreenshots.status, "ready"), eq(siteScreenshots.contentType, "image/webp"),
        gt(siteScreenshots.retentionUntil, now), lte(siteScreenshots.capturedAt, new Date(now.getTime() + 60_000))))
      .orderBy(desc(siteScreenshots.capturedAt)).limit(50);
    for (const row of rows) {
      const screenshot = publicScreenshot(row, { publicBaseUrl: env.R2_PUBLIC_BASE_URL, clientId: env.SCREENSHOT_CLIENT_ID }, now);
      if (screenshot) return screenshot;
    }
    return null;
  } catch {
    logger.error({ event: "screenshot.public_lookup_failed", code: "SCREENSHOT_UNAVAILABLE" });
    return null;
  }
}

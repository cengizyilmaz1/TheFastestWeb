import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { sites, siteScreenshots } from "@/db/schema";
import { withApi } from "@/lib/http/api";
import { AppError } from "@/lib/http/errors";
import { assertSameOrigin, readJson } from "@/modules/security/request";
import { enforceRateLimit } from "@/modules/security/rate-limit";
import { scheduleScreenshot } from "@/modules/screenshots/service";

type Context = { params: Promise<{ slug: string }> };
const input = z.object({ device: z.enum(["desktop", "mobile"]).optional(), mode: z.enum(["viewport", "fullpage"]).optional(),
  history: z.enum(["none", "daily", "weekly", "monthly"]).optional() }).strict();
async function publicSite(slug: string) {
  const db = getDb();
  if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Screenshot history is temporarily unavailable.", 503);
  const [site] = await db.select({ id: sites.id, normalizedUrl: sites.normalizedUrl }).from(sites).where(and(eq(sites.slug, slug), eq(sites.isListed, true), eq(sites.lifecycle, "active"), isNull(sites.archivedAt)));
  if (!site) throw new AppError("NOT_FOUND", "Website not found.", 404);
  return { site, db };
}
export const GET = withApi<Context>(async (_request, context) => {
  const { site, db } = await publicSite((await context.params).slug);
  const screenshots = await db.select({ id: siteScreenshots.id, device: siteScreenshots.device, mode: siteScreenshots.mode,
    publicUrl: siteScreenshots.publicUrl, width: siteScreenshots.width, height: siteScreenshots.height, capturedAt: siteScreenshots.capturedAt,
    retentionUntil: siteScreenshots.retentionUntil }).from(siteScreenshots).where(and(eq(siteScreenshots.siteId, site.id), eq(siteScreenshots.sourceUrl, site.normalizedUrl), eq(siteScreenshots.status, "ready"),
    gt(siteScreenshots.retentionUntil, sql`now()`))).orderBy(desc(siteScreenshots.capturedAt)).limit(50);
  return NextResponse.json({ screenshots }, { headers: { "Cache-Control": "no-store" } });
});
export const POST = withApi<Context>(async (request, context) => {
  assertSameOrigin(request);
  const session = await auth();
  if (!session?.user?.id) throw new AppError("UNAUTHORIZED", "Sign in to capture your website.", 401);
  await enforceRateLimit("screenshot-request", session.user.id, 10, 3600);
  const settings = await readJson(request, input);
  const { site } = await publicSite((await context.params).slug);
  const job = await scheduleScreenshot(site.id, session.user.id, settings);
  return NextResponse.json({ jobId: job.id, status: job.status }, { status: 202, headers: { "Cache-Control": "no-store" } });
});

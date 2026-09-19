import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { sites } from "@/db/schema";
import { withApi } from "@/lib/http/api";
import { AppError } from "@/lib/http/errors";
import { assertSameOrigin } from "@/modules/security/request";
import { enforceRateLimit } from "@/modules/security/rate-limit";
import { publicJob, scheduleManualRetest } from "@/modules/jobs/service";

export const POST = withApi(async (request, context: { params: Promise<{ slug: string }> }) => {
  assertSameOrigin(request);
  const session = await auth();
  if (!session?.user?.id) throw new AppError("UNAUTHORIZED", "Sign in to retest your website.", 401);
  const { slug } = await context.params;
  if (!slug || slug.length > 200) throw new AppError("NOT_FOUND", "Website not found.", 404);
  await enforceRateLimit("manual-retest", session.user.id, 10, 3600);
  const db = getDb();
  if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Retesting is temporarily unavailable.", 503);
  const [site] = await db.select({ id: sites.id }).from(sites).where(and(eq(sites.slug, slug), eq(sites.ownerId, session.user.id)));
  if (!site) throw new AppError("NOT_FOUND", "Website not found.", 404);
  const job = await scheduleManualRetest(site.id, session.user.id);
  return NextResponse.json({ job: publicJob(job) }, { status: 202, headers: { "Cache-Control": "no-store", Location: `/api/jobs/${job.id}` } });
});

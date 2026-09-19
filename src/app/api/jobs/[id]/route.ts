import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { backgroundJobs, sites } from "@/db/schema";
import { withApi } from "@/lib/http/api";
import { AppError } from "@/lib/http/errors";
import { publicJob } from "@/modules/jobs/service";

export const GET = withApi(async (_request, context: { params: Promise<{ id: string }> }) => {
  const session = await auth();
  if (!session?.user?.id) throw new AppError("UNAUTHORIZED", "Sign in to view this job.", 401);
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) throw new AppError("NOT_FOUND", "Job not found.", 404);
  const db = getDb();
  if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Jobs are temporarily unavailable.", 503);
  const [row] = await db.select({ job: backgroundJobs }).from(backgroundJobs).innerJoin(sites, eq(backgroundJobs.siteId, sites.id))
    .where(and(eq(backgroundJobs.id, id), eq(sites.ownerId, session.user.id)));
  if (!row) throw new AppError("NOT_FOUND", "Job not found.", 404);
  return NextResponse.json({ job: publicJob(row.job) }, { headers: { "Cache-Control": "no-store" } });
});

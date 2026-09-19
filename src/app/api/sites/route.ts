import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { sites } from "@/db/schema";
import { desc, asc, sql } from "drizzle-orm";
import { publicSiteProjection, publiclyActive } from "@/modules/sites/directory";
import { withApi } from "@/lib/http/api";
import { AppError } from "@/lib/http/errors";
const pagination = z.object({
  offset: z.coerce.number().int().min(0).max(10000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(["score", "loadtime"]).default("score"),
});
export const GET = withApi(async (request) => {
  const parsed = pagination.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) throw new AppError("INVALID_REQUEST", "Invalid pagination or sort.", 400);
  const { offset, limit, sort } = parsed.data;
  const db = getDb();
  if (!db) throw new AppError("DATABASE_UNAVAILABLE", "The directory is temporarily unavailable.", 503);
  // Historic load time is a display string; compare converted milliseconds.
  const loadMs = sql`CASE
    WHEN ${sites.currentLoadTime} ~ '^[0-9]+([.][0-9]+)?ms$' THEN replace(${sites.currentLoadTime}, 'ms', '')::numeric
    WHEN ${sites.currentLoadTime} ~ '^[0-9]+([.][0-9]+)?s$' THEN replace(${sites.currentLoadTime}, 's', '')::numeric * 1000
    ELSE NULL END`;
  const orderBy = sort === "loadtime"
    ? [asc(loadMs), desc(sites.currentScore), asc(sites.createdAt), asc(sites.id)]
    : [desc(sites.currentScore), asc(loadMs), asc(sites.createdAt), asc(sites.id)];
  const rows = await db.select(publicSiteProjection).from(sites).where(publiclyActive()).orderBy(...orderBy).offset(offset).limit(limit);
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(sites).where(publiclyActive());
  return NextResponse.json({ sites: rows, total: count, hasMore: offset + rows.length < count });
});

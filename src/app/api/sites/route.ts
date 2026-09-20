import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { sites } from "@/db/schema";
import { sql } from "drizzle-orm";
import { publiclyActive } from "@/modules/sites/directory";
import { legacyLeaderboardOrder, legacyLeaderboardProjection } from "@/modules/sites/legacy-view";
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
  const rows = await db.select(legacyLeaderboardProjection).from(sites).where(publiclyActive()).orderBy(...legacyLeaderboardOrder(sort)).offset(offset).limit(limit);
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(sites).where(publiclyActive());
  return NextResponse.json({ sites: rows, total: count, hasMore: offset + rows.length < count });
});

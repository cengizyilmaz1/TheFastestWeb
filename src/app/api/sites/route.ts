import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/index";
import { sites } from "@/db/schema";
import { desc, asc, eq, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const offset = parseInt(request.nextUrl.searchParams.get("offset") || "0");
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "20");
  const sort = request.nextUrl.searchParams.get("sort") || "score";

  const db = getDb();
  if (!db) {
    return NextResponse.json({ sites: [], total: 0, hasMore: false });
  }

  try {
    const orderBy =
      sort === "loadtime"
        ? [asc(sites.currentLoadTime), desc(sites.currentScore), asc(sites.createdAt)]
        : [desc(sites.currentScore), asc(sites.currentLoadTime), asc(sites.createdAt)];

    const rows = await db
      .select()
      .from(sites)
      .where(eq(sites.isListed, true))
      .orderBy(...orderBy)
      .offset(offset)
      .limit(limit);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(sites)
      .where(eq(sites.isListed, true));

    return NextResponse.json({
      sites: rows,
      total: count,
      hasMore: offset + limit < count,
    });
  } catch (err) {
    console.error("DB read failed:", err);
    return NextResponse.json({ sites: [], total: 0, hasMore: false });
  }
}

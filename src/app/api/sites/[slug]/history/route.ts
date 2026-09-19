import { NextResponse } from "next/server";
import { and, asc, eq, gte } from "drizzle-orm";
import { getDb } from "@/db";
import { sites, speedTests } from "@/db/schema";
import { auth } from "@/auth";
import { withApi } from "@/lib/http/api";
import { AppError } from "@/lib/http/errors";

export const GET = withApi(async (request, { params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = await params;
  const period = request.nextUrl.searchParams.get("period") || "30d";
  const days = { "7d": 7, "30d": 30, "90d": 90, "1y": 365, "365d": 365 }[period];
  if (!days) throw new AppError("INVALID_REQUEST", "Choose a supported history period.", 400);
  const db = getDb();
  if (!db) throw new AppError("DATABASE_UNAVAILABLE", "History is temporarily unavailable.", 503);
  const [site] = await db.select({ id: sites.id, isListed: sites.isListed, ownerId: sites.ownerId }).from(sites).where(eq(sites.slug, slug)).limit(1);
  if (!site || (!site.isListed && (await auth())?.user?.id !== site.ownerId)) throw new AppError("NOT_FOUND", "Website not found.", 404);
  const data = await db.select({
    score: speedTests.score, testedAt: speedTests.testedAt,
    strategy: speedTests.strategy, methodologyVersion: speedTests.methodologyVersion,
  }).from(speedTests).where(and(eq(speedTests.siteId, site.id), gte(speedTests.testedAt, new Date(Date.now() - days * 86_400_000))))
    .orderBy(asc(speedTests.testedAt), asc(speedTests.id)).limit(5000);
  return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
});

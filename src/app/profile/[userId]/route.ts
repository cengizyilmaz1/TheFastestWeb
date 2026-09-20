import { after, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { founders } from "@/db/schema";
import { getEnv } from "@/config/env";
import { getFounderPath } from "@/modules/founders/paths";
import { initializeOwnFounder } from "@/modules/founders/usernames";
import { prepareRedirectObservation, recordRedirectObservation } from "@/modules/redirects/statistics";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const headers = { "Cache-Control": "private, no-store, max-age=0", "X-Robots-Tag": "noindex, follow", "Referrer-Policy": "no-referrer" };
  if (!z.uuid().safeParse(userId).success) return new NextResponse(null, { status: 404, headers });
  const db = getDb();
  if (!db) return new NextResponse(null, { status: 503, headers });
  const session = await auth();
  let [profile] = await db.select({ id: founders.id, slug: founders.slug, visibility: founders.visibility }).from(founders).where(eq(founders.userId, userId));
  if (!profile && session?.user?.id === userId) profile = await initializeOwnFounder(userId);
  if (!profile || profile.visibility !== "public" && session?.user?.id !== userId) return new NextResponse(null, { status: 404, headers });
  if (profile.visibility === "public") {
    const observation = prepareRedirectObservation(request, { kind: "founder", founderId: profile.id, sourcePath: "/profile/[account-id]" });
    if (observation) {
      try { after(() => recordRedirectObservation(observation)); } catch { /* Measurement must never prevent a redirect. */ }
    }
  }
  return NextResponse.redirect(new URL(getFounderPath(profile.slug), getEnv().SITE_URL), { status: 301, headers });
}

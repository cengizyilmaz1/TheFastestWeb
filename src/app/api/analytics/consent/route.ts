import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { checkoutOrders } from "@/db/schema";
import { withApi } from "@/lib/http/api";
import { AppError } from "@/lib/http/errors";
import { assertSameOrigin, readJson } from "@/modules/security/request";

export const POST = withApi(async (request) => {
  assertSameOrigin(request);
  const { granted } = await readJson(request, z.object({ granted: z.boolean() }).strict(), 512);
  const session = await auth();
  if (!granted && session?.user?.id) {
    const db = getDb();
    if (!db) throw new AppError("DATABASE_UNAVAILABLE", "The account consent setting could not be saved. Please retry.", 503);
    await db.update(checkoutOrders).set({ productSnapshot: sql`jsonb_set(${checkoutOrders.productSnapshot} - 'analyticsVisitorId','{analyticsConsent}','false'::jsonb)`, updatedAt: sql`now()` })
      .where(eq(checkoutOrders.userId, session.user.id));
  }
  // Grants apply only to future checkout snapshots. Never backfill old purchases.
  return NextResponse.json({ saved: true }, { headers: { "Cache-Control": "no-store" } });
});

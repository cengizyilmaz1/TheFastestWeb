import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { and, eq, gt, gte, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { adSlots, adClicks } from "@/db/schema";
import { getEnv } from "@/config/env";
import { withApi } from "@/lib/http/api";
import { AppError } from "@/lib/http/errors";
import { assertSameOrigin, readJson } from "@/modules/security/request";
import { enforceRateLimit } from "@/modules/security/rate-limit";
import { recordAnalyticsEvent } from "@/modules/analytics/events";

export const POST = withApi(async (request) => {
  assertSameOrigin(request);
  const { id } = await readJson(request, z.object({ id: z.number().int().positive() }).strict(), 1024);
  await enforceRateLimit("ad-click-global", "all", 1000, 3600);
  const db = getDb(), secret = getEnv().AUTH_SECRET;
  if (!db || !secret) throw new AppError("SERVICE_UNAVAILABLE", "Click tracking is temporarily unavailable.", 503);
  // This pseudonym reduces retained data. Forwarded addresses are NOT an auth boundary.
  const day = new Date().toISOString().slice(0, 10);
  const ip = (request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown").trim().slice(0, 64);
  const pseudonym = createHmac("sha256", secret).update(day + "\0" + ip).digest("hex");
  const deduped = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"click:" + id + ":" + pseudonym}, 0))`);
    const [slot] = await tx.select({ id: adSlots.id, position: adSlots.position }).from(adSlots).where(and(eq(adSlots.id, id), eq(adSlots.isActive, true),
      eq(adSlots.status, "active"), or(isNull(adSlots.expiresAt), gt(adSlots.expiresAt, sql`now()`)))).limit(1).for("share");
    if (!slot) throw new AppError("NOT_FOUND", "Advertisement not found.", 404);
    const [existing] = await tx.select({ id: adClicks.id }).from(adClicks).where(and(eq(adClicks.adSlotId, id), eq(adClicks.ip, pseudonym), gte(adClicks.clickedAt, new Date(Date.now() - 3_600_000)))).limit(1);
    if (existing) return true;
    const [click] = await tx.insert(adClicks).values({ adSlotId: id, ip: pseudonym }).returning({ id: adClicks.id });
    await recordAnalyticsEvent({ name: "ad_clicked", eventKey: `ad-click:${click.id}`, properties: { placement: slot.position } }, tx);
    return false;
  });
  return NextResponse.json({ ok: true, deduped }, { headers: { "Cache-Control": "no-store" } });
});

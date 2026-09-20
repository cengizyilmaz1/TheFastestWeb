import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { sites } from "@/db/schema";
import { getEnv } from "@/config/env";
import { withApi } from "@/lib/http/api";
import { AppError } from "@/lib/http/errors";
import { assertSameOrigin, readJson } from "@/modules/security/request";
import { enforceRateLimit } from "@/modules/security/rate-limit";
import { recordAnalyticsEvent } from "@/modules/analytics/events";
import { clickPseudonym, skipClickObservation } from "@/modules/analytics/click-observation";

export const POST = withApi(async (request) => {
  assertSameOrigin(request);
  const { id } = await readJson(request, z.object({ id: z.uuid() }).strict(), 1024);
  if (skipClickObservation(request.headers)) return NextResponse.json({ ok: true, ignored: true }, { headers: { "Cache-Control": "no-store" } });
  await enforceRateLimit("site-click-global", "all", 1000, 3600);
  const db = getDb(), secret = getEnv().AUTH_SECRET;
  if (!db || !secret) throw new AppError("SERVICE_UNAVAILABLE", "Click tracking is temporarily unavailable.", 503);
  const pseudonym = clickPseudonym(request.headers, secret);
  await enforceRateLimit("site-click-visitor", pseudonym, 60, 3600);
  const result = await db.transaction(async tx => {
    const [site] = await tx.select({ id: sites.id }).from(sites).where(and(eq(sites.id, id), eq(sites.isListed, true),
      isNull(sites.archivedAt), inArray(sites.lifecycle, ["active", "verified", "unreachable", "redirected", "parked"]))).limit(1).for("share");
    if (!site) throw new AppError("NOT_FOUND", "Website not found.", 404);
    // A unique event key bounds observations per site, daily pseudonym and UTC
    // hour even under concurrency. Browser input cannot choose the event name.
    const hour = Math.floor(Date.now() / 3_600_000);
    return recordAnalyticsEvent({ name: "site_clicked", siteId: id, eventKey: `site-click:${id}:${hour}:${pseudonym}`,
      properties: { placement: "product" } }, tx);
  });
  return NextResponse.json({ ok: true, deduped: !result.recorded }, { headers: { "Cache-Control": "no-store" } });
});

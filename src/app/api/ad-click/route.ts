import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/index";
import { adSlots, adClicks } from "@/db/schema";
import { eq, and, gte } from "drizzle-orm";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const id = body?.id;

  if (!id || isNaN(Number(id))) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const db = getDb();
  if (!db) return NextResponse.json({ ok: false }, { status: 500 });

  try {
    const [slot] = await db
      .select({ id: adSlots.id })
      .from(adSlots)
      .where(eq(adSlots.id, Number(id)))
      .limit(1);

    if (!slot) return NextResponse.json({ error: "not found" }, { status: 404 });

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      request.headers.get("x-real-ip") ||
      null;

    // Deduplicate: same IP + same slot within 1 hour
    if (ip) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const [existing] = await db
        .select({ id: adClicks.id })
        .from(adClicks)
        .where(
          and(
            eq(adClicks.adSlotId, slot.id),
            eq(adClicks.ip, ip),
            gte(adClicks.clickedAt, oneHourAgo)
          )
        )
        .limit(1);

      if (existing) return NextResponse.json({ ok: true, deduped: true });
    }

    await db.insert(adClicks).values({
      adSlotId: slot.id,
      ip,
      userAgent: request.headers.get("user-agent") || null,
      referrer: request.headers.get("referer") || null,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[ad-click] error:", e);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}

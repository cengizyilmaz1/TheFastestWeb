import { NextRequest, NextResponse } from "next/server";
import { validateEvent } from "@polar-sh/sdk/webhooks";
import { getDb } from "@/db/index";
import { users, sites, payments, adSlots } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sendEmail } from "@/lib/email/send";
import { proUpgradeEmail, adSlotConfirmationEmail } from "@/lib/email/templates";

const POLAR_WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET || "";
const PRO_PRODUCT_ID = process.env.POLAR_PRO_PRODUCT_ID || "";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  let event;
  try {
    event = validateEvent(body, headers, POLAR_WEBHOOK_SECRET);
  } catch (err) {
    console.log("[webhook] Invalid signature:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  console.log(`[webhook] Received event: ${event.type}`);

  const db = getDb();
  if (!db) {
    console.log("[webhook] DB not configured");
    return NextResponse.json({ error: "DB not configured" }, { status: 500 });
  }

  // Handle Pro upgrade payment (one-time)
  if (event.type === "order.paid") {
    const order = event.data;
    const userId = order.metadata?.user_id as string | undefined;
    console.log(`[webhook] order.paid — productId: ${order.productId}, userId: ${userId}, expected PRO_PRODUCT_ID: ${PRO_PRODUCT_ID}`);

    if (order.productId === PRO_PRODUCT_ID && userId) {
      // 1. Mark user as Pro
      await db
        .update(users)
        .set({ isPro: true })
        .where(eq(users.id, userId));

      // 2. Upgrade all their sites to pro tier (dofollow + unlimited tracking)
      await db
        .update(sites)
        .set({ tier: "pro" })
        .where(eq(sites.ownerId, userId));

      // 3. Record payment
      const userSites = await db
        .select({ id: sites.id })
        .from(sites)
        .where(eq(sites.ownerId, userId))
        .limit(1);

      if (userSites.length > 0) {
        await db.insert(payments).values({
          siteId: userSites[0].id,
          userId,
          polarCheckoutId: order.checkoutId,
          amountCents: order.totalAmount,
          status: "completed",
        });
      }

      console.log(`[webhook] Pro upgrade completed for user: ${userId}`);

      // Send Pro upgrade email
      const [dbUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      console.log(`[webhook] User for email: ${dbUser?.email || "NOT FOUND"}`);
      if (dbUser?.email) {
        const mail = proUpgradeEmail(dbUser.name || "there");
        const result = await sendEmail(dbUser.email, mail.subject, mail.html);
        console.log(`[webhook] Pro email result:`, result);
      }
    } else {
      console.log(`[webhook] order.paid skipped — productId mismatch or no userId`);
    }
  }

  // Handle ad slot subscription activated
  if (event.type === "subscription.active") {
    const sub = event.data;
    const meta = sub.metadata as Record<string, string> | undefined;
    console.log(`[webhook] subscription.active — meta:`, JSON.stringify(meta));

    if (meta?.type === "ad_slot") {
      // Find next available slot position
      const activeAds = await db
        .select({ position: adSlots.position, orderIndex: adSlots.orderIndex })
        .from(adSlots)
        .where(eq(adSlots.isActive, true));

      const taken = new Set(
        activeAds.map((a) => `${a.position}-${a.orderIndex}`)
      );

      const preferred = meta.preferred_position as "left" | "right" | undefined;

      // Try preferred side first, then fall back to other side
      let position: "left" | "right" = "left";
      let orderIndex = 0;
      let found = false;

      const searchOrder: ("left" | "right")[] = preferred
        ? [preferred, preferred === "left" ? "right" : "left"]
        : ["left", "right"];

      for (const pos of searchOrder) {
        for (let i = 0; i < 5; i++) {
          if (!taken.has(`${pos}-${i}`)) {
            position = pos;
            orderIndex = i;
            found = true;
            break;
          }
        }
        if (found) break;
      }

      if (found) {
        await db.insert(adSlots).values({
          position,
          orderIndex,
          name: meta.name,
          tagline: meta.tagline,
          url: meta.url,
          faviconUrl: meta.favicon_url || null,
          userId: meta.user_id || null,
          polarSubscriptionId: sub.id,
          isActive: true,
        });

        console.log(`[webhook] Ad slot created: ${meta.name} at ${position}-${orderIndex}`);

        // Send ad slot confirmation email (only if we have a user_id)
        if (meta.user_id) {
          const [adUser] = await db.select().from(users).where(eq(users.id, meta.user_id)).limit(1);
          console.log(`[webhook] Ad user for email: ${adUser?.email || "NOT FOUND"}`);
          if (adUser?.email) {
            const mail = adSlotConfirmationEmail(adUser.name || "there", meta.name, meta.tagline);
            const result = await sendEmail(adUser.email, mail.subject, mail.html);
            console.log(`[webhook] Ad email result:`, result);
          }
        }
      } else {
        console.log("[webhook] No available ad slots for subscription:", sub.id);
      }
    }
  }

  // Handle ad slot subscription canceled (still active until period end)
  if (event.type === "subscription.canceled") {
    const sub = event.data;
    const meta = sub.metadata as Record<string, string> | undefined;

    if (meta?.type === "ad_slot") {
      // Set expiration to current period end
      const periodEnd = sub.currentPeriodEnd
        ? new Date(sub.currentPeriodEnd)
        : new Date();

      await db
        .update(adSlots)
        .set({ expiresAt: periodEnd })
        .where(eq(adSlots.polarSubscriptionId, sub.id));

      console.log(
        `Ad slot subscription canceled, expires: ${periodEnd.toISOString()}`
      );
    }
  }

  // Handle ad slot subscription revoked (immediate removal)
  if (event.type === "subscription.revoked") {
    const sub = event.data;
    const meta = sub.metadata as Record<string, string> | undefined;

    if (meta?.type === "ad_slot") {
      await db
        .update(adSlots)
        .set({ isActive: false })
        .where(eq(adSlots.polarSubscriptionId, sub.id));

      console.log(`Ad slot subscription revoked: ${sub.id}`);
    }
  }

  return NextResponse.json({ received: true });
}

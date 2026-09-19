import { NextRequest, NextResponse } from "next/server";
import { Polar } from "@polar-sh/sdk";
import { getDb } from "@/db/index";
import { adSlots } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

const polar = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN,
  server: (process.env.POLAR_SERVER as "sandbox" | "production") || "sandbox",
});

export async function POST(request: NextRequest) {
  const AD_PRODUCT_ID = process.env.POLAR_AD_PRODUCT_ID;
  if (!AD_PRODUCT_ID) {
    return NextResponse.json(
      { error: "Ad payments not configured" },
      { status: 500 }
    );
  }

  const body = await request.json();
  const { name, tagline, url, preferredPosition } = body;

  if (!name || !tagline || !url) {
    return NextResponse.json(
      { error: "Name, tagline, and URL are required" },
      { status: 400 }
    );
  }

  // Check total active ad slots (max 10)
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "DB not configured" }, { status: 500 });
  }

  const activeCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(adSlots)
    .where(eq(adSlots.isActive, true));

  if (Number(activeCount[0].count) >= 10) {
    return NextResponse.json(
      { error: "All ad slots are currently taken. Please try again later." },
      { status: 400 }
    );
  }

  const origin = request.nextUrl.origin;

  // Build favicon URL from the provided website URL
  let domain = url;
  try {
    domain = new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
  } catch {
    // keep as-is
  }
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

  const checkout = await polar.checkouts.create({
    products: [AD_PRODUCT_ID],
    successUrl: `${origin}/?ad_success=1`,
    metadata: {
      type: "ad_slot",
      name,
      tagline,
      url: url.startsWith("http") ? url : `https://${url}`,
      favicon_url: faviconUrl,
      ...(preferredPosition ? { preferred_position: preferredPosition } : {}),
    },
  });

  return NextResponse.json({ url: checkout.url });
}

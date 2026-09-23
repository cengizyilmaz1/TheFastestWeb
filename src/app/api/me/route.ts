import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { hasAccountProAccess } from "@/modules/payments/entitlements";

export async function GET() {
  const user = await getCurrentUser();
  const options = { headers: { "Cache-Control": "private, no-store" } };
  if (!user) return NextResponse.json({ isPro: false, authenticated: false }, options);
  return NextResponse.json({ isPro: await hasAccountProAccess(user.id, user.isPro), authenticated: true, twitterHandle: user.twitterHandle }, options);
}

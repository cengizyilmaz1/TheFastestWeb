import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { hasAccountProAccess } from "@/modules/payments/entitlements";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ isPro: false, authenticated: false });
  return NextResponse.json({ isPro: await hasAccountProAccess(user.id, user.isPro), authenticated: true });
}

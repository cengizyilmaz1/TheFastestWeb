import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ isPro: false, authenticated: false });
  return NextResponse.json({ isPro: user.isPro, authenticated: true });
}

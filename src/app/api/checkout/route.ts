import { NextRequest, NextResponse } from "next/server";
import { Polar } from "@polar-sh/sdk";
import { auth } from "@/auth";
import { getCurrentUser } from "@/lib/auth";

const polar = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN,
  server: (process.env.POLAR_SERVER as "sandbox" | "production") || "sandbox",
});

export async function POST(request: NextRequest) {
  const PRO_PRODUCT_ID = process.env.POLAR_PRO_PRODUCT_ID;
  if (!PRO_PRODUCT_ID) {
    return NextResponse.json({ error: "Payment not configured" }, { status: 500 });
  }

  // Require authentication
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }

  // Check if already Pro
  const dbUser = await getCurrentUser();
  if (dbUser?.isPro) {
    return NextResponse.json({ error: "You are already a Pro member" }, { status: 400 });
  }

  const body = await request.json();
  if (body.product !== "pro") {
    return NextResponse.json({ error: "Invalid product" }, { status: 400 });
  }

  const origin = request.nextUrl.origin;

  const checkout = await polar.checkouts.create({
    products: [PRO_PRODUCT_ID],
    customerEmail: session.user.email || undefined,
    successUrl: `${origin}/submit?upgraded=1`,
    metadata: {
      user_id: session.user.id,
    },
  });

  return NextResponse.json({ url: checkout.url });
}

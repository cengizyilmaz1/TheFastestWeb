import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { withApi } from "@/lib/http/api";
import { AppError } from "@/lib/http/errors";
import { getOwnedCheckout } from "@/modules/payments/service";

export const GET = withApi(async (_request, context: { params: Promise<{ id: string }> }) => {
  const session = await auth();
  if (!session?.user?.id) throw new AppError("UNAUTHORIZED", "Sign in to view your checkout.", 401);
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) throw new AppError("NOT_FOUND", "Checkout not found.", 404);
  return NextResponse.json({ order: await getOwnedCheckout(id, session.user.id) }, { headers: { "Cache-Control": "no-store" } });
});

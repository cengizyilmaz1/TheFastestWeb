import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { withApi } from "@/lib/http/api";
import { AppError } from "@/lib/http/errors";
import { assertSameOrigin, readJson } from "@/modules/security/request";
import { enforceRateLimit } from "@/modules/security/rate-limit";
import { createCheckout } from "@/modules/payments/service";

export const POST = withApi(async (request) => {
  assertSameOrigin(request);
  const session = await auth();
  if (!session?.user?.id) throw new AppError("UNAUTHORIZED", "Sign in to purchase a product.", 401);
  await enforceRateLimit("checkout", session.user.id, 10, 3600);
  const input = await readJson(request, z.object({ productKey: z.string().regex(/^[a-z0-9_-]{1,80}$/),
    siteId: z.uuid().optional(), idempotencyKey: z.uuid() }).strict(), 2048);
  return NextResponse.json(await createCheckout({ ...input, userId: session.user.id }), { headers: { "Cache-Control": "no-store" } });
});

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { withApi } from "@/lib/http/api";
import { AppError } from "@/lib/http/errors";
import { assertSameOrigin, readJson } from "@/modules/security/request";
import { enforceRateLimit } from "@/modules/security/rate-limit";
import { getNotificationPreferences, updateNotificationPreferences } from "@/modules/notifications/service";

async function currentUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new AppError("UNAUTHORIZED", "Sign in to manage notifications.", 401);
  return session.user.id;
}
export const GET = withApi(async () => NextResponse.json({ preferences: await getNotificationPreferences(await currentUserId()) }, { headers: { "Cache-Control": "no-store" } }));
export const PATCH = withApi(async (request) => {
  assertSameOrigin(request);
  const userId = await currentUserId();
  await enforceRateLimit("notification-preferences", userId, 30, 3600);
  const preferences = await readJson(request, z.object({ marketing: z.boolean().optional(), performance: z.boolean().optional(),
    weekly: z.boolean().optional(), badge: z.boolean().optional() }).strict().refine((value) => Object.keys(value).length > 0), 1024);
  return NextResponse.json({ preferences: await updateNotificationPreferences(userId, preferences) }, { headers: { "Cache-Control": "no-store" } });
});

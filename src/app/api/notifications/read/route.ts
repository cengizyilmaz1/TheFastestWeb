import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { notifications } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { withApi } from "@/lib/http/api";
import { AppError } from "@/lib/http/errors";
import { readJson } from "@/modules/security/request";
import { enforceRateLimit } from "@/modules/security/rate-limit";

export const POST = withApi(async (request) => {
  const user = await requireUser(request);
  await enforceRateLimit("notification-read", user.id, 60, 60);
  const { id } = await readJson(request, z.object({ id: z.uuid() }).strict(), 1024);
  const db = getDb();
  if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Notifications are temporarily unavailable.", 503);
  const [row] = await db.update(notifications).set({ readAt: sql`COALESCE(${notifications.readAt},now())` })
    .where(and(eq(notifications.id, id), eq(notifications.userId, user.id))).returning({ id: notifications.id });
  if (!row) throw new AppError("NOT_FOUND", "Notification not found.", 404);
  return NextResponse.json({ read: true }, { headers: { "Cache-Control": "no-store" } });
});

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { adminRoles } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/http/errors";

export type AdminActor = { userId: string; role: "admin" | "moderator" };
export async function requireAdmin(request?: Request): Promise<AdminActor> {
  const user = await requireUser(request);
  const db = getDb();
  if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Administration is temporarily unavailable.", 503);
  const [grant] = await db.select().from(adminRoles).where(eq(adminRoles.userId, user.id));
  if (!grant) throw new AppError("FORBIDDEN", "Administrator access is required.", 403);
  return { userId: user.id, role: grant.role };
}

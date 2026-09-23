import { auth } from "@/auth";
import { cache } from "react";
import { getDb } from "@/db/index";
import { users, User } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/infrastructure/logging/logger";
import { AppError } from "@/lib/http/errors";
import { assertSameOrigin } from "@/modules/security/request";

export async function requireUser(request?: Request): Promise<User> {
  if (request) assertSameOrigin(request);
  const user = await getCurrentUser();
  if (!user) throw new AppError("UNAUTHORIZED", "Sign in to continue.", 401);
  return user;
}

// React scopes this memoization to one server render. Layout and page share a
// lookup without retaining account/permission data across separate requests.
export const getCurrentUser = cache(async (): Promise<User | null> => {
  // Next's cookies/headers access can throw its prerender control-flow signal.
  // Let that reach Next; only database failures become our public service error.
  const session = await auth();
  if (!session?.user?.id) return null;

  const db = getDb();
  if (!db) return null;

  try {
    const [dbUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    return dbUser || null;
  } catch {
    logger.error({ event: "auth.user_lookup_failed", code: "DATABASE_UNAVAILABLE" });
    throw new AppError("DATABASE_UNAVAILABLE", "Your account is temporarily unavailable. Please try again.", 503);
  }
});

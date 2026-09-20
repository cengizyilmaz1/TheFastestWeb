import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { AppError } from "@/lib/http/errors";
import { enqueueNotification } from "@/modules/notifications/service";

/** Email is accepted only from Google's verified OAuth profile. Never recreate restored IDs. */
export async function synchronizeGoogleUser(profile: { email: string; name?: string | null; image?: string | null }): Promise<string> {
  const db = getDb();
  if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Sign-in is temporarily unavailable.", 503);
  const email = profile.email.trim().toLowerCase();
  const name = (profile.name?.trim() || email.split("@")[0]).slice(0, 200);
  const avatarUrl = profile.image?.startsWith("https://") ? profile.image : null;
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`auth:${email}`}, 0))`);
    const [existing] = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
    if (existing) {
      await tx.update(users).set({ name, avatarUrl }).where(eq(users.id, existing.id));
      return existing.id;
    }
    const id = randomUUID();
    await tx.insert(users).values({ id, email, name, avatarUrl });
    await enqueueNotification({ userId: id, type: "welcome", eventKey: `user:${id}:welcome`,
      variables: { name: name.slice(0, 120), actionPath: "/submit" } }, tx);
    return id;
  });
}

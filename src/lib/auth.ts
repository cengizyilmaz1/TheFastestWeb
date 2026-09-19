import { auth } from "@/auth";
import { getDb } from "@/db/index";
import { users, User } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function getCurrentUser(): Promise<User | null> {
  try {
    const session = await auth();
    if (!session?.user?.id) return null;

    const db = getDb();
    if (!db) return null;

    const [dbUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    return dbUser || null;
  } catch {
    return null;
  }
}

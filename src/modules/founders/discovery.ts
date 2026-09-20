import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { founders } from "@/db/schema";
import { AppError } from "@/lib/http/errors";
function database() { const db = getDb(); if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Profiles are temporarily unavailable.", 503); return db; }
export async function countPublicFounders(): Promise<number> {
  const [row] = await database().select({ count: sql<number>`count(*)::int` }).from(founders).where(eq(founders.visibility, "public"));
  return row.count;
}
export async function listPublicFounderDiscovery(limit: number, offset: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 200 || !Number.isInteger(offset) || offset < 0) throw new AppError("INVALID_REQUEST", "Invalid profile pagination.", 400);
  return database().select({ username: founders.slug, name: founders.name, bio: founders.bio, updatedAt: founders.updatedAt })
    .from(founders).where(eq(founders.visibility, "public")).orderBy(asc(founders.slug), asc(founders.id)).limit(limit).offset(offset);
}


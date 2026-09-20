import { asc, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { sites } from "@/db/schema";
import { AppError } from "@/lib/http/errors";
import { publiclyActive } from "@/modules/sites/directory";

export const discoveryPageSize = 200;
export type PublicSiteRecord = {
  slug: string; name: string; url: string; description: string; tagline: string | null;
  category: string; countryCode: string | null; currentScore: number;
  lastTestedAt: Date | null; createdAt: Date;
};

export async function withDiscoveryAvailability<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    if (error instanceof AppError && error.status < 500) throw error;
    throw new AppError("DATABASE_UNAVAILABLE", "Public discovery is temporarily unavailable.", 503);
  }
}

function database() {
  const db = getDb();
  if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Public discovery is temporarily unavailable.", 503);
  return db;
}

export function discoveryOffset(page: number): number {
  if (!Number.isSafeInteger(page) || page < 0 || page > Math.floor(Number.MAX_SAFE_INTEGER / discoveryPageSize)) {
    throw new AppError("NOT_FOUND", "Public document not found.", 404);
  }
  return page * discoveryPageSize;
}

export async function countPublicSites(): Promise<number> {
  return withDiscoveryAvailability(async () => {
    const [row] = await database().select({ count: sql<number>`count(*)::int` }).from(sites).where(publiclyActive());
    return row.count;
  });
}

/** Explicit public projection: account IDs, email, claims and billing never enter exports. */
export async function listPublicSiteRecords(page: number): Promise<PublicSiteRecord[]> {
  const offset = discoveryOffset(page);
  return withDiscoveryAvailability(async () => database().select({
    slug: sites.slug, name: sites.name, url: sites.url, description: sites.description, tagline: sites.tagline,
    category: sites.category, countryCode: sites.countryCode, currentScore: sites.currentScore,
    lastTestedAt: sites.lastTestedAt, createdAt: sites.createdAt,
  }).from(sites).where(publiclyActive()).orderBy(asc(sites.id)).limit(discoveryPageSize).offset(offset));
}

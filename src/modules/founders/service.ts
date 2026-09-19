import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { countries, founders, founderSites, founderSocialLinks, sites, users } from "@/db/schema";
import { AppError } from "@/lib/http/errors";
import { normalizePublicUrl } from "@/lib/security/public-url";
import { readFounderInsights } from "./insights";

const publicUrl = z.string().max(4096).transform((value, ctx) => {
  try { return normalizePublicUrl(value); }
  catch { ctx.addIssue({ code: "custom", message: "Enter a public HTTP or HTTPS URL." }); return z.NEVER; }
});
export const founderProfileSchema = z.object({
  slug: z.string().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(1).max(100),
  bio: z.string().trim().max(1000).nullable().optional(),
  avatarUrl: publicUrl.nullable().optional(),
  websiteUrl: publicUrl.nullable().optional(),
  countryCode: z.string().regex(/^[A-Z]{2}$/).nullable().optional(),
  visibility: z.enum(["public", "private"]).default("private"),
  socialLinks: z.array(z.object({ platform: z.string().regex(/^[a-z0-9-]{1,32}$/), url: publicUrl }).strict()).max(10)
    .refine((links) => new Set(links.map((link) => link.platform)).size === links.length).default([]),
}).strict();

function database() {
  const db = getDb();
  if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Profiles are temporarily unavailable.", 503);
  return db;
}

export async function saveFounderProfile(userId: string, raw: unknown) {
  const input = founderProfileSchema.parse(raw);
  return database().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"founder-user:" + userId},0))`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"founder-slug:" + input.slug},0))`);
    const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId));
    if (!user) throw new AppError("UNAUTHORIZED", "Please sign in again.", 401);
    const [sameSlug] = await tx.select({ userId: founders.userId }).from(founders).where(eq(founders.slug, input.slug));
    if (sameSlug && sameSlug.userId !== userId) throw new AppError("CONFLICT", "This profile URL is already in use.", 409);
    if (input.countryCode) {
      const [country] = await tx.select({ code: countries.code }).from(countries).where(eq(countries.code, input.countryCode));
      if (!country) throw new AppError("INVALID_REQUEST", "Choose a supported ISO country code.", 400);
    }
    const { socialLinks, ...profile } = input;
    const [founder] = await tx.insert(founders).values({ ...profile, userId }).onConflictDoUpdate({
      target: founders.userId, set: { ...profile, updatedAt: sql`now()` },
    }).returning();
    await tx.delete(founderSocialLinks).where(eq(founderSocialLinks.founderId, founder.id));
    if (socialLinks.length) await tx.insert(founderSocialLinks).values(socialLinks.map((link) => ({ founderId: founder.id, ...link })));
    return founder;
  });
}

export async function getOwnFounder(userId: string) {
  const db = database();
  const [profile] = await db.select().from(founders).where(eq(founders.userId, userId));
  if (!profile) return null;
  const links = await db.select({ platform: founderSocialLinks.platform, url: founderSocialLinks.url }).from(founderSocialLinks)
    .where(eq(founderSocialLinks.founderId, profile.id)).orderBy(asc(founderSocialLinks.platform));
  return { ...profile, socialLinks: links };
}

export async function getPublicFounder(slug: string, strategy: "mobile" | "desktop" = "mobile") {
  return database().transaction(async (db) => {
  // Explicit projection: account UUID/email are never part of a public profile.
  const [profile] = await db.select({ id: founders.id, slug: founders.slug, name: founders.name,
    avatarUrl: founders.avatarUrl, bio: founders.bio, countryCode: founders.countryCode,
    websiteUrl: founders.websiteUrl, createdAt: founders.createdAt }).from(founders)
    .where(and(eq(founders.slug, slug), eq(founders.visibility, "public")));
  if (!profile) return null;
  const [socialLinks, websiteRows, insights] = await Promise.all([
    db.select({ platform: founderSocialLinks.platform, url: founderSocialLinks.url }).from(founderSocialLinks)
      .where(eq(founderSocialLinks.founderId, profile.id)).orderBy(asc(founderSocialLinks.platform)),
    db.select({ id: sites.id, slug: sites.slug, name: sites.name, url: sites.url, currentScore: sites.currentScore, faviconUrl: sites.faviconUrl })
      .from(founderSites).innerJoin(sites, eq(sites.id, founderSites.siteId)).where(and(eq(founderSites.founderId, profile.id),
        eq(sites.isListed, true), eq(sites.lifecycle, "active"), isNull(sites.archivedAt))).orderBy(asc(sites.slug)).limit(100),
    readFounderInsights(db, profile.id, strategy),
  ]);
  return { ...profile, socialLinks, sites: websiteRows, insights };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

/** Users may attribute their own profile to their own website; no cross-account attribution without consent. */
export async function linkFounderSite(userId: string, founderId: string, siteId: string) {
  return database().transaction(async (tx) => {
    const [site] = await tx.select({ id: sites.id }).from(sites).where(and(eq(sites.id, siteId), eq(sites.ownerId, userId))).for("share");
    const [founder] = await tx.select({ id: founders.id }).from(founders).where(and(eq(founders.id, founderId), eq(founders.userId, userId))).for("share");
    if (!site || !founder) throw new AppError("NOT_FOUND", "Website or profile not found.", 404);
    await tx.insert(founderSites).values({ siteId, founderId }).onConflictDoNothing();
    return { siteId, founderId };
  });
}

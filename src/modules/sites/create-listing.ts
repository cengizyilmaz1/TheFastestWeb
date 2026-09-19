import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { sites, speedTests, users, verifiedSpeedTests } from "@/db/schema";
import { getVerifiedBadge } from "@/infrastructure/browser/badge-verification";
import { AppError } from "@/lib/http/errors";
import { slugify } from "@/lib/utils";
import { normalizeSubmittedUrl, type SubmissionInput } from "./input";

export async function createListing(userId: string, input: SubmissionInput) {
  const db = getDb();
  if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Submissions are temporarily unavailable.", 503);
  const url = normalizeSubmittedUrl(input.url);
  const slug = slugify(input.name);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new AppError("INVALID_REQUEST", "Choose a name containing letters or numbers.", 400);
  const faviconUrl = input.faviconUrl ? normalizeSubmittedUrl(input.faviconUrl) : null;
  const [account] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!account) throw new AppError("UNAUTHORIZED", "Please sign in again.", 401);
  if (!account.isPro && !input.isListed) throw new AppError("FORBIDDEN", "Private listings require an existing Pro plan.", 403);
  // Network work is bounded and deliberately outside the database transaction.
  let badgeVerified = false;
  if (!account.isPro && input.isListed) {
    const badge = await getVerifiedBadge(url, slug);
    if (!badge.verified) throw new AppError("INVALID_REQUEST", badge.status === "missing" ? "Add your badge before listing this website." : "Your badge could not be verified. Please try again.", 422);
    badgeVerified = true;
  }
  return db.transaction(async (tx) => {
    // Serialize both per-account allowance and canonical URL creation across replicas.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"listing-user:" + userId}, 0))`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"site-url:" + url}, 0))`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"site-slug:" + slug}, 0))`);
    const [owner] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
    if (!owner) throw new AppError("UNAUTHORIZED", "Please sign in again.", 401);
    if (!owner.isPro && !input.isListed) throw new AppError("FORBIDDEN", "Private listings require an existing Pro plan.", 403);
    if (!owner.isPro && input.isListed && !badgeVerified) throw new AppError("FORBIDDEN", "Verify your badge before listing this website.", 403);
    const [existing] = await tx.select({ id: sites.id }).from(sites).where(eq(sites.normalizedUrl, url)).limit(1);
    if (existing) throw new AppError("CONFLICT", "This website is already registered.", 409);
    const [sameSlug] = await tx.select({ id: sites.id }).from(sites).where(eq(sites.slug, slug)).limit(1);
    if (sameSlug) throw new AppError("CONFLICT", "This name is already in use. Choose another name.", 409);
    if (!owner.isPro) {
      const [owned] = await tx.select({ id: sites.id }).from(sites).where(eq(sites.ownerId, userId)).limit(1);
      if (owned) throw new AppError("FORBIDDEN", "Your current plan includes one website.", 403);
    }
    const [proof] = await tx.update(verifiedSpeedTests).set({ consumedAt: new Date() }).where(and(
      eq(verifiedSpeedTests.id, input.testResultId), eq(verifiedSpeedTests.userId, userId),
      eq(verifiedSpeedTests.normalizedUrl, url), eq(verifiedSpeedTests.strategy, "mobile"),
      isNull(verifiedSpeedTests.consumedAt), gt(verifiedSpeedTests.expiresAt, sql`now()`),
    )).returning();
    if (!proof) throw new AppError("CONFLICT", "Run a new mobile test while signed in before submitting.", 409);
    const result = proof.result;
    const [site] = await tx.insert(sites).values({
      slug, name: input.name, url, normalizedUrl: url, description: input.description,
      faviconUrl, ownerId: userId, ownerName: owner.name, twitterHandle: input.twitterHandle || null,
      category: input.category, tier: owner.isPro ? "pro" : "free", isListed: input.isListed,
      requiresBadge: !owner.isPro && input.isListed, currentScore: result.score,
      currentLoadTime: result.loadTime, currentFcp: result.fcp, currentLcp: result.lcp,
      currentCls: result.clsDisplay, currentTbt: result.tbt, currentTti: result.tti,
      currentSi: result.si, lastTestedAt: proof.createdAt,
    }).returning();
    await tx.insert(speedTests).values({
      siteId: site.id, score: result.score, loadTimeMs: result.loadTimeMs,
      fcpMs: result.fcpMs, lcpMs: result.lcpMs, cls: result.cls, tbtMs: result.tbtMs,
      ttiMs: result.ttiMs, siMs: result.siMs, strategy: proof.strategy,
      methodologyVersion: proof.methodologyVersion, testedAt: proof.createdAt,
    });
    await tx.update(verifiedSpeedTests).set({ siteId: site.id }).where(eq(verifiedSpeedTests.id, proof.id));
    return site;
  });
}

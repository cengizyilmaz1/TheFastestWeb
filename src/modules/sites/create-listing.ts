import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { sites, speedTests, users, verifiedSpeedTests, categories, countries, technologies, founders, siteCategories, siteTechnologies, founderSites, siteSocialLinks, backgroundJobs, jobEvents } from "@/db/schema";
import { getEnv } from "@/config/env";
import { randomUUID } from "node:crypto";
import { getVerifiedBadge } from "@/infrastructure/browser/badge-verification";
import { AppError } from "@/lib/http/errors";
import { slugify } from "@/lib/utils";
import { normalizeSubmittedUrl, type SubmissionInput } from "./input";
import { PERFORMANCE_METHOD_VERSION } from "@/modules/performance/service";
import { hasAccountProAccess } from "@/modules/payments/entitlements";
import { recordAnalyticsEvent } from "@/modules/analytics/events";
import { enqueueNotification } from "@/modules/notifications/service";
import { matchingWebsiteIdentity, websiteIdentity } from "./identity";
import { loadSiteMetadata, type SiteMetadata } from "./metadata";
import { UnsafeUrlError } from "@/lib/security/public-url";

export async function createListing(userId: string, input: SubmissionInput) {
  const db = getDb();
  if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Submissions are temporarily unavailable.", 503);
  const url = normalizeSubmittedUrl(input.url);
  const slug = slugify(input.name);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new AppError("INVALID_REQUEST", "Choose a name containing letters or numbers.", 400);
  const faviconUrl = input.faviconUrl ? normalizeSubmittedUrl(input.faviconUrl) : null;
  const [account] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!account) throw new AppError("UNAUTHORIZED", "Please sign in again.", 401);
  const accountHasPro = await hasAccountProAccess(userId, account.isPro, db);
  if (!accountHasPro && !input.isListed) throw new AppError("FORBIDDEN", "Private listings require a Pro plan.", 403);
  let identity = websiteIdentity(url);
  // Every HTTP publication requires a preparation receipt. Legacy internal
  // imports can still bind a historic single-device proof directly to its URL.
  if (input.preparationId) {
    const [preparation] = await db.select().from(backgroundJobs).where(and(eq(backgroundJobs.id, input.preparationId),
      eq(backgroundJobs.kind, "submission.prepare"), eq(backgroundJobs.status, "succeeded"),
      sql`${backgroundJobs.payload}->>'userId'=${userId}`, sql`${backgroundJobs.payload}->>'url'=${url}`));
    if (!preparation || preparation.result?.mobileProofId !== input.testResultId || preparation.result?.desktopProofId !== input.desktopTestResultId) {
      throw new AppError("CONFLICT", "Prepare the website again before publishing.", 409);
    }
    try {
      // Reading text fields can fail during preparation, but publishing without
      // an observed transport identity would bypass redirect duplicate checks.
      const metadata = preparation.result?.metadata as SiteMetadata | undefined;
      identity = websiteIdentity(url, metadata ?? await loadSiteMetadata(url));
    } catch (error) {
      if (error instanceof UnsafeUrlError) throw new AppError("URL_BLOCKED", "The website must resolve to a public address.", 400);
      throw new AppError("UPSTREAM_UNAVAILABLE", "We could not verify the website address. Please try publishing again shortly.", 503);
    }
  }
  // Network work is bounded and deliberately outside the database transaction.
  let badgeVerified = false;
  if (!accountHasPro && input.isListed) {
    const badge = await getVerifiedBadge(url, slug);
    if (!badge.verified) throw new AppError("INVALID_REQUEST", badge.status === "missing" ? "Add your badge before listing this website." : "Your badge could not be verified. Please try again.", 422);
    badgeVerified = true;
  }
  return db.transaction(async (tx) => {
    // Serialize both per-account allowance and canonical URL creation across replicas.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"listing-user:" + userId}, 0))`);
    // Sorted aliases prevent deadlocks when concurrent source URLs converge on
    // the same verified final/canonical address. Never lock untrusted hints.
    for (const key of identity.keys) await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"site-url:" + key}, 0))`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"site-slug:" + slug}, 0))`);
    const [owner] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
    if (!owner) throw new AppError("UNAUTHORIZED", "Please sign in again.", 401);
    const ownerHasPro = await hasAccountProAccess(userId, owner.isPro, tx);
    if (!ownerHasPro && !input.isListed) throw new AppError("FORBIDDEN", "Private listings require a Pro plan.", 403);
    if (!ownerHasPro && input.isListed && !badgeVerified) throw new AppError("FORBIDDEN", "Verify your badge before listing this website.", 403);
    const [existing] = await tx.select({ id: sites.id }).from(sites).where(matchingWebsiteIdentity(identity.keys)).limit(1);
    if (existing) throw new AppError("CONFLICT", "This website is already registered.", 409);
    const [sameSlug] = await tx.select({ id: sites.id }).from(sites).where(eq(sites.slug, slug)).limit(1);
    if (sameSlug) throw new AppError("CONFLICT", "This name is already in use. Choose another name.", 409);
    if (!ownerHasPro) {
      const [owned] = await tx.select({ id: sites.id }).from(sites).where(eq(sites.ownerId, userId)).limit(1);
      if (owned) throw new AppError("FORBIDDEN", "Your current plan includes one website.", 403);
    }
    const selectedCategories = await tx.select().from(categories).where(and(eq(categories.active, true), input.categoryIds?.length
      ? inArray(categories.id, input.categoryIds) : eq(categories.slug, input.category)));
    const categoryIds = input.categoryIds ?? selectedCategories.map((item) => item.id);
    const technologyIds = input.technologyIds ?? [], founderIds = input.founderIds ?? [];
    const selectedTechnologies = technologyIds.length ? await tx.select({ id: technologies.id }).from(technologies).where(and(inArray(technologies.id, technologyIds), eq(technologies.active, true))) : [];
    const selectedFounders = founderIds.length ? await tx.select({ id: founders.id }).from(founders).where(and(inArray(founders.id, founderIds), eq(founders.userId, userId))) : [];
    if (!categoryIds.length || selectedCategories.length !== categoryIds.length || selectedTechnologies.length !== technologyIds.length || selectedFounders.length !== founderIds.length) {
      throw new AppError("INVALID_REQUEST", "Choose active catalog entries and your own founder profile.", 400);
    }
    if (input.countryCode) {
      const [country] = await tx.select({ code: countries.code }).from(countries).where(eq(countries.code, input.countryCode));
      if (!country) throw new AppError("INVALID_REQUEST", "Choose a country from the list.", 400);
    }
    let detected: { slug: string; confidence: number }[] = [];
    if (input.preparationId) {
      const [preparation] = await tx.select().from(backgroundJobs).where(and(eq(backgroundJobs.id, input.preparationId),
        eq(backgroundJobs.kind, "submission.prepare"), eq(backgroundJobs.status, "succeeded"), sql`${backgroundJobs.payload}->>'userId'=${userId}`,
        sql`${backgroundJobs.payload}->>'url'=${url}`));
      if (!preparation || preparation.result?.mobileProofId !== input.testResultId || preparation.result?.desktopProofId !== input.desktopTestResultId) {
        throw new AppError("CONFLICT", "Prepare the website again before publishing.", 409);
      }
      const metadata = preparation.result?.metadata as { technologies?: { slug: string; confidence: number }[] } | undefined;
      detected = metadata?.technologies ?? [];
    }
    const [proof] = await tx.update(verifiedSpeedTests).set({ consumedAt: new Date() }).where(and(
      eq(verifiedSpeedTests.id, input.testResultId), eq(verifiedSpeedTests.userId, userId),
      eq(verifiedSpeedTests.normalizedUrl, url), eq(verifiedSpeedTests.strategy, "mobile"),
      isNull(verifiedSpeedTests.consumedAt), gt(verifiedSpeedTests.expiresAt, sql`now()`),
    )).returning();
    if (!proof) throw new AppError("CONFLICT", "Run a new mobile test while signed in before submitting.", 409);
    const result = proof.result;
    const standardized = proof.methodologyVersion === PERFORMANCE_METHOD_VERSION;
    if (standardized && (result.sampleCount !== 2 || result.metricsSource !== "lab")) {
      throw new AppError("CONFLICT", "Run a complete performance test before submitting.", 409);
    }
    const [desktopProof] = input.desktopTestResultId ? await tx.update(verifiedSpeedTests).set({ consumedAt: new Date() }).where(and(
      eq(verifiedSpeedTests.id, input.desktopTestResultId), eq(verifiedSpeedTests.userId, userId), eq(verifiedSpeedTests.normalizedUrl, url),
      eq(verifiedSpeedTests.strategy, "desktop"), eq(verifiedSpeedTests.methodologyVersion, PERFORMANCE_METHOD_VERSION),
      isNull(verifiedSpeedTests.consumedAt), gt(verifiedSpeedTests.expiresAt, sql`now()`),
    )).returning() : [];
    if (input.desktopTestResultId && (!desktopProof || desktopProof.result.sampleCount !== 2 || desktopProof.result.metricsSource !== "lab")) {
      throw new AppError("CONFLICT", "Run a new complete desktop measurement before publishing.", 409);
    }
    const primary = selectedCategories.find((item) => item.id === categoryIds[0])!;
    const legacyCategories = ["saas", "tool", "directory", "agency", "ecommerce", "blog", "portfolio", "other"];
    const [site] = await tx.insert(sites).values({
      slug, name: input.name, url, normalizedUrl: identity.normalizedUrl, redirectUrl: identity.redirectUrl, description: input.description,
      tagline: input.tagline || null, countryCode: input.countryCode ?? null, lifecycle: input.isListed ? "active" : "pending",
      faviconUrl, ownerId: userId, ownerName: owner.name, twitterHandle: input.twitterHandle || null,
      // Legacy tier is historical. Expiring provider grants are evaluated at read
      // time and must not become a permanent badge exemption in this row.
      category: legacyCategories.includes(primary.slug) ? primary.slug as typeof input.category : "other", tier: owner.isPro ? "pro" : "free", isListed: input.isListed,
      requiresBadge: !owner.isPro && input.isListed, currentScore: result.score,
      badgeStatus: badgeVerified ? "verified" : "missing", badgeCheckedAt: badgeVerified ? new Date() : null,
      currentLoadTime: result.loadTime, currentFcp: result.fcp, currentLcp: result.lcp,
      currentCls: result.clsDisplay, currentTbt: result.tbt, currentTti: result.tti,
      currentSi: result.si, lastTestedAt: proof.createdAt,
    }).returning();
    await recordAnalyticsEvent({ name: "site_submitted", eventKey: `site:${site.id}:submitted`, siteId: site.id,
      properties: { visibility: input.isListed ? "public" : "private" } }, tx);
    if (input.isListed) await enqueueNotification({ userId, type: "site_approved", eventKey: `site:${site.id}:published`,
      variables: { siteName: site.name.slice(0, 200), actionPath: `/site/${encodeURIComponent(site.slug)}` } }, tx);
    await tx.insert(siteCategories).values(categoryIds.map((categoryId, index) => ({ siteId: site.id, categoryId, isPrimary: index === 0 })));
    if (technologyIds.length) {
      const catalog = await tx.select({ id: technologies.id, slug: technologies.slug }).from(technologies).where(inArray(technologies.id, technologyIds));
      await tx.insert(siteTechnologies).values(catalog.map((item) => { const evidence = detected.find((entry) => entry.slug === item.slug);
        return { siteId: site.id, technologyId: item.id, source: evidence ? "detected" as const : "manual" as const, confidence: evidence?.confidence ?? null }; }));
    }
    if (founderIds.length) await tx.insert(founderSites).values(founderIds.map((founderId) => ({ siteId: site.id, founderId })));
    if (input.socialLinks?.length) await tx.insert(siteSocialLinks).values(input.socialLinks.map((link) => ({ siteId: site.id, ...link })));
    await tx.insert(speedTests).values({
      siteId: site.id, score: result.score, loadTimeMs: result.loadTimeMs,
      fcpMs: result.fcpMs, lcpMs: result.lcpMs, cls: result.cls, tbtMs: result.tbtMs,
      ttiMs: result.ttiMs, siMs: result.siMs, strategy: proof.strategy,
      methodologyVersion: proof.methodologyVersion, testedAt: proof.createdAt,
      sampleCount: standardized ? 2 : 1, metricsSource: "lab",
    });
    await tx.update(verifiedSpeedTests).set({ siteId: site.id }).where(eq(verifiedSpeedTests.id, proof.id));
    if (desktopProof) {
      const desktop = desktopProof.result;
      await tx.insert(speedTests).values({ siteId: site.id, score: desktop.score, loadTimeMs: desktop.loadTimeMs, fcpMs: desktop.fcpMs, lcpMs: desktop.lcpMs,
        cls: desktop.cls, tbtMs: desktop.tbtMs, ttiMs: desktop.ttiMs, siMs: desktop.siMs, strategy: "desktop", methodologyVersion: PERFORMANCE_METHOD_VERSION,
        testedAt: desktopProof.createdAt, sampleCount: 2, metricsSource: "lab" });
      await tx.update(verifiedSpeedTests).set({ siteId: site.id }).where(eq(verifiedSpeedTests.id, desktopProof.id));
    }
    if (input.isListed && getEnv().SCREENSHOTS_ENABLED) {
      const [capture] = await tx.insert(backgroundJobs).values({ siteId: site.id, queue: "screenshots", kind: "site.screenshot.capture", jobKey: `screenshot:${site.id}:initial`,
        payload: { siteId: site.id, sourceUrl: url, device: "desktop", mode: "viewport", history: "daily" }, correlationId: randomUUID(), maxAttempts: getEnv().JOB_MAX_ATTEMPTS }).returning();
      await tx.insert(jobEvents).values({ jobId: capture.id, event: "scheduled", actor: "service", attempt: 0 });
    }
    return site;
  });
}

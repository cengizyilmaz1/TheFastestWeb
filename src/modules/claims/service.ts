import { createHash, randomBytes } from "node:crypto";
import { Resolver } from "node:dns/promises";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { siteClaims, sites, users } from "@/db/schema";
import { AppError } from "@/lib/http/errors";
import { parsePublicHttpUrl, resolvePublicTarget } from "@/lib/security/public-url";
import { safeFetchText } from "@/lib/security/safe-fetch";
import { recordAnalyticsEvent } from "@/modules/analytics/events";
import { enqueueNotification } from "@/modules/notifications/service";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const issueClaimSchema = z.object({ siteId: z.uuid(), method: z.enum(["dns_txt", "well_known"]) }).strict();
export const verifyClaimSchema = z.object({ claimId: z.uuid(), token: z.string().regex(/^[a-f0-9]{64}$/) }).strict();

function database() {
  const db = getDb();
  if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Ownership verification is temporarily unavailable.", 503);
  return db;
}

function challenge(url: string, token: string) {
  const target = parsePublicHttpUrl(url);
  return {
    recordName: `_thefastestweb.${target.hostname}`,
    recordValue: `thefastestweb-verification=${token}`,
    url: new URL("/.well-known/thefastestweb-verification.txt", target).href,
  };
}

export async function issueSiteClaim(userId: string, raw: unknown) {
  const input = issueClaimSchema.parse(raw);
  const token = randomBytes(32).toString("hex");
  return database().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`claim:${userId}:${input.siteId}`},0))`);
    const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId));
    if (!user) throw new AppError("UNAUTHORIZED", "Please sign in again.", 401);
    const [site] = await tx.select({ url: sites.url, name: sites.name, ownerId: sites.ownerId }).from(sites)
      .where(and(eq(sites.id, input.siteId), eq(sites.isListed, true)));
    if (!site) throw new AppError("NOT_FOUND", "Website not found.", 404);
    if (site.ownerId === userId) throw new AppError("CONFLICT", "You already own this website.", 409);
    const verification = challenge(site.url, token);
    await tx.update(siteClaims).set({ status: "cancelled" }).where(and(eq(siteClaims.userId, userId), eq(siteClaims.siteId, input.siteId), eq(siteClaims.status, "pending")));
    const [claim] = await tx.insert(siteClaims).values({
      userId, siteId: input.siteId, method: input.method, tokenHash: hash(token), expiresAt: sql`now() + interval '1 day'`,
    }).returning({ id: siteClaims.id, expiresAt: siteClaims.expiresAt });
    await enqueueNotification({ userId, type: "claim_verification", eventKey: `claim:${claim.id}:issued`,
      variables: { siteName: site.name.slice(0, 200), actionPath: "/submit" } }, tx);
    // The raw token is returned once; neither database rows nor queue payloads contain it.
    return { ...claim, method: input.method, token, verification };
  });
}

async function verifyProof(url: string, method: string, token: string): Promise<boolean> {
  const proof = challenge(url, token);
  if (method === "well_known") {
    const response = await safeFetchText(proof.url, { maxBytes: 4096, maxRedirects: 0, timeoutMs: 8000 });
    return response.html.trim() === proof.recordValue;
  }
  if (method !== "dns_txt") throw new AppError("INVALID_REQUEST", "This verification method is not enabled.", 400);
  const resolver = new Resolver({ timeout: 2000, tries: 2 });
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        // Public-address policy applies to the exact hostname, never a guessed parent domain.
        await resolvePublicTarget(url);
        if (expired) throw new Error("Verification deadline exceeded");
        const records = await resolver.resolveTxt(proof.recordName);
        return records.length <= 100 && records.some((parts) => parts.join("") === proof.recordValue);
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { expired = true; resolver.cancel(); reject(new Error("Verification deadline exceeded")); }, 5000);
      }),
    ]);
  } finally { expired = true; clearTimeout(timer); resolver.cancel(); }
}

export async function verifySiteClaim(userId: string, raw: unknown) {
  const input = verifyClaimSchema.parse(raw);
  const db = database();
  const attempt = await db.transaction(async (tx) => {
    const [claim] = await tx.update(siteClaims).set({ attempts: sql`${siteClaims.attempts} + 1` }).where(and(
      eq(siteClaims.id, input.claimId), eq(siteClaims.userId, userId), eq(siteClaims.tokenHash, hash(input.token)),
      eq(siteClaims.status, "pending"), gt(siteClaims.expiresAt, sql`now()`), lt(siteClaims.attempts, 5),
    )).returning();
    if (!claim) throw new AppError("CONFLICT", "Create a new ownership challenge before verifying.", 409);
    const [site] = await tx.select({ url: sites.url }).from(sites).where(eq(sites.id, claim.siteId));
    if (!site) throw new AppError("NOT_FOUND", "Website not found.", 404);
    return { claim, url: site.url };
  });
  let verified: boolean;
  try { verified = await verifyProof(attempt.url, attempt.claim.method, input.token); }
  catch { throw new AppError("UPSTREAM_UNAVAILABLE", "The ownership challenge could not be checked. Please try again.", 502); }
  if (!verified) throw new AppError("INVALID_REQUEST", "The ownership challenge was not found on this website.", 422);
  return db.transaction(async (tx) => {
    const [claim] = await tx.select().from(siteClaims).where(and(eq(siteClaims.id, input.claimId),
      eq(siteClaims.userId, userId), eq(siteClaims.status, "pending"), gt(siteClaims.expiresAt, sql`now()`))).for("update");
    if (!claim) throw new AppError("CONFLICT", "This ownership challenge is no longer active.", 409);
    const [site] = await tx.select().from(sites).where(eq(sites.id, claim.siteId)).for("update");
    if (!site || site.url !== attempt.url) throw new AppError("CONFLICT", "The website changed. Create a new ownership challenge.", 409);
    const requiresReview = site.ownerId !== null && site.ownerId !== userId;
    if (site.ownerId === null) {
      const [user] = await tx.select({ name: users.name }).from(users).where(eq(users.id, userId));
      if (!user) throw new AppError("UNAUTHORIZED", "Please sign in again.", 401);
      await tx.update(sites).set({ ownerId: userId, ownerName: user.name }).where(eq(sites.id, site.id));
    }
    await tx.update(siteClaims).set({ status: "verified", verifiedAt: sql`now()` }).where(eq(siteClaims.id, claim.id));
    if (!requiresReview) await recordAnalyticsEvent({ name: "site_claimed", eventKey: `claim:${claim.id}:completed`, siteId: site.id,
      properties: { method: claim.method === "dns_txt" ? "dns" : "file" } }, tx);
    return { id: claim.id, siteId: site.id, status: "verified" as const, requiresReview };
  });
}

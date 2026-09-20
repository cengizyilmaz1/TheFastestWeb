import { randomUUID } from "node:crypto";
import { and, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Database } from "@/db";
import { auditLogs, founders, founderSlugAliases, users } from "@/db/schema";
import { AppError } from "@/lib/http/errors";
import { founderUsernamePattern, getFounderPath, usernameFromName } from "./paths";
export type FounderTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export const usernameSchema = z.string().trim().toLowerCase().min(2).max(80).regex(founderUsernamePattern)
  .refine(value => !["me", "new", "edit", "admin", "api", "settings", "undefined", "null"].includes(value), "Choose another username.");
export const usernameChangeSchema = z.object({ username: usernameSchema, expectedUsername: z.string().min(2).max(80), requestId: z.uuid() }).strict();
function database() { const db = getDb(); if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Profiles are temporarily unavailable.", 503); return db; }
export async function lockFounderNames(tx: FounderTransaction) { await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('founder-username-namespace',0))`); }
export async function reserveFounderName(tx: FounderTransaction, founderId: string, slug: string) {
  const [reserved] = await tx.select().from(founderSlugAliases).where(eq(founderSlugAliases.slug, slug));
  const [canonical] = await tx.select({ id: founders.id }).from(founders).where(eq(founders.slug, slug));
  if (reserved && reserved.founderId !== founderId || canonical && canonical.id !== founderId) throw new AppError("CONFLICT", "This username is already reserved.", 409);
  await tx.insert(founderSlugAliases).values({ slug, founderId }).onConflictDoNothing();
}
/** The caller already authenticated this user. Initialization stays private. */
export async function ensureFounderIdentity(tx: FounderTransaction, userId: string, displayName?: string | null) {
  await lockFounderNames(tx);
  const [existing] = await tx.select().from(founders).where(eq(founders.userId, userId));
  if (existing) { await reserveFounderName(tx, existing.id, existing.slug); return existing; }
  const [account] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId));
  if (!account) throw new AppError("UNAUTHORIZED", "Please sign in again.", 401);
  const safeName = displayName?.trim().slice(0, 100) || "Member";
  const base = usernameFromName(displayName?.includes("@") ? "" : displayName || "");
  const id = randomUUID();
  let slug = base;
  for (let suffix = 1; ; suffix++) {
    const [taken] = await tx.select({ slug: founderSlugAliases.slug }).from(founderSlugAliases).where(eq(founderSlugAliases.slug, slug));
    const [current] = await tx.select({ id: founders.id }).from(founders).where(eq(founders.slug, slug));
    if (!taken && !current && usernameSchema.safeParse(slug).success) break;
    slug = base + "-" + (suffix < 1000 ? suffix + 1 : id.slice(0, 8));
    if (suffix > 1000) throw new AppError("CONFLICT", "Choose a username from your profile.", 409);
  }
  const [profile] = await tx.insert(founders).values({ id, userId, slug, name: safeName, visibility: "private" }).returning();
  await reserveFounderName(tx, id, slug);
  return profile;
}
export async function getOwnFounderPath(userId: string) {
  const [profile] = await database().select({ slug: founders.slug }).from(founders).where(eq(founders.userId, userId));
  return profile ? getFounderPath(profile.slug) : `/profile/${userId}`;
}
export async function initializeOwnFounder(userId: string) {
  return database().transaction(tx => ensureFounderIdentity(tx, userId));
}
export async function changeOwnUsername(userId: string, raw: unknown) {
  const input = usernameChangeSchema.parse(raw);
  return database().transaction(async tx => {
    await lockFounderNames(tx);
    const [prior] = await tx.select().from(auditLogs).where(eq(auditLogs.id, input.requestId));
    if (prior) {
      if (prior.actorUserId !== userId || prior.action !== "founder.username" || prior.payload.username !== input.username || prior.payload.expectedUsername !== input.expectedUsername)
        throw new AppError("CONFLICT", "This request has already been used.", 409);
      return { path: getFounderPath(input.username), username: input.username };
    }
    const [profile] = await tx.select().from(founders).where(eq(founders.userId, userId)).for("update");
    if (!profile) throw new AppError("NOT_FOUND", "Open My Profile first.", 404);
    if (profile.slug !== input.expectedUsername) throw new AppError("CONFLICT", "The username changed. Reload your profile before editing.", 409);
    await reserveFounderName(tx, profile.id, profile.slug);
    await reserveFounderName(tx, profile.id, input.username);
    await tx.update(founders).set({ slug: input.username, updatedAt: sql`now()` }).where(eq(founders.id, profile.id));
    await tx.insert(auditLogs).values({ id: input.requestId, actorUserId: userId, action: "founder.username", targetType: "founder",
      targetId: profile.id, reason: "Account owner changed their profile username.", payload: { expectedUsername: profile.slug, username: input.username } });
    return { path: getFounderPath(input.username), username: input.username };
  });
}
/** The alias registry always resolves directly to the current canonical username. */
export async function resolveFounderUsername(username: string, viewerId?: string) {
  if (!founderUsernamePattern.test(username) || username.length > 80) return null;
  const db = database();
  const [profile] = await db.select({ id: founders.id, userId: founders.userId, slug: founders.slug, visibility: founders.visibility })
    .from(founders).leftJoin(founderSlugAliases, eq(founderSlugAliases.founderId, founders.id))
    .where(and(or(eq(founders.slug, username), eq(founderSlugAliases.slug, username)),
      viewerId ? or(eq(founders.visibility, "public"), eq(founders.userId, viewerId)) : eq(founders.visibility, "public"))).limit(1);
  return profile ?? null;
}


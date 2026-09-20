import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getEnv } from "@/config/env";
import { getDb, type Database } from "@/db";
import { adminRoles, auditLogs, founders, founderSlugAliases, redirectRules } from "@/db/schema";
import { AppError } from "@/lib/http/errors";
import type { AdminActor } from "@/modules/admin/access";
import { redirectInputSchema, redirectsConflict, type RedirectInput } from "./policy";
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
function database() { const db = getDb(); if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Redirect administration is temporarily unavailable.", 503); return db; }
function secret() { const value = getEnv().AUTH_SECRET; if (!value || value.length < 32) throw new AppError("SERVICE_UNAVAILABLE", "Administration is not configured.", 503); return value; }
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function authorize(tx: Tx, actor: AdminActor) {
  const [grant] = await tx.select().from(adminRoles).where(eq(adminRoles.userId, actor.userId)).for("share");
  if (grant?.role !== "admin") throw new AppError("FORBIDDEN", "An administrator role is required.", 403);
}
async function state(tx: Tx) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('managed-redirect-graph',0))`);
  return tx.select().from(redirectRules).orderBy(asc(redirectRules.id)).limit(1001);
}
function validate(input: RedirectInput, rows: Awaited<ReturnType<typeof state>>) {
  const current = rows.find(row => row.id === input.id);
  if ((current?.version ?? 0) !== input.expectedVersion) throw new AppError("CONFLICT", "This redirect changed. Reload it before editing.", 409);
  if (!current && rows.length >= 1000) throw new AppError("CONFLICT", "The redirect limit has been reached.", 409);
  if (redirectsConflict(input, rows)) throw new AppError("CONFLICT", "That source is reserved or the rule would create a redirect chain or loop.", 409);
  return current ?? null;
}
const proofSchema = z.object({ actor: z.uuid(), nonce: z.uuid(), input: z.string().length(64), state: z.string().length(64), expires: z.number() }).strict();
function decode(token: string) {
  if (!/^[A-Za-z0-9_-]{1,1800}\.[A-Za-z0-9_-]{43}$/.test(token)) throw new AppError("INVALID_REQUEST", "Invalid confirmation.", 400);
  const [body, signature] = token.split(".");
  const actual = Buffer.from(signature, "base64url"), expected = createHmac("sha256", secret()).update(body).digest();
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new AppError("INVALID_REQUEST", "Invalid confirmation.", 400);
  const parsed = proofSchema.safeParse(JSON.parse(Buffer.from(body, "base64url").toString()));
  if (!parsed.success || parsed.data.expires <= Date.now()) throw new AppError("INVALID_REQUEST", "The preview expired. Review the redirect again.", 400);
  return parsed.data;
}
export async function listManagedRedirects(actor: AdminActor) {
  return database().transaction(async tx => {
    await authorize(tx, actor);
    const rules = await tx.select().from(redirectRules).orderBy(asc(redirectRules.sourcePath)).limit(1000);
    const aliases = await tx.select({ oldUsername: founderSlugAliases.slug, username: founders.slug, visibility: founders.visibility })
      .from(founderSlugAliases).innerJoin(founders, eq(founders.id, founderSlugAliases.founderId))
      .where(sql`${founderSlugAliases.slug} <> ${founders.slug}`).orderBy(asc(founderSlugAliases.slug)).limit(200);
    return { rules, aliases };
  });
}
export async function previewRedirect(actor: AdminActor, raw: unknown) {
  const input = redirectInputSchema.parse(raw);
  return database().transaction(async tx => {
    await authorize(tx, actor);
    const rows = await state(tx), before = validate(input, rows);
    const proof = { actor: actor.userId, nonce: randomUUID(), input: hash(input), state: hash(rows), expires: Date.now() + 300_000 };
    const body = Buffer.from(JSON.stringify(proof)).toString("base64url");
    return { before, proposed: input, token: body + "." + createHmac("sha256", secret()).update(body).digest("base64url") };
  });
}
export async function saveRedirect(actor: AdminActor, raw: unknown, token: string) {
  const input = redirectInputSchema.parse(raw), proof = decode(token);
  if (proof.actor !== actor.userId || proof.input !== hash(input)) throw new AppError("FORBIDDEN", "The confirmation does not match your preview.", 403);
  return database().transaction(async tx => {
    await authorize(tx, actor);
    const rows = await state(tx);
    const [used] = await tx.select().from(auditLogs).where(eq(auditLogs.id, proof.nonce));
    if (used) {
      if (used.actorUserId !== actor.userId || used.action !== "redirect.save" || used.payload.inputHash !== hash(input)) throw new AppError("CONFLICT", "This confirmation was already used.", 409);
      return { saved: true, id: input.id, replayed: true };
    }
    if (hash(rows) !== proof.state) throw new AppError("CONFLICT", "Redirect rules changed. Review a fresh preview.", 409);
    const before = validate(input, rows);
    const values = { sourcePath: input.sourcePath, destinationPath: input.destinationPath, statusCode: input.statusCode,
      enabled: input.enabled, updatedBy: actor.userId, version: (before?.version ?? 0) + 1, updatedAt: sql`now()` };
    const [after] = before ? await tx.update(redirectRules).set(values).where(eq(redirectRules.id, input.id)).returning()
      : await tx.insert(redirectRules).values({ id: input.id, ...values }).returning();
    await tx.insert(auditLogs).values({ id: proof.nonce, actorUserId: actor.userId, action: "redirect.save", targetType: "redirect",
      targetId: input.id, reason: input.reason, payload: { before, after, inputHash: hash(input) } });
    return { saved: true, id: input.id, replayed: false };
  });
}


import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getEnv } from "@/config/env";
import { getDb, type Database } from "@/db";
import { adInventory, adminRoles, auditLogs, backgroundJobs, emailDeliveries, jobEvents, products, siteClaims, sites, users } from "@/db/schema";
import { AppError } from "@/lib/http/errors";
import type { AdminActor } from "./access";
import { approveAdReservation, releaseAdReservation } from "@/modules/payments/ads";
import { recordAnalyticsEvent } from "@/modules/analytics/events";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const reason = z.string().trim().min(8).max(500);
export const productInputSchema = z.object({ id: z.uuid(), key: z.string().regex(/^[a-z0-9_-]{1,80}$/),
  providerProductId: z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/).nullable(), title: z.string().trim().min(2).max(200),
  kind: z.enum(["pro_listing", "featured_listing", "sidebar_ad", "sponsorship"]), amountCents: z.number().int().min(0).max(2_147_483_647),
  currency: z.string().regex(/^[A-Z]{3}$/), billingInterval: z.enum(["one_time", "month", "year"]),
  entitlementDays: z.number().int().min(1).max(36500).nullable(), requiresSite: z.boolean(), active: z.boolean(),
}).strict().refine((value) => !value.active || Boolean(value.providerProductId), "Active products require a provider product")
  .refine((value) => !["featured_listing", "sponsorship"].includes(value.kind) || value.requiresSite, "Paid discovery placements require an owned site")
  .refine((value) => value.kind !== "sidebar_ad" || (value.requiresSite && value.billingInterval === "one_time" && Boolean(value.entitlementDays)), "Ad products require an owned site and fixed one-time duration");
export const adminActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("site.lifecycle"), siteId: z.uuid(), lifecycle: z.enum(["active", "suspended", "archived"]), reason }).strict(),
  z.object({ action: z.literal("site.monitoring"), siteId: z.uuid(), paused: z.boolean(), reason }).strict(),
  z.object({ action: z.literal("claim.reject"), claimId: z.uuid(), reason }).strict(),
  z.object({ action: z.literal("claim.transfer"), claimId: z.uuid(), reason }).strict(),
  z.object({ action: z.literal("job.retry"), jobId: z.uuid(), reason }).strict(),
  z.object({ action: z.literal("job.cancel"), jobId: z.uuid(), reason }).strict(),
  z.object({ action: z.literal("product.save"), product: productInputSchema, reason }).strict(),
  z.object({ action: z.literal("payment.review"), orderId: z.uuid(), reason }).strict(),
  z.object({ action: z.literal("ad.inventory"), inventoryId: z.uuid(), position: z.enum(["left", "right"]), orderIndex: z.number().int().min(0).max(100), active: z.boolean(), reason }).strict(),
  z.object({ action: z.literal("ad.approve"), reservationId: z.uuid(), reason }).strict(),
  z.object({ action: z.literal("ad.release"), reservationId: z.uuid(), evidence: z.string().trim().min(20).max(1000), reason }).strict(),
]);
export type AdminAction = z.infer<typeof adminActionSchema>;

function database() {
  const db = getDb();
  if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Administration is temporarily unavailable.", 503);
  return db;
}
function secret() {
  const value = getEnv().AUTH_SECRET;
  if (!value || value.length < 32) throw new AppError("SERVICE_UNAVAILABLE", "Administration is not configured.", 503);
  return value;
}
function target(action: AdminAction) {
  return action.action.startsWith("site.") ? { type: "site", id: "siteId" in action ? action.siteId : "" }
    : "claimId" in action ? { type: "claim", id: action.claimId } : "jobId" in action ? { type: "job", id: action.jobId }
      : "product" in action ? { type: "product", id: action.product.id }
        : "inventoryId" in action ? { type: "inventory", id: action.inventoryId }
          : "reservationId" in action ? { type: "reservation", id: action.reservationId } : { type: "checkout", id: "orderId" in action ? action.orderId : "" };
}
async function authorize(tx: Transaction, actor: AdminActor, action?: AdminAction) {
  const [role] = await tx.select().from(adminRoles).where(eq(adminRoles.userId, actor.userId)).for("share");
  if (!role || (action && !action.action.startsWith("site.") && action.action !== "claim.reject" && role.role !== "admin")) {
    throw new AppError("FORBIDDEN", "Your role does not allow this administrative action.", 403);
  }
}
async function beforeState(tx: Transaction, action: AdminAction) {
  const identity = target(action);
  let rows;
  if (identity.type === "site") rows = await tx.execute(sql`SELECT id,lifecycle,is_listed,monitoring_paused,archived_at FROM sites WHERE id=${identity.id} FOR UPDATE`);
  else if (identity.type === "claim") rows = await tx.execute(sql`SELECT c.id,c.status,c.verified_at,c.user_id,c.site_id,c.expires_at,s.owner_id
    FROM site_claims c JOIN sites s ON s.id=c.site_id WHERE c.id=${identity.id} FOR UPDATE OF c,s`);
  else if (identity.type === "job") rows = await tx.execute(sql`SELECT id,kind,status,attempts,max_attempts,lease_token,leased_until FROM background_jobs WHERE id=${identity.id} FOR UPDATE`);
  else if (identity.type === "product") rows = await tx.execute(sql`SELECT id,key,provider_product_id,title,kind,amount_cents,currency,billing_interval,entitlement_days,requires_site,active FROM products WHERE id=${identity.id} FOR UPDATE`);
  else if (identity.type === "inventory") rows = await tx.execute(sql`SELECT id,position,order_index,active FROM ad_inventory WHERE id=${identity.id} FOR UPDATE`);
  else if (identity.type === "reservation") {
    // Payment workers lock the order before its reservation. Keep that ordering
    // for operator actions too, including a cancellation that updates the order.
    await tx.execute(sql`SELECT o.id FROM checkout_orders o JOIN ad_reservations r ON r.order_id=o.id WHERE r.id=${identity.id} FOR UPDATE OF o`);
    await tx.execute(sql`SELECT i.id FROM ad_inventory i JOIN ad_reservations r ON r.inventory_id=i.id WHERE r.id=${identity.id} FOR UPDATE OF i`);
    rows = await tx.execute(sql`SELECT r.id,r.inventory_id,r.order_id,r.user_id,r.site_id,r.ad_slot_id,r.status,r.starts_at,r.ends_at,
      a.name AS creative_name,a.tagline AS creative_tagline,a.url AS creative_url,a.status AS creative_status
      FROM ad_reservations r LEFT JOIN ad_slots a ON a.id=r.ad_slot_id WHERE r.id=${identity.id} FOR UPDATE OF r`);
  }
  else rows = await tx.execute(sql`SELECT id,status,provider_checkout_id,product_id,created_at FROM checkout_orders WHERE id=${identity.id} FOR UPDATE`);
  if (!rows.length && !["product", "inventory"].includes(identity.type)) throw new AppError("NOT_FOUND", "Administrative target not found.", 404);
  return rows.length ? { ...rows[0] } : null;
}
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const previewSchema = z.object({ actor: z.uuid(), nonce: z.uuid(), actionHash: z.string().length(64), stateHash: z.string().length(64), expires: z.number().int() }).strict();
function decodePreview(value: string) {
  if (!/^[a-zA-Z0-9_-]{1,1800}\.[a-zA-Z0-9_-]{43}$/.test(value)) throw new AppError("INVALID_REQUEST", "The preview is invalid or expired.", 400);
  const [body, signature] = value.split(".");
  const actual = Buffer.from(signature, "base64url"), expected = createHmac("sha256", secret()).update(body).digest();
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new AppError("INVALID_REQUEST", "The preview is invalid or expired.", 400);
  try {
    const preview = previewSchema.parse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
    if (preview.expires < Date.now()) throw new Error("Expired");
    return preview;
  } catch { throw new AppError("INVALID_REQUEST", "The preview is invalid or expired.", 400); }
}

export async function previewAdminAction(actor: AdminActor, raw: unknown) {
  const action = adminActionSchema.parse(raw);
  return database().transaction(async (tx) => {
    await authorize(tx, actor, action);
    const before = await beforeState(tx, action);
    const payload = { actor: actor.userId, nonce: randomUUID(), actionHash: digest(action), stateHash: digest(before), expires: Date.now() + 300_000 };
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return { before, proposed: action, financialMutation: false,
      token: `${body}.${createHmac("sha256", secret()).update(body).digest("base64url")}`, expiresAt: new Date(payload.expires).toISOString() };
  });
}

/** Confirmation is single-use and bound to actor, exact action and current state. */
export async function executeAdminAction(actor: AdminActor, raw: unknown, token: string) {
  const action = adminActionSchema.parse(raw), preview = decodePreview(token), identity = target(action);
  if (preview.actor !== actor.userId || preview.actionHash !== digest(action)) throw new AppError("FORBIDDEN", "This confirmation does not match the preview.", 403);
  return database().transaction(async (tx) => {
    await authorize(tx, actor, action);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`admin-preview:${preview.nonce}`},0))`);
    const [used] = await tx.select({ id: auditLogs.id }).from(auditLogs).where(sql`${auditLogs.payload}->>'previewId'=${preview.nonce}`).limit(1);
    if (used) throw new AppError("CONFLICT", "This confirmation has already been used.", 409);
    const before = await beforeState(tx, action);
    if (digest(before) !== preview.stateHash) throw new AppError("CONFLICT", "The target changed. Review a new preview before confirming.", 409);
    if (action.action === "site.lifecycle") {
      await tx.update(sites).set({ lifecycle: action.lifecycle, isListed: action.lifecycle === "active",
        archivedAt: action.lifecycle === "archived" ? sql`now()` : null }).where(eq(sites.id, action.siteId));
    } else if (action.action === "site.monitoring") {
      await tx.update(sites).set({ monitoringPaused: action.paused }).where(eq(sites.id, action.siteId));
    } else if (action.action === "claim.reject") {
      if (before?.status !== "pending") throw new AppError("CONFLICT", "Only a pending claim can be rejected.", 409);
      await tx.update(siteClaims).set({ status: "rejected" }).where(eq(siteClaims.id, action.claimId));
    } else if (action.action === "claim.transfer") {
      if (before?.status !== "verified" || !before.verified_at || new Date(String(before.expires_at)).getTime() <= Date.now()
        || typeof before.user_id !== "string" || typeof before.site_id !== "string") throw new AppError("CONFLICT", "A fresh verified ownership proof is required before transfer.", 409);
      const [newOwner] = await tx.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, before.user_id));
      if (!newOwner) throw new AppError("NOT_FOUND", "The claiming account no longer exists.", 404);
      await tx.update(sites).set({ ownerId: newOwner.id, ownerName: newOwner.name }).where(eq(sites.id, before.site_id));
      await recordAnalyticsEvent({ name: "site_claimed", eventKey: `claim:${action.claimId}:completed`, siteId: before.site_id, properties: { method: "admin" } }, tx);
    } else if (action.action === "job.retry" || action.action === "job.cancel") {
      const [job] = await tx.select().from(backgroundJobs).where(eq(backgroundJobs.id, action.jobId));
      if (job.status === "running" && ["webhooks", "emails", "analytics"].includes(job.queue)) throw new AppError("CONFLICT", "A provider request is already running. Wait for its recorded outcome before acting.", 409);
      if (action.action === "job.retry") {
        if (!["failed", "cancelled"].includes(job.status)) throw new AppError("CONFLICT", "Only a failed or cancelled job can be retried.", 409);
        if (job.kind === "email.deliver") {
          const deliveryId = z.uuid().safeParse(job.payload.deliveryId);
          const [delivery] = deliveryId.success ? await tx.select().from(emailDeliveries).where(eq(emailDeliveries.id, deliveryId.data)) : [];
          if (!delivery || ["uncertain", "sending", "failed"].includes(delivery.status)) throw new AppError("CONFLICT", "This email requires provider reconciliation before retry.", 409);
        }
      } else if (["succeeded", "failed", "cancelled"].includes(job.status)) throw new AppError("CONFLICT", "This job has already finished.", 409);
      await tx.update(backgroundJobs).set(action.action === "job.retry" ? { status: "pending", availableAt: sql`now()`,
        leaseToken: null, leasedUntil: null, finishedAt: null, lastErrorCode: null, maxAttempts: job.attempts + getEnv().JOB_MAX_ATTEMPTS, updatedAt: sql`now()` }
        : { status: "cancelled", leaseToken: null, leasedUntil: null, finishedAt: sql`now()`, updatedAt: sql`now()` }).where(eq(backgroundJobs.id, job.id));
      await tx.insert(jobEvents).values({ jobId: job.id, event: action.action === "job.retry" ? "operator_retry" : "cancelled", actor: "admin", attempt: job.attempts });
    } else if (action.action === "product.save") {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`product-key:${action.product.key}`},0))`);
      const [sameKey] = await tx.select({ id: products.id }).from(products).where(eq(products.key, action.product.key));
      if (sameKey && sameKey.id !== action.product.id) throw new AppError("CONFLICT", "This catalog key belongs to another product.", 409);
      await tx.insert(products).values(action.product).onConflictDoUpdate({ target: products.id, set: { ...action.product, updatedAt: sql`now()` } });
    } else if (action.action === "ad.inventory") {
      if (before && (before.position !== action.position || before.order_index !== action.orderIndex)) throw new AppError("CONFLICT", "Existing inventory coordinates cannot be moved. Create another placement instead.", 409);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`ad-coordinate:${action.position}:${action.orderIndex}`},0))`);
      const [coordinate] = await tx.select({ id: adInventory.id }).from(adInventory).where(sql`${adInventory.position}=${action.position} AND ${adInventory.orderIndex}=${action.orderIndex}`);
      if (coordinate && coordinate.id !== action.inventoryId) throw new AppError("CONFLICT", "This position already belongs to an inventory record.", 409);
      await tx.insert(adInventory).values({ id: action.inventoryId, position: action.position, orderIndex: action.orderIndex, active: action.active })
        .onConflictDoUpdate({ target: adInventory.id, set: { active: action.active, updatedAt: sql`now()` } });
    } else if (action.action === "ad.approve") {
      await approveAdReservation(tx, action.reservationId);
    } else if (action.action === "ad.release") {
      await releaseAdReservation(tx, action.reservationId, action.evidence);
    }
    // payment.review deliberately has no financial mutation or provider request.
    const after = await beforeState(tx, action);
    const [audit] = await tx.insert(auditLogs).values({ actorUserId: actor.userId, action: action.action, targetType: identity.type,
      targetId: identity.id, reason: action.reason, payload: { previewId: preview.nonce, before, after, financialMutation: false,
        ...(action.action === "ad.release" ? { providerCancellationEvidence: action.evidence } : {}) } }).returning({ id: auditLogs.id });
    return { auditId: audit.id, after, financialMutation: false };
  });
}

/** Operator-only first administrator initialization; no environment email allowlist. */
export async function bootstrapAdministrator(userId: string, rationale: string) {
  z.uuid().parse(userId); reason.parse(rationale);
  return database().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('admin-bootstrap',0))`);
    const [existing] = await tx.select().from(adminRoles).where(eq(adminRoles.role, "admin")).limit(1);
    if (existing) throw new AppError("CONFLICT", "An administrator already exists; bootstrap is disabled.", 409);
    const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId));
    if (!user) throw new AppError("NOT_FOUND", "The account must sign in before role assignment.", 404);
    await tx.insert(adminRoles).values({ userId, role: "admin" }).onConflictDoUpdate({ target: adminRoles.userId, set: { role: "admin" } });
    await tx.insert(auditLogs).values({ actorUserId: userId, action: "admin.bootstrap", targetType: "user", targetId: userId,
      reason: rationale, payload: { role: "admin", operatorCommand: true } });
    return { userId, role: "admin" as const };
  });
}

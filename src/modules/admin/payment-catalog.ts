import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getEnv } from "@/config/env";
import { getDb, type Database } from "@/db";
import { adminRoles, auditLogs, products } from "@/db/schema";
import { CatalogProviderError, dodoCatalog } from "@/infrastructure/payments/dodo";
import { AppError } from "@/lib/http/errors";
import { assertManagedProduct, assertPlanProduct, getPaymentPlan, paymentPlans, productCreateInput, productUpdateInput,
  type PaymentPlanKey } from "@/modules/payments/catalog";
import type { AdminActor } from "./access";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Product = typeof products.$inferSelect;
type SyncStatus = "not_synced" | "synced" | "pending" | "uncertain" | "failed" | "conflict";
const actionSchema = z.object({ key: z.enum(["pro_lifetime", "sidebar_ad_monthly"]),
  mode: z.enum(["create", "verify", "bind", "update"]), providerProductId: z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/).optional(),
  reason: z.string().trim().min(8).max(500) }).strict().refine((value) => value.mode === "bind" ? Boolean(value.providerProductId) : !value.providerProductId,
  "Only bind accepts a provider product ID, and it is required");
export const paymentCatalogRequestSchema = z.object({ operation: z.enum(["preview", "confirm"]),
  key: z.enum(["pro_lifetime", "sidebar_ad_monthly"]), mode: z.enum(["create", "verify", "bind", "update"]),
  providerProductId: z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/).optional(), reason: z.string().trim().min(8).max(500),
  token: z.string().max(2000).optional() }).strict();
type Action = z.infer<typeof actionSchema>;
type SyncState = { status: SyncStatus; operationId: string; providerProductId: string | null; environment: string;
  errorCode: string | null; lastSyncedAt: string | null; updatedAt: string };
const stateSchema = z.object({ status: z.enum(["not_synced", "synced", "pending", "uncertain", "failed", "conflict"]),
  operationId: z.uuid(), providerProductId: z.string().nullable(), environment: z.string(), errorCode: z.string().nullable(),
  lastSyncedAt: z.string().nullable(), updatedAt: z.string() });
const proofSchema = z.object({ actor: z.uuid(), nonce: z.uuid(), actionHash: z.string().length(64), stateHash: z.string().length(64),
  environment: z.enum(["test_mode", "live_mode"]), expires: z.number().int() }).strict();
function database() { const db = getDb(); if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Catalog administration is temporarily unavailable.", 503); return db; }
function secret() { const value = getEnv().AUTH_SECRET; if (!value || value.length < 32) throw new AppError("SERVICE_UNAVAILABLE", "Administration is not configured.", 503); return value; }
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const targetId = (key: PaymentPlanKey, environment: string) => `${environment}:${key}`;
async function authorize(tx: Transaction, actor: AdminActor) {
  const [grant] = await tx.select().from(adminRoles).where(eq(adminRoles.userId, actor.userId)).for("share");
  if (grant?.role !== "admin") throw new AppError("FORBIDDEN", "An administrator role is required for payments.", 403);
}
async function readState(tx: Transaction, key: PaymentPlanKey, environment: string) {
  const [product] = await tx.select().from(products).where(eq(products.key, key));
  const [entry] = await tx.select({ payload: auditLogs.payload }).from(auditLogs)
    .where(and(eq(auditLogs.targetType, "payment_catalog"), eq(auditLogs.targetId, targetId(key, environment))))
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id)).limit(1);
  const parsed = stateSchema.safeParse(entry?.payload.state);
  if (entry && !parsed.success) throw new AppError("CONFLICT", "The catalog journal needs operator reconciliation.", 409);
  const [otherEnvironment] = await tx.select({ id: auditLogs.id }).from(auditLogs)
    .where(and(eq(auditLogs.targetType, "payment_catalog"), eq(auditLogs.targetId,
      targetId(key, environment === "test_mode" ? "live_mode" : "test_mode")))).limit(1);
  const environmentConflict = Boolean(otherEnvironment || product?.providerProductId && parsed.success
    && parsed.data.status === "synced" && parsed.data.providerProductId !== product.providerProductId);
  return { product: product ?? null, sync: parsed.success ? parsed.data : null, environmentConflict };
}
function matchesPlan(product: Product | null, key: PaymentPlanKey) {
  if (!product) return true;
  const plan = getPaymentPlan(key);
  return (["kind", "amountCents", "currency", "billingInterval", "entitlementDays", "requiresSite"] as const)
    .every((field) => product[field] === plan[field]);
}
function report(key: PaymentPlanKey, state: Awaited<ReturnType<typeof readState>>) {
  const { product, sync } = state;
  const status: SyncStatus = !matchesPlan(product, key) || state.environmentConflict ? "conflict" : sync?.status ?? "not_synced";
  return { ...getPaymentPlan(key), productId: product?.id ?? null, providerProductId: sync?.providerProductId ?? product?.providerProductId ?? null,
    active: Boolean(status === "synced" && product?.active && product.providerProductId === sync?.providerProductId),
    syncStatus: status, lastErrorCode: state.environmentConflict ? "PROVIDER_ENVIRONMENT_MISMATCH" : !matchesPlan(product, key) ? "LOCAL_PACKAGE_MISMATCH" : sync?.errorCode ?? null,
    lastSyncedAt: sync?.lastSyncedAt ?? null };
}
export async function getPaymentCatalog(actor: AdminActor) {
  const env = getEnv();
  return database().transaction(async (tx) => {
    await authorize(tx, actor);
    const catalog = [];
    for (const plan of paymentPlans) catalog.push(report(plan.key, await readState(tx, plan.key, env.DODO_ENVIRONMENT)));
    return { provider: "dodo" as const, environment: env.DODO_ENVIRONMENT, enabled: env.PAYMENTS_ENABLED,
      configured: Boolean(env.DODO_API_KEY), products: catalog };
  });
}
function validateAction(action: Action, state: Awaited<ReturnType<typeof readState>>) {
  if (state.environmentConflict) throw new AppError("CONFLICT", "This database is bound to a different Dodo environment. Use the matching configuration or an isolated test database.", 409);
  if (!matchesPlan(state.product, action.key)) throw new AppError("CONFLICT", "The saved product differs from this package. Existing prices were preserved; reconcile the local catalog first.", 409);
  const sync = state.sync;
  const providerId = sync?.providerProductId ?? state.product?.providerProductId;
  if (sync?.status === "pending" && Date.now() - new Date(sync.updatedAt).getTime() < 60_000) {
    throw new AppError("CONFLICT", "A catalog operation is running. Wait for its recorded result.", 409);
  }
  if (action.mode === "create" && (providerId || sync?.status === "pending" || sync?.status === "uncertain")) {
    throw new AppError("CONFLICT", "This product is already bound or creation needs reconciliation. Verify or bind the existing Dodo product; do not create another.", 409);
  }
  if (["verify", "update"].includes(action.mode) && !providerId) throw new AppError("CONFLICT", "Bind a Dodo product ID before this action.", 409);
  if (action.mode === "bind" && providerId && providerId !== action.providerProductId) throw new AppError("CONFLICT", "A different Dodo product is already bound. Existing purchase references cannot be replaced here.", 409);
  if (action.mode === "update" && ["pending", "uncertain"].includes(sync?.status ?? "")) throw new AppError("CONFLICT", "Verify the previous Dodo operation before making another change.", 409);
}
function decodeProof(token: string) {
  if (!/^[a-zA-Z0-9_-]{1,1800}\.[a-zA-Z0-9_-]{43}$/.test(token)) throw new AppError("INVALID_REQUEST", "Catalog preview is invalid or expired.", 400);
  const [body, signature] = token.split(".");
  const received = Buffer.from(signature, "base64url"), expected = createHmac("sha256", secret()).update(body).digest();
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new AppError("INVALID_REQUEST", "Catalog preview is invalid or expired.", 400);
  try { const proof = proofSchema.parse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
    if (proof.expires < Date.now()) throw new Error("Expired"); return proof;
  } catch { throw new AppError("INVALID_REQUEST", "Catalog preview is invalid or expired.", 400); }
}
export async function previewPaymentCatalog(actor: AdminActor, raw: unknown) {
  const action = actionSchema.parse(raw), env = getEnv();
  if (!env.DODO_API_KEY) throw new AppError("FEATURE_DISABLED", "Configure DODO_API_KEY on the server before synchronizing products.", 503);
  return database().transaction(async (tx) => {
    await authorize(tx, actor);
    const before = await readState(tx, action.key, env.DODO_ENVIRONMENT);
    validateAction(action, before);
    const payload = { actor: actor.userId, nonce: randomUUID(), actionHash: digest(action), stateHash: digest(before),
      environment: env.DODO_ENVIRONMENT, expires: Date.now() + 300_000 };
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return { before: report(action.key, before), proposed: { ...action, ...getPaymentPlan(action.key),
      environment: env.DODO_ENVIRONMENT, providerMutation: ["create", "update"].includes(action.mode),
      taxCategory: action.mode === "create" ? "saas" : "Preserved from Dodo",
      subscriptionTerm: action.key === "sidebar_ad_monthly" && action.mode === "create" ? "10 years; charged monthly until cancellation or term end" : "Preserved from Dodo",
      priceWillChange: false, remotePriceCheck: "Required during confirmation; mismatches will be blocked" },
    financialMutation: false, token: `${body}.${createHmac("sha256", secret()).update(body).digest("base64url")}`,
    expiresAt: new Date(payload.expires).toISOString() };
  });
}
async function journal(tx: Transaction, actor: AdminActor, action: Action, state: SyncState, previewId: string) {
  await tx.insert(auditLogs).values({ actorUserId: actor.userId, action: `product.dodo.${action.mode}.${state.status}`,
    targetType: "payment_catalog", targetId: targetId(action.key, state.environment), reason: action.reason,
    payload: { previewId, state, financialMutation: false, providerMutation: ["create", "update"].includes(action.mode) },
    createdAt: sql`clock_timestamp()` });
}
/** A committed pending journal precedes every provider call. An ambiguous create cannot be retried. */
export async function executePaymentCatalog(actor: AdminActor, raw: unknown, token: string) {
  const action = actionSchema.parse(raw), proof = decodeProof(token), env = getEnv(), db = database();
  if (proof.actor !== actor.userId || proof.actionHash !== digest(action) || proof.environment !== env.DODO_ENVIRONMENT)
    throw new AppError("FORBIDDEN", "This confirmation does not match the catalog preview.", 403);
  if (!env.DODO_API_KEY) throw new AppError("FEATURE_DISABLED", "Dodo Payments is not configured yet.", 503);
  const prepared = await db.transaction(async (tx) => {
    await authorize(tx, actor);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`catalog:${action.key}`},0))`);
    const [used] = await tx.select({ id: auditLogs.id }).from(auditLogs).where(sql`${auditLogs.payload}->>'previewId'=${proof.nonce}`).limit(1);
    if (used) throw new AppError("CONFLICT", "This confirmation has already been used.", 409);
    const before = await readState(tx, action.key, env.DODO_ENVIRONMENT);
    if (digest(before) !== proof.stateHash) throw new AppError("CONFLICT", "The catalog changed. Review a new preview.", 409);
    validateAction(action, before);
    const plan = getPaymentPlan(action.key);
    const values = { key: plan.key, title: plan.title, kind: plan.kind, amountCents: plan.amountCents, currency: plan.currency,
      billingInterval: plan.billingInterval, entitlementDays: plan.entitlementDays, requiresSite: plan.requiresSite, active: false };
    const [product] = before.product ? await tx.update(products).set({ active: false, updatedAt: sql`now()` }).where(eq(products.id, before.product.id)).returning()
      : await tx.insert(products).values(values).returning();
    const state: SyncState = { status: "pending", operationId: randomUUID(),
      providerProductId: action.providerProductId ?? before.sync?.providerProductId ?? product.providerProductId,
      environment: env.DODO_ENVIRONMENT, errorCode: null, lastSyncedAt: before.sync?.lastSyncedAt ?? null, updatedAt: new Date().toISOString() };
    await journal(tx, actor, action, state, proof.nonce);
    return { product, state, previousStatus: before.sync?.status,
      previousProviderProductId: before.sync?.providerProductId ?? before.product?.providerProductId ?? null };
  });
  const plan = getPaymentPlan(action.key);
  let candidateId = prepared.state.providerProductId;
  let mutationAccepted = false;
  try {
    let remote;
    if (action.mode === "create") {
      remote = await dodoCatalog.create(productCreateInput(plan, prepared.product.id, env.DODO_ENVIRONMENT));
      mutationAccepted = true;
      if (!/^[a-zA-Z0-9_-]{1,200}$/.test(remote.product_id)) throw new CatalogProviderError(true);
      candidateId = remote.product_id;
      assertManagedProduct(remote, plan, prepared.product.id, env.DODO_ENVIRONMENT);
    } else {
      remote = await dodoCatalog.retrieve(candidateId!);
      if (["pending", "uncertain"].includes(prepared.previousStatus ?? "")) assertManagedProduct(remote, plan, prepared.product.id, env.DODO_ENVIRONMENT);
    }
    assertPlanProduct(remote, plan, candidateId!);
    if (action.mode === "update") {
      await dodoCatalog.update(candidateId!, productUpdateInput(remote, plan, prepared.product.id, env.DODO_ENVIRONMENT));
      mutationAccepted = true;
      remote = await dodoCatalog.retrieve(candidateId!);
      assertPlanProduct(remote, plan, candidateId!);
      assertManagedProduct(remote, plan, prepared.product.id, env.DODO_ENVIRONMENT);
      if (remote.name !== plan.title || remote.description !== plan.description) throw new CatalogProviderError(true);
    }
    const state: SyncState = { ...prepared.state, providerProductId: candidateId, status: "synced", errorCode: null,
      lastSyncedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`catalog:${action.key}`},0))`);
      const current = await readState(tx, action.key, env.DODO_ENVIRONMENT);
      if (current.sync?.operationId !== state.operationId || current.product?.id !== prepared.product.id
        || !matchesPlan(current.product, action.key)) throw new AppError("CONFLICT", "The catalog changed during synchronization. Reconcile its provider ID.", 409);
      const [other] = await tx.select({ id: products.id }).from(products).where(eq(products.providerProductId, candidateId!));
      if (other && other.id !== prepared.product.id) throw new AppError("CONFLICT", "That Dodo product is already bound to another local package.", 409);
      await tx.update(products).set({ providerProductId: candidateId, active: true, updatedAt: sql`now()` }).where(eq(products.id, prepared.product.id));
      await journal(tx, actor, action, state, proof.nonce);
    });
    return { status: "synced" as const, product: report(action.key, { product: { ...prepared.product, providerProductId: candidateId, active: true }, sync: state, environmentConflict: false }),
      providerMutation: ["create", "update"].includes(action.mode) };
  } catch (error) {
    const uncertain = mutationAccepted || error instanceof CatalogProviderError && error.uncertain
      || ["pending", "uncertain"].includes(prepared.previousStatus ?? "")
      || action.mode === "create" && !(error instanceof AppError);
    const state: SyncState = { ...prepared.state,
      providerProductId: action.mode === "create" ? candidateId : prepared.previousProviderProductId,
      status: uncertain ? "uncertain" : error instanceof AppError && error.code === "CONFLICT" ? "conflict" : "failed",
      errorCode: uncertain ? "PROVIDER_RECONCILIATION_REQUIRED" : error instanceof AppError ? error.code : "SYNC_FAILED", updatedAt: new Date().toISOString() };
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`catalog:${action.key}`},0))`);
      const current = await readState(tx, action.key, env.DODO_ENVIRONMENT);
      if (current.sync?.operationId === state.operationId) await journal(tx, actor, action, state, proof.nonce);
    });
    if (error instanceof AppError) throw error;
    throw new AppError("UPSTREAM_UNAVAILABLE", "Catalog synchronization failed. Review its recorded status before trying again.", 503);
  }
}

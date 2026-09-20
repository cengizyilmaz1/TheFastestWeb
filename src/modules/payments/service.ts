import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Database } from "@/db";
import { adReservations, backgroundJobs, checkoutOrders, entitlements, jobEvents, paymentEvents, products,
  providerPayments, sites, subscriptions, users } from "@/db/schema";
import { getEnv } from "@/config/env";
import { dodo, isPaymentsEnabled, PaymentProviderError } from "@/infrastructure/payments/dodo";
import type { VerifiedPaymentEvent } from "@/infrastructure/payments/webhook";
import { getCorrelationId } from "@/lib/http/correlation";
import { AppError } from "@/lib/http/errors";
import { enqueueNotification } from "@/modules/notifications/service";
import { listAvailableAdInventory, reconcileAdPayment, reconcileAdSubscription, releaseFailedAdCreation, reserveAdInventory } from "./ads";
import { recordAnalyticsEvent } from "@/modules/analytics/events";
import { verifiedCatalogPredicate } from "./catalog-verification";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const snapshotSchema = z.object({ providerProductId: z.string().min(1).max(200), title: z.string().max(200),
  kind: z.enum(["pro_listing", "featured_listing", "sidebar_ad", "sponsorship"]),
  amountCents: z.number().int().nonnegative(), currency: z.string().regex(/^[A-Z]{3}$/),
  billingInterval: z.enum(["one_time", "month", "year"]), entitlementDays: z.number().int().positive().nullable(),
  requiresSite: z.boolean(), scope: z.enum(["account", "site"]).optional(), analyticsConsent: z.boolean().optional(), analyticsVisitorId: z.uuid().optional() });
type Snapshot = z.infer<typeof snapshotSchema>;
const kinds = { pro_listing: "PRO", featured_listing: "FEATURED", sidebar_ad: "AD_SLOT", sponsorship: "SPONSORSHIP" } as const;

function database() {
  const db = getDb();
  if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Payments are temporarily unavailable.", 503);
  return db;
}
function enabled() {
  if (!isPaymentsEnabled()) throw new AppError("FEATURE_DISABLED", "Payments are not available yet.", 503);
}
export class PaymentBindingError extends AppError {
  readonly retryable = false;
  constructor() { super("CONFLICT", "The payment does not match its order. Manual review is required.", 409); }
}

export async function listProducts() {
  if (!isPaymentsEnabled()) return [];
  const catalog = await database().select({ key: products.key, title: products.title, kind: products.kind,
    amountCents: products.amountCents, currency: products.currency, billingInterval: products.billingInterval,
    entitlementDays: products.entitlementDays, requiresSite: products.requiresSite })
    .from(products).where(and(eq(products.active, true), sql`${products.providerProductId} IS NOT NULL`, verifiedCatalogPredicate()));
  const available = catalog.some((product) => product.kind === "sidebar_ad") ? await listAvailableAdInventory() : [];
  return catalog.filter((product) => (product.kind !== "sidebar_ad" || available.length > 0)
    && (!["featured_listing", "sponsorship"].includes(product.kind) || product.requiresSite));
}

/** The caller supplies only a catalog key and owned site, never a price or provider ID. */
export async function createCheckout(input: { userId: string; productKey: string; siteId?: string; idempotencyKey: string;
  analytics?: { consent: boolean; visitorId?: string }; adInventoryId?: string }) {
  enabled();
  const db = database();
  const prepared = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`checkout:${input.userId}:${input.productKey}:${input.siteId ?? "account"}`}, 0))`);
    const [user] = await tx.select().from(users).where(eq(users.id, input.userId));
    if (!user) throw new AppError("UNAUTHORIZED", "Sign in to purchase a product.", 401);
    const [product] = await tx.select().from(products).where(and(eq(products.key, input.productKey), eq(products.active, true), verifiedCatalogPredicate()));
    if (!product?.providerProductId) throw new AppError("NOT_FOUND", "This product is not available.", 404);
    if (["featured_listing", "sponsorship"].includes(product.kind) && !product.requiresSite) throw new AppError("CONFLICT", "This placement product requires a website-bound catalog configuration.", 409);
    if (product.kind === "sidebar_ad" && (!input.adInventoryId || !input.siteId || !product.requiresSite
      || !(product.billingInterval === "month" && product.entitlementDays === null || product.billingInterval === "one_time" && product.entitlementDays))) {
      throw new AppError("INVALID_REQUEST", "Choose an available placement for this ad product.", 400);
    }
    if (product.kind !== "sidebar_ad" && input.adInventoryId) throw new AppError("INVALID_REQUEST", "This product does not use ad inventory.", 400);
    if (product.requiresSite && !input.siteId) throw new AppError("INVALID_REQUEST", "Choose an owned website for this product.", 400);
    if (!product.requiresSite && input.siteId) throw new AppError("INVALID_REQUEST", "This product applies to your account; do not select a website.", 400);
    if (input.siteId) {
      const [site] = await tx.select({ id: sites.id }).from(sites).where(and(eq(sites.id, input.siteId), eq(sites.ownerId, input.userId))).for("share");
      if (!site) throw new AppError("NOT_FOUND", "Owned website not found.", 404);
    }
    const key = `${input.userId}:${input.idempotencyKey}`;
    const [sameKey] = await tx.select().from(checkoutOrders).where(eq(checkoutOrders.idempotencyKey, key));
    if (sameKey && (sameKey.productId !== product.id || sameKey.siteId !== (input.siteId ?? null))) throw new AppError("CONFLICT", "This checkout key is already in use.", 409);
    const [open] = sameKey ? [sameKey] : await tx.select().from(checkoutOrders).where(and(
      eq(checkoutOrders.userId, input.userId), eq(checkoutOrders.productId, product.id),
      input.siteId ? eq(checkoutOrders.siteId, input.siteId) : sql`${checkoutOrders.siteId} IS NULL`,
      inArray(checkoutOrders.status, ["creating", "pending", "ready", "uncertain"]),
    )).orderBy(desc(checkoutOrders.createdAt)).limit(1);
    if (open) {
      if (product.kind === "sidebar_ad") {
        const [reservation] = await tx.select().from(adReservations).where(eq(adReservations.orderId, open.id));
        if (!reservation || reservation.inventoryId !== input.adInventoryId) throw new AppError("CONFLICT", "An existing checkout reserves a different placement. Reconcile it before starting another.", 409);
      }
      return { order: open, create: false, user };
    }
    const snapshot = snapshotSchema.parse({ ...product, scope: input.siteId ? "site" : "account", analyticsConsent: getEnv().ANALYTICS_ENABLED && input.analytics?.consent === true,
      ...(input.analytics?.consent && input.analytics.visitorId ? { analyticsVisitorId: input.analytics.visitorId } : {}) });
    const [order] = await tx.insert(checkoutOrders).values({ userId: input.userId, siteId: input.siteId,
      productId: product.id, idempotencyKey: key, status: "creating", productSnapshot: snapshot }).returning();
    if (product.kind === "sidebar_ad") await reserveAdInventory(tx, { inventoryId: input.adInventoryId!, orderId: order.id, userId: input.userId, siteId: input.siteId! });
    await recordAnalyticsEvent({ name: "checkout_started", eventKey: `checkout:${order.id}:started`, siteId: order.siteId,
      properties: { kind: snapshot.kind, currency: snapshot.currency, billingInterval: snapshot.billingInterval } }, tx);
    return { order, create: true, user };
  });
  if (!prepared.create) {
    if (prepared.order.status === "ready" && prepared.order.checkoutUrl) return { orderId: prepared.order.id, url: prepared.order.checkoutUrl };
    throw new AppError("CONFLICT", "This checkout is already being processed or needs review. Do not repeat the purchase.", 409);
  }
  const snapshot = snapshotSchema.parse(prepared.order.productSnapshot);
  try {
    const checkout = await dodo.createCheckout({ orderId: prepared.order.id, productId: snapshot.providerProductId,
      email: prepared.user.email, name: prepared.user.name, amountCents: snapshot.amountCents,
      currency: snapshot.currency, billingInterval: snapshot.billingInterval });
    // A fast webhook may mark the order paid before this update. Preserve that state.
    await db.update(checkoutOrders).set({ providerCheckoutId: checkout.id, checkoutUrl: checkout.url,
      status: sql`CASE WHEN ${checkoutOrders.status} = 'paid' THEN 'paid' ELSE 'ready' END`, updatedAt: sql`now()` })
      .where(eq(checkoutOrders.id, prepared.order.id));
    return { orderId: prepared.order.id, url: checkout.url };
  } catch (error) {
    const rejected = (error instanceof PaymentProviderError && !error.uncertain) || (error instanceof AppError && error.code === "CONFLICT");
    await db.transaction(async (tx) => {
      const [updated] = await tx.update(checkoutOrders).set({ status: rejected ? "failed" : "uncertain", updatedAt: sql`now()` })
        .where(and(eq(checkoutOrders.id, prepared.order.id), eq(checkoutOrders.status, "creating"))).returning();
      if (updated && rejected) await releaseFailedAdCreation(tx, updated.id);
    });
    throw error;
  }
}

/** Acknowledgement is sent only after the event AND its queue outbox are durable. */
export async function receivePaymentEvent(event: VerifiedPaymentEvent): Promise<{ duplicate: boolean }> {
  enabled();
  return database().transaction(async (tx) => {
    // metadata/order IDs are verified again using a provider GET in the worker.
    const normalized = { paymentId: event.paymentId ?? null, orderId: event.orderId ?? null };
    const [inserted] = await tx.insert(paymentEvents).values({ providerEventId: event.providerEventId,
      type: event.type, resourceId: event.resourceId, occurredAt: event.occurredAt,
      payloadHash: event.payloadHash, normalizedPayload: normalized })
      .onConflictDoNothing({ target: paymentEvents.providerEventId }).returning();
    if (!inserted) {
      const [existing] = await tx.select().from(paymentEvents).where(eq(paymentEvents.providerEventId, event.providerEventId));
      // Dodo can deliver a refreshed payload for the same event ID. The signed
      // resource identity must agree, while a different payload hash is allowed.
      if (existing.type !== event.type || existing.resourceId !== event.resourceId) throw new PaymentBindingError();
      return { duplicate: true };
    }
    const [job] = await tx.insert(backgroundJobs).values({ queue: "webhooks", kind: "payment.webhook",
      jobKey: `dodo:${inserted.id}`, payload: { eventId: inserted.id }, maxAttempts: getEnv().JOB_MAX_ATTEMPTS,
      correlationId: getCorrelationId() ?? randomUUID() }).returning();
    await tx.insert(jobEvents).values({ jobId: job.id, event: "scheduled", actor: "dodo", attempt: 0 });
    return { duplicate: false };
  });
}

type Order = typeof checkoutOrders.$inferSelect;
async function grant(tx: Transaction, order: Order, snapshot: Snapshot, sourceId: string, start: Date, end: Date | null, active: boolean) {
  // Deleted sites remain valid historical purchases but cannot acquire live access.
  const status = active && (!snapshot.requiresSite || order.siteId) ? "active" : "revoked";
  await tx.insert(entitlements).values({ userId: order.userId, siteId: order.siteId, kind: kinds[snapshot.kind],
    source: "dodo", sourceId, status, startsAt: start, endsAt: end })
    .onConflictDoUpdate({ target: [entitlements.source, entitlements.sourceId, entitlements.kind], set: {
      status, endsAt: snapshot.kind === "sidebar_ad" && snapshot.billingInterval === "one_time" ? sql`CASE WHEN ${entitlements.adSlotId} IS NOT NULL THEN ${entitlements.endsAt} ELSE ${end}::timestamptz END` : end, updatedAt: sql`now()`,
    } });
}
function validDate(value: string): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new PaymentBindingError();
  return date;
}

export async function processPaymentWebhook(eventId: string): Promise<{ status: "processed" | "duplicate" | "ignored" }> {
  enabled();
  const db = database();
  const [event] = await db.select().from(paymentEvents).where(eq(paymentEvents.id, eventId));
  if (!event) throw new PaymentBindingError();
  if (event.processedAt) return { status: "duplicate" };
  const subscriptionEvent = event.type.startsWith("subscription.");
  const paymentId = event.type.startsWith("payment.") ? event.resourceId : event.normalizedPayload.paymentId;
  const payment = !subscriptionEvent && typeof paymentId === "string" ? await dodo.getPayment(paymentId) : null;
  const subscription = subscriptionEvent ? await dodo.getSubscription(event.resourceId)
    : payment?.subscription_id ? await dodo.getSubscription(payment.subscription_id) : null;
  const parsedOrderId = z.uuid().safeParse(subscription?.metadata.order_id ?? payment?.metadata.order_id);
  // Other products on the same Dodo account are acknowledged without app grants.
  if (!parsedOrderId.success) {
    await db.update(paymentEvents).set({ processedAt: sql`now()` }).where(eq(paymentEvents.id, eventId));
    return { status: "ignored" };
  }
  const orderId = parsedOrderId.data;
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`payment-order:${orderId}`}, 0))`);
    const [lockedEvent] = await tx.select().from(paymentEvents).where(eq(paymentEvents.id, eventId)).for("update");
    if (lockedEvent.processedAt) return { status: "duplicate" as const };
    const [order] = await tx.select().from(checkoutOrders).where(eq(checkoutOrders.id, orderId)).for("update");
    if (!order) throw new PaymentBindingError();
    const parsed = snapshotSchema.safeParse(order.productSnapshot);
    if (!parsed.success) throw new PaymentBindingError();
    const snapshot = parsed.data;
    if (subscription && (subscription.product_id !== snapshot.providerProductId || subscription.quantity !== 1
      || subscription.metadata.order_id !== order.id || snapshot.billingInterval === "one_time")) throw new PaymentBindingError();
    if (subscription && snapshot.kind === "sidebar_ad" && (subscription.currency !== snapshot.currency
      || subscription.recurring_pre_tax_amount !== snapshot.amountCents || subscription.payment_frequency_count !== 1
      || subscription.payment_frequency_interval !== "Month" || subscription.on_demand || subscription.trial_period_days)) throw new PaymentBindingError();
    if (payment) {
      if (payment.payment_id !== paymentId || payment.is_update_payment_method) throw new PaymentBindingError();
      if (!subscription && (payment.metadata.order_id !== order.id || payment.product_cart?.length !== 1
        || payment.product_cart[0].product_id !== snapshot.providerProductId || payment.product_cart[0].quantity !== 1)) throw new PaymentBindingError();
      if (order.providerCheckoutId && payment.checkout_session_id && order.providerCheckoutId !== payment.checkout_session_id && !subscription) throw new PaymentBindingError();
      if (!Number.isSafeInteger(payment.total_amount) || payment.total_amount < 0 || !/^[A-Z]{3}$/.test(payment.currency)) throw new PaymentBindingError();
      if (subscription && snapshot.kind === "sidebar_ad") {
        // Keep provider charge creation separate from mutable webhook ordering.
        // This proof comes from the authenticated provider GET, never the webhook body.
        await tx.update(paymentEvents).set({ orderId: order.id, normalizedPayload: { ...event.normalizedPayload,
          verifiedPaymentId: payment.payment_id, verifiedChargeCreatedAt: validDate(payment.created_at).toISOString() } }).where(eq(paymentEvents.id, event.id));
      }
      const [old] = await tx.select().from(providerPayments).where(eq(providerPayments.providerPaymentId, payment.payment_id));
      if (!old || old.occurredAt <= event.occurredAt) {
        const reversed = payment.refund_status === "full";
        const disputed = payment.disputes.some((item) => !["dispute_won", "dispute_cancelled"].includes(item.dispute_status));
        const status = reversed ? "refunded" : disputed ? "disputed" : payment.status === "succeeded" ? "succeeded"
          : ["failed", "cancelled"].includes(payment.status ?? "") ? "failed" : "pending";
        // A later-delivered stale success cannot erase a recorded full reversal.
        const safeStatus = old?.status === "refunded" && status === "succeeded" ? "refunded" : status;
        const [savedPayment] = await tx.insert(providerPayments).values({ providerPaymentId: payment.payment_id, orderId: order.id,
          userId: order.userId, siteId: order.siteId, productId: order.productId, amountCents: payment.total_amount,
          currency: payment.currency, status: safeStatus, providerSubscriptionId: payment.subscription_id, occurredAt: event.occurredAt })
          .onConflictDoUpdate({ target: providerPayments.providerPaymentId, set: { status: safeStatus,
            amountCents: payment.total_amount, currency: payment.currency, occurredAt: event.occurredAt, updatedAt: sql`now()` } }).returning();
        if (safeStatus === "succeeded") await tx.update(checkoutOrders).set({ status: "paid", updatedAt: sql`now()` }).where(eq(checkoutOrders.id, order.id));
        if (safeStatus === "succeeded") await recordAnalyticsEvent({ name: "payment_completed", eventKey: `payment:${savedPayment.id}:completed`, siteId: order.siteId,
          properties: { kind: snapshot.kind, currency: savedPayment.currency, billingInterval: snapshot.billingInterval } }, tx);
        if (safeStatus === "succeeded" || safeStatus === "failed") await enqueueNotification({ userId: order.userId,
          eventKey: `payment:${savedPayment.id}:${safeStatus}`, type: safeStatus === "succeeded" ? "payment_success" : "payment_failed", variables: {} }, tx);
        if (safeStatus === "succeeded" && snapshot.analyticsConsent && snapshot.analyticsVisitorId && getEnv().ANALYTICS_ENABLED && getEnv().DATAFAST_API_KEY
          && (!subscription || payment.checkout_session_id === order.providerCheckoutId)
          && Date.now() - order.createdAt.getTime() < 86_400_000) {
          const [analyticsJob] = await tx.insert(backgroundJobs).values({ queue: "analytics", kind: "analytics.payment", jobKey: `analytics:payment:${savedPayment.id}`,
            payload: { paymentId: savedPayment.id }, maxAttempts: getEnv().JOB_MAX_ATTEMPTS, correlationId: getCorrelationId() ?? randomUUID() })
            .onConflictDoNothing({ target: backgroundJobs.jobKey }).returning();
          if (analyticsJob) await tx.insert(jobEvents).values({ jobId: analyticsJob.id, event: "scheduled", actor: "payments", attempt: 0 });
        }
        if (!subscription) {
          const start = validDate(payment.created_at);
          if (snapshot.kind === "sidebar_ad") await reconcileAdPayment(tx, order.id, safeStatus);
          await grant(tx, order, snapshot, `payment:${payment.payment_id}`, start,
            snapshot.kind !== "sidebar_ad" && snapshot.entitlementDays ? new Date(start.getTime() + snapshot.entitlementDays * 86_400_000) : null, safeStatus === "succeeded");
        }
      }
    }
    if (subscription) {
      const [old] = await tx.select().from(subscriptions).where(eq(subscriptions.providerSubscriptionId, subscription.subscription_id));
      const mayUpdateSubscription = !old || old.providerUpdatedAt <= event.occurredAt;
      const end = mayUpdateSubscription ? validDate(subscription.next_billing_date) : old.currentPeriodEnd;
      if (!end) throw new PaymentBindingError();
      const currentStatus = mayUpdateSubscription ? subscription.status : old.status;
      const [latestPayment] = await tx.select({ status: providerPayments.status, providerPaymentId: providerPayments.providerPaymentId }).from(providerPayments)
        .where(eq(providerPayments.providerSubscriptionId, subscription.subscription_id)).orderBy(desc(providerPayments.occurredAt)).limit(1);
      if (mayUpdateSubscription) {
        await tx.insert(subscriptions).values({ providerSubscriptionId: subscription.subscription_id,
          userId: order.userId, siteId: order.siteId, productId: order.productId, status: subscription.status,
          currentPeriodEnd: end, providerUpdatedAt: event.occurredAt })
          .onConflictDoUpdate({ target: subscriptions.providerSubscriptionId, set: { status: subscription.status,
            currentPeriodEnd: end, providerUpdatedAt: event.occurredAt, updatedAt: sql`now()` } });
        if (!old || old.status !== subscription.status) await enqueueNotification({ userId: order.userId,
          eventKey: `subscription:${subscription.subscription_id}:${event.id}`, type: "subscription_event", variables: {} }, tx);
        if (!old || old.status !== subscription.status) await recordAnalyticsEvent({ name: "subscription_changed", eventKey: `subscription:${event.id}:changed`, siteId: order.siteId,
          properties: { status: subscription.status } }, tx);
      }
      // A payment can arrive after a newer subscription event. Reconcile its new
      // evidence even when that older event cannot overwrite subscription state.
      const [proof] = snapshot.kind === "sidebar_ad" && latestPayment ? await tx.select({ payload: paymentEvents.normalizedPayload }).from(paymentEvents)
        .where(and(eq(paymentEvents.orderId, order.id), sql`${paymentEvents.normalizedPayload}->>'verifiedPaymentId'=${latestPayment.providerPaymentId}`,
          sql`(${paymentEvents.processedAt} IS NOT NULL OR ${paymentEvents.id}=${event.id})`))
        .orderBy(paymentEvents.createdAt).limit(1) : [];
      const chargeCreatedAt = typeof proof?.payload.verifiedChargeCreatedAt === "string" ? validDate(proof.payload.verifiedChargeCreatedAt) : null;
      const blocked = latestPayment && ["refunded", "disputed", "failed"].includes(latestPayment.status);
      const paidCurrentAdPeriod = snapshot.kind !== "sidebar_ad" || latestPayment?.status === "succeeded" && chargeCreatedAt !== null
        && chargeCreatedAt >= validDate(subscription.previous_billing_date) && chargeCreatedAt < end
        && end.getTime() === validDate(subscription.next_billing_date).getTime();
      await grant(tx, order, snapshot, `subscription:${subscription.subscription_id}`, validDate(subscription.created_at), end,
        currentStatus === "active" && !blocked && paidCurrentAdPeriod);
      if (snapshot.kind === "sidebar_ad") await reconcileAdSubscription(tx, { orderId: order.id,
        subscriptionId: subscription.subscription_id, status: currentStatus, endsAt: end,
        paymentStatus: paidCurrentAdPeriod ? latestPayment?.status : latestPayment?.status === "succeeded" ? "pending" : latestPayment?.status });
    }
    await tx.update(paymentEvents).set({ orderId: order.id, processedAt: sql`now()` }).where(eq(paymentEvents.id, event.id));
    return { status: "processed" as const };
  });
}

export async function getOwnedCheckout(id: string, userId: string) {
  const [order] = await database().select({ id: checkoutOrders.id, status: checkoutOrders.status, createdAt: checkoutOrders.createdAt })
    .from(checkoutOrders).where(and(eq(checkoutOrders.id, id), eq(checkoutOrders.userId, userId)));
  if (!order) throw new AppError("NOT_FOUND", "Checkout not found.", 404);
  return order;
}

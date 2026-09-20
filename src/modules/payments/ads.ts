import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { getDb, type Database } from "@/db";
import { adInventory, adReservations, adSlots, checkoutOrders, entitlements, providerPayments, sites, subscriptions } from "@/db/schema";
import { AppError } from "@/lib/http/errors";
import { enqueueNotification } from "@/modules/notifications/service";
import { recordAnalyticsEvent } from "@/modules/analytics/events";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
function database() { const db = getDb(); if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Ad inventory is temporarily unavailable.", 503); return db; }

// Retryable subscriptions may still charge again. Keep their placement reserved,
// even when the last paid display period expires, until provider cancellation.
function recurringHold(orderId: SQL) {
  return sql`EXISTS (SELECT 1 FROM subscriptions s JOIN payment_ledger p ON p.provider_subscription_id=s.provider_subscription_id
    WHERE p.order_id=${orderId} AND s.status IN ('pending','active','on_hold'))`;
}

/** Only already-paid active placements expire; payable checkout holds never do. */
export async function expireAdReservations(tx?: Transaction, inventoryId?: string) {
  const expire = async (transaction: Transaction) => {
    const expired = await transaction.update(adReservations).set({ status: "expired", updatedAt: sql`now()` })
      .where(and(eq(adReservations.status, "active"), sql`${adReservations.endsAt} <= now()`, sql`NOT ${recurringHold(sql`${adReservations.orderId}`)}`,
        inventoryId ? eq(adReservations.inventoryId, inventoryId) : sql`true`)).returning({ adSlotId: adReservations.adSlotId });
    const ids = expired.flatMap((item) => item.adSlotId === null ? [] : [item.adSlotId]);
    if (ids.length) await transaction.update(adSlots).set({ status: "expired", isActive: false }).where(inArray(adSlots.id, ids));
    return { expired: expired.length };
  };
  return tx ? expire(tx) : database().transaction(expire);
}

export async function listAvailableAdInventory() {
  // Read-only: an expired active reservation is considered available, then
  // reserveAdInventory performs its cleanup under the inventory row lock.
  const rows = await database().execute<{ id: string; position: "left" | "right"; orderIndex: number }>(sql`SELECT i.id,i.position,i.order_index AS "orderIndex"
    FROM ad_inventory i WHERE i.active AND NOT EXISTS (SELECT 1 FROM ad_reservations r WHERE r.inventory_id=i.id
      AND (r.status IN ('held','paid') OR (r.status='active' AND (r.ends_at IS NULL OR r.ends_at>now())) OR ${recurringHold(sql`r.order_id`)}))
    AND NOT EXISTS (SELECT 1 FROM ad_slots a WHERE a.position=i.position AND a.order_index=i.order_index AND a.is_active
      AND a.status='active' AND (a.expires_at IS NULL OR a.expires_at>now())) ORDER BY i.position,i.order_index LIMIT 100`);
  return rows.map((row) => ({ ...row }));
}

export async function reserveAdInventory(tx: Transaction, input: { inventoryId: string; orderId: string; userId: string; siteId: string }) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`ad-buyer:${input.userId}`},0))`);
  const [unpaid] = await tx.select({ id: adReservations.id }).from(adReservations).where(and(eq(adReservations.userId, input.userId), eq(adReservations.status, "held")));
  if (unpaid) throw new AppError("CONFLICT", "Reconcile your existing unpaid ad checkout before reserving another placement.", 409);
  const [inventory] = await tx.select().from(adInventory).where(eq(adInventory.id, input.inventoryId)).for("update");
  if (!inventory?.active) throw new AppError("CONFLICT", "This ad placement is not available.", 409);
  await expireAdReservations(tx, inventory.id);
  const [held] = await tx.select({ id: adReservations.id }).from(adReservations).where(and(eq(adReservations.inventoryId, inventory.id),
    sql`(${adReservations.status} IN ('held','paid','active') OR ${recurringHold(sql`${adReservations.orderId}`)})`));
  const [legacy] = await tx.select({ id: adSlots.id }).from(adSlots).where(and(eq(adSlots.position, inventory.position), eq(adSlots.orderIndex, inventory.orderIndex),
    eq(adSlots.isActive, true), eq(adSlots.status, "active"), sql`(${adSlots.expiresAt} IS NULL OR ${adSlots.expiresAt} > now())`));
  if (held || legacy) throw new AppError("CONFLICT", "This ad placement was reserved by another purchase.", 409);
  const [reservation] = await tx.insert(adReservations).values(input).returning();
  return reservation;
}

export async function releaseFailedAdCreation(tx: Transaction, orderId: string) {
  // Used only when checkout creation was definitively rejected before a session.
  await tx.update(adReservations).set({ status: "cancelled", releaseEvidence: "CHECKOUT_CREATION_REJECTED", updatedAt: sql`now()` })
    .where(and(eq(adReservations.orderId, orderId), eq(adReservations.status, "held")));
}

export async function reconcileAdPayment(tx: Transaction, orderId: string, status: string) {
  const [reservation] = await tx.select().from(adReservations).where(eq(adReservations.orderId, orderId)).for("update");
  if (!reservation) throw new AppError("CONFLICT", "The paid advertisement has no inventory reservation. Manual review is required.", 409);
  if (status === "succeeded" && ["cancelled", "refunded", "rejected"].includes(reservation.status)) {
    const error = new AppError("CONFLICT", "A payment arrived for a released reservation. Provider reconciliation is required.", 409);
    Object.assign(error, { retryable: false }); throw error;
  }
  if (status === "refunded") {
    await tx.update(adReservations).set({ status: "refunded", releaseEvidence: "VERIFIED_FULL_REFUND", updatedAt: sql`now()` }).where(eq(adReservations.id, reservation.id));
    if (reservation.adSlotId) await tx.update(adSlots).set({ isActive: false, status: "cancelled" }).where(eq(adSlots.id, reservation.adSlotId));
    return;
  }
  if (status === "disputed") {
    // Preserve capacity while a dispute is unresolved; a won dispute can be reviewed.
    if (reservation.adSlotId) await tx.update(adSlots).set({ isActive: false, status: "pending" }).where(eq(adSlots.id, reservation.adSlotId));
    return;
  }
  if (status !== "succeeded" || reservation.status !== "held") return;
  const [site] = reservation.siteId ? await tx.select().from(sites).where(eq(sites.id, reservation.siteId)) : [];
  if (!site) {
    await tx.update(adReservations).set({ status: "paid", updatedAt: sql`now()` }).where(eq(adReservations.id, reservation.id));
    return; // Preserve purchase for reconciliation; never fabricate creative.
  }
  const [inventory] = await tx.select().from(adInventory).where(eq(adInventory.id, reservation.inventoryId));
  const [slot] = await tx.insert(adSlots).values({ position: inventory.position, orderIndex: inventory.orderIndex,
    name: site.name.slice(0, 200), tagline: (site.tagline ?? site.description).slice(0, 200), url: site.url,
    userId: reservation.userId, isActive: false, status: "pending" }).returning({ id: adSlots.id });
  await tx.update(adReservations).set({ status: "paid", adSlotId: slot.id, updatedAt: sql`now()` }).where(eq(adReservations.id, reservation.id));
}

/** Renew only an already-approved placement from a verified, paid subscription. */
export async function reconcileAdSubscription(tx: Transaction, input: { orderId: string; subscriptionId: string;
  status: string; endsAt: Date; paymentStatus?: string }) {
  if (input.paymentStatus === "succeeded") await reconcileAdPayment(tx, input.orderId, "succeeded");
  if (["refunded", "disputed"].includes(input.paymentStatus ?? "")) await reconcileAdPayment(tx, input.orderId, input.paymentStatus!);
  const [reservation] = await tx.select().from(adReservations).where(eq(adReservations.orderId, input.orderId)).for("update");
  if (!reservation) throw new AppError("CONFLICT", "The subscription has no reserved advertisement. Manual review is required.", 409);
  if (["cancelled", "expired", "failed"].includes(input.status)) {
    await tx.update(adReservations).set({ status: "expired", releaseEvidence: "VERIFIED_SUBSCRIPTION_ENDED", updatedAt: sql`now()` }).where(eq(adReservations.id, reservation.id));
    if (reservation.adSlotId) await tx.update(adSlots).set({ isActive: false, status: "cancelled" }).where(eq(adSlots.id, reservation.adSlotId));
    return;
  }
  if (!reservation.adSlotId || reservation.status !== "active") return; // Creative still needs explicit approval.
  const [slot] = await tx.select().from(adSlots).where(eq(adSlots.id, reservation.adSlotId));
  const active = input.status === "active" && input.paymentStatus === "succeeded" && input.endsAt.getTime() > Date.now();
  if (active && reservation.startsAt && input.endsAt > reservation.startsAt) {
    await tx.update(adReservations).set({ endsAt: input.endsAt, updatedAt: sql`now()` }).where(eq(adReservations.id, reservation.id));
    await tx.update(adSlots).set({ isActive: slot.status === "active", expiresAt: input.endsAt }).where(eq(adSlots.id, slot.id));
    await tx.update(entitlements).set({ adSlotId: slot.id, updatedAt: sql`now()` }).where(and(eq(entitlements.source, "dodo"),
      eq(entitlements.sourceId, `subscription:${input.subscriptionId}`), eq(entitlements.kind, "AD_SLOT")));
  } else {
    await tx.update(adSlots).set({ isActive: false }).where(eq(adSlots.id, slot.id));
  }
}

/** Administrative caller supplies its own preview/audit transaction. */
export async function approveAdReservation(tx: Transaction, reservationId: string) {
  const [reference] = await tx.select({ inventoryId: adReservations.inventoryId }).from(adReservations).where(eq(adReservations.id, reservationId));
  if (!reference) throw new AppError("NOT_FOUND", "Ad reservation not found.", 404);
  const [inventory] = await tx.select().from(adInventory).where(eq(adInventory.id, reference.inventoryId)).for("update");
  const [reservation] = await tx.select().from(adReservations).where(eq(adReservations.id, reservationId)).for("update");
  if (!reservation || !["paid", "active"].includes(reservation.status) || !reservation.adSlotId || !reservation.siteId
    || (reservation.endsAt && reservation.endsAt.getTime() <= Date.now())) throw new AppError("CONFLICT", "Only a paid unexpired reservation with valid creative can be approved.", 409);
  const [order] = await tx.select().from(checkoutOrders).where(eq(checkoutOrders.id, reservation.orderId));
  const [site] = await tx.select().from(sites).where(and(eq(sites.id, reservation.siteId), eq(sites.ownerId, reservation.userId)));
  const payments = await tx.select().from(providerPayments).where(eq(providerPayments.orderId, reservation.orderId)).orderBy(desc(providerPayments.occurredAt));
  const paid = payments.filter((payment) => payment.status === "succeeded");
  const days = order.productSnapshot.entitlementDays;
  const recurring = order.productSnapshot.billingInterval === "month";
  const [subscription] = recurring && paid[0]?.providerSubscriptionId ? await tx.select().from(subscriptions)
    .where(eq(subscriptions.providerSubscriptionId, paid[0].providerSubscriptionId)) : [];
  const [verifiedGrant] = subscription ? await tx.select({ id: entitlements.id }).from(entitlements).where(and(
    eq(entitlements.source, "dodo"), eq(entitlements.sourceId, `subscription:${subscription.providerSubscriptionId}`),
    eq(entitlements.kind, "AD_SLOT"), eq(entitlements.status, "active"), eq(entitlements.userId, reservation.userId),
    eq(entitlements.siteId, reservation.siteId), sql`${entitlements.endsAt}=${subscription.currentPeriodEnd?.toISOString() ?? null}::timestamptz`,
    sql`${entitlements.endsAt}>now()`)) : [];
  const validPayment = recurring ? payments[0]?.status === "succeeded" && subscription?.status === "active"
    && verifiedGrant && subscription.currentPeriodEnd && subscription.currentPeriodEnd.getTime() > Date.now()
    : paid.length === 1 && !payments.some((payment) => ["refunded", "disputed"].includes(payment.status))
      && typeof days === "number" && Number.isInteger(days) && days > 0 && days <= 36500;
  if (!inventory?.active || !site || !validPayment) throw new AppError("CONFLICT", "Payment, ownership or placement needs reconciliation before approval.", 409);
  const [occupied] = await tx.select({ id: adSlots.id }).from(adSlots).where(and(eq(adSlots.position, inventory.position), eq(adSlots.orderIndex, inventory.orderIndex),
    eq(adSlots.isActive, true), eq(adSlots.status, "active"), sql`(${adSlots.expiresAt} IS NULL OR ${adSlots.expiresAt} > now())`));
  if (occupied) throw new AppError("CONFLICT", "This placement already has an active advertisement.", 409);
  const startsAt = reservation.startsAt ?? sql`now()`, endsAt = recurring ? subscription!.currentPeriodEnd! : reservation.endsAt ?? sql`now() + (${days} * interval '1 day')`;
  await tx.update(adReservations).set({ status: "active", startsAt, endsAt, updatedAt: sql`now()` }).where(eq(adReservations.id, reservationId));
  await tx.update(adSlots).set({ status: "active", isActive: true, expiresAt: endsAt }).where(eq(adSlots.id, reservation.adSlotId));
  await tx.update(entitlements).set({ adSlotId: reservation.adSlotId, startsAt, endsAt, updatedAt: sql`now()` })
    .where(and(eq(entitlements.source, "dodo"), eq(entitlements.sourceId, recurring ? `subscription:${subscription!.providerSubscriptionId}` : `payment:${paid[0].providerPaymentId}`), eq(entitlements.kind, "AD_SLOT")));
  await enqueueNotification({ userId: reservation.userId, eventKey: `ad:${reservationId}:approved`, type: "ad_approved", variables: { siteName: site.name } }, tx);
  await recordAnalyticsEvent({ name: "ad_approved", eventKey: `ad:${reservationId}:approved`, siteId: reservation.siteId,
    properties: { placement: inventory.position } }, tx);
}

export async function releaseAdReservation(tx: Transaction, reservationId: string, evidence: string) {
  await tx.execute(sql`SELECT o.id FROM checkout_orders o JOIN ad_reservations r ON r.order_id=o.id WHERE r.id=${reservationId} FOR UPDATE OF o`);
  const [reservation] = await tx.select().from(adReservations).where(eq(adReservations.id, reservationId)).for("update");
  if (!reservation || reservation.status !== "held") throw new AppError("CONFLICT", "Only an unpaid held placement can be released manually. Paid placements require verified refund or expiry.", 409);
  const [paid] = await tx.select({ id: providerPayments.id }).from(providerPayments).where(and(eq(providerPayments.orderId, reservation.orderId), eq(providerPayments.status, "succeeded")));
  if (paid) throw new AppError("CONFLICT", "A confirmed payment exists. Reconcile it before releasing capacity.", 409);
  if (evidence.trim().length < 20 || evidence.length > 1000) throw new AppError("INVALID_REQUEST", "Record the provider cancellation evidence without secrets or customer data.", 400);
  await tx.update(adReservations).set({ status: "cancelled", releaseEvidence: evidence, updatedAt: sql`now()` }).where(eq(adReservations.id, reservationId));
  await tx.update(checkoutOrders).set({ status: "expired", updatedAt: sql`now()` }).where(eq(checkoutOrders.id, reservation.orderId));
}

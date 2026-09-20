import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createCheckout, processPaymentWebhook, receivePaymentEvent } from "../../src/modules/payments/service";
import { listAvailableAdInventory, expireAdReservations } from "../../src/modules/payments/ads";
import { executeAdminAction, previewAdminAction } from "../../src/modules/admin/service";
import { PaymentProviderError } from "../../src/infrastructure/payments/dodo";
import { cleanupIntegrationDatabase, fixtureSql, prepareIntegrationDatabase, resetIntegrationData } from "./database";
const provider = vi.hoisted(() => ({ createCheckout: vi.fn(), getPayment: vi.fn(), getSubscription: vi.fn() }));
const periods = new Map<string, { start: Date; end: Date }>();
vi.mock("../../src/config/env", () => ({ getEnv: () => ({ PAYMENTS_ENABLED: true, EMAIL_ENABLED: false,
  ANALYTICS_ENABLED: false, JOB_MAX_ATTEMPTS: 3, AUTH_SECRET: "synthetic-admin-secret-at-least-32-characters" }) }));
vi.mock("../../src/infrastructure/payments/dodo", async (original) => ({ ...await original<object>(), dodo: provider }));
beforeAll(prepareIntegrationDatabase, 60_000);
afterAll(cleanupIntegrationDatabase, 30_000);
beforeEach(async () => {
  periods.clear();
  await resetIntegrationData(); provider.createCheckout.mockReset().mockImplementation(async (input) => ({ id: `cs_${input.orderId}`, url: "https://checkout.dodopayments.com/synthetic" }));
  provider.getPayment.mockReset(); provider.getSubscription.mockReset();
});
async function owner() {
  const userId = randomUUID(), siteId = randomUUID();
  await fixtureSql()`INSERT INTO users(id,email,name) VALUES(${userId},${`${userId}@example.com`},'Synthetic owner')`;
  await fixtureSql()`INSERT INTO sites(id,slug,name,url,normalized_url,description,owner_name,owner_id) VALUES(${siteId},${siteId},'Synthetic ad',${`https://example.com/${siteId}`},${`https://example.com/${siteId}`},'Synthetic creative','Synthetic owner',${userId})`;
  return { userId, siteId };
}
async function setup() {
  const buyer = await owner(), inventoryId = randomUUID();
  await fixtureSql()`INSERT INTO ad_inventory(id,position,order_index,active) VALUES(${inventoryId},'left',1,true)`;
  await fixtureSql()`INSERT INTO products(key,provider_product_id,title,kind,amount_cents,currency,billing_interval,entitlement_days,requires_site,active)
    VALUES('synthetic-ad','prod_ad','Synthetic advertisement','sidebar_ad',1900,'USD','one_time',30,true,true)`;
  return { ...buyer, inventoryId };
}
async function checkout(input: Awaited<ReturnType<typeof setup>>) {
  return createCheckout({ ...input, productKey: "synthetic-ad", adInventoryId: input.inventoryId, idempotencyKey: randomUUID() });
}
async function pay(orderId: string, status: "succeeded" | "refunded" = "succeeded", offset = 0) {
  provider.getPayment.mockResolvedValue({ payment_id: `pay_${orderId}`, metadata: { order_id: orderId },
    product_cart: [{ product_id: "prod_ad", quantity: 1 }], checkout_session_id: `cs_${orderId}`, status: "succeeded",
    created_at: new Date().toISOString(), total_amount: 1900, currency: "USD", is_update_payment_method: false,
    refund_status: status === "refunded" ? "full" : null, refunds: [], disputes: [] });
  const eventId = `evt_${randomUUID()}`;
  await receivePaymentEvent({ providerEventId: eventId, type: status === "refunded" ? "refund.succeeded" : "payment.succeeded",
    resourceId: status === "refunded" ? "refund_synthetic" : `pay_${orderId}`, paymentId: `pay_${orderId}`,
    occurredAt: new Date(Date.now() + offset), payloadHash: "a".repeat(64) });
  const [event] = await fixtureSql()`SELECT id FROM payment_events WHERE provider_event_id=${eventId}`;
  return processPaymentWebhook(event.id);
}
async function adminAction(userId: string, action: unknown) {
  await fixtureSql()`INSERT INTO admin_roles(user_id,role) VALUES(${userId},'admin') ON CONFLICT DO NOTHING`;
  const actor = { userId, role: "admin" as const }, preview = await previewAdminAction(actor, action);
  return executeAdminAction(actor, action, preview.token);
}

async function monthlySetup() {
  const input = await setup();
  await fixtureSql()`UPDATE products SET billing_interval='month',entitlement_days=NULL WHERE key='synthetic-ad'`;
  return { ...input, ...await checkout(input) };
}
async function subscriptionEvent(orderId: string, input: { status?: string; payment?: boolean; periodStart?: Date; periodEnd?: Date;
  eventOffset?: number; paymentStatus?: string; cancelAtEnd?: boolean; paymentId?: string; paymentCreatedAt?: Date } = {}) {
  const previous = periods.get(orderId);
  const periodStart = input.periodStart ?? previous?.start ?? new Date(Date.now() - 60_000), periodEnd = input.periodEnd ?? previous?.end ?? new Date(Date.now() + 30 * 86400_000);
  periods.set(orderId, { start: periodStart, end: periodEnd });
  const id = `sub_${orderId}`, paymentId = input.paymentId ?? `pay_${randomUUID()}`;
  provider.getSubscription.mockResolvedValue({ subscription_id: id, metadata: { order_id: orderId },
    product_id: "prod_ad", quantity: 1, status: input.status ?? "active", created_at: new Date(Date.now() - 86400_000).toISOString(),
    previous_billing_date: periodStart.toISOString(), next_billing_date: periodEnd.toISOString(), currency: "USD", recurring_pre_tax_amount: 1900,
    payment_frequency_count: 1, payment_frequency_interval: "Month", trial_period_days: 0, on_demand: false, cancel_at_next_billing_date: input.cancelAtEnd ?? false });
  if (input.payment) provider.getPayment.mockResolvedValue({ payment_id: paymentId, metadata: { order_id: orderId },
    subscription_id: id, status: input.paymentStatus ?? "succeeded", created_at: (input.paymentCreatedAt ?? periodStart).toISOString(), total_amount: 1900,
    currency: "USD", is_update_payment_method: false, refund_status: null, refunds: [], disputes: [] });
  const eventId = `evt_${randomUUID()}`;
  await receivePaymentEvent({ providerEventId: eventId, type: input.payment ? "payment.succeeded" : "subscription.active",
    resourceId: input.payment ? paymentId : id, occurredAt: new Date(Date.now() + (input.eventOffset ?? 0)), payloadHash: "b".repeat(64) });
  const [event] = await fixtureSql()`SELECT id FROM payment_events WHERE provider_event_id=${eventId}`;
  return processPaymentWebhook(event.id);
}

describe("verified monthly advertisement subscriptions", () => {
  it("requires a confirmed charge plus explicit creative approval, then renews only the paid period", async () => {
    const input = await monthlySetup(), end = new Date(Date.now() + 30 * 86400_000);
    await subscriptionEvent(input.orderId, { payment: true, periodEnd: end });
    const [reservation] = await fixtureSql()`SELECT id FROM ad_reservations`;
    expect((await fixtureSql()`SELECT is_active FROM ad_slots`)[0].is_active).toBe(false);
    await adminAction(input.userId, { action: "ad.approve", reservationId: reservation.id, reason: "Reviewed monthly payment and creative" });
    expect((await fixtureSql()`SELECT expires_at,is_active FROM ad_slots`)[0]).toMatchObject({ expires_at: end, is_active: true });
    const renewedEnd = new Date(end.getTime() + 30 * 86400_000);
    await subscriptionEvent(input.orderId, { payment: true, eventOffset: 2000, periodEnd: renewedEnd });
    expect((await fixtureSql()`SELECT expires_at,is_active FROM ad_slots`)[0]).toMatchObject({ expires_at: renewedEnd, is_active: true });
    expect((await fixtureSql()`SELECT count(*)::int AS count FROM ad_slots`)[0].count).toBe(1);
  });
  it("blocks subscription-only grants and unpaid renewal approval despite an older succeeded charge", async () => {
    const input = await monthlySetup();
    await subscriptionEvent(input.orderId);
    expect((await fixtureSql()`SELECT count(*)::int AS count FROM ad_slots`)[0].count).toBe(0);
    expect((await fixtureSql()`SELECT status FROM entitlements`)[0].status).toBe("revoked");
    await subscriptionEvent(input.orderId, { payment: true, eventOffset: 1000 });
    await subscriptionEvent(input.orderId, { periodStart: new Date(Date.now() + 2000), eventOffset: 3000 });
    const [reservation] = await fixtureSql()`SELECT id FROM ad_reservations`;
    await expect(adminAction(input.userId, { action: "ad.approve", reservationId: reservation.id,
      reason: "Attempting approval without current renewal payment" })).rejects.toMatchObject({ status: 409 });
    expect((await fixtureSql()`SELECT is_active FROM ad_slots`)[0].is_active).toBe(false);
  });
  it("retains capacity during retryable billing and releases only after verified terminal cancellation", async () => {
    const input = await monthlySetup();
    await subscriptionEvent(input.orderId, { payment: true });
    const [reservation] = await fixtureSql()`SELECT id FROM ad_reservations`;
    await adminAction(input.userId, { action: "ad.approve", reservationId: reservation.id, reason: "Reviewed recurring advertisement creative" });
    await fixtureSql()`UPDATE ad_reservations SET starts_at=now()-interval '32 days',ends_at=now()-interval '1 day'`;
    await subscriptionEvent(input.orderId, { status: "on_hold", eventOffset: 1000 });
    expect((await fixtureSql()`SELECT is_active FROM ad_slots`)[0].is_active).toBe(false);
    expect(await expireAdReservations()).toEqual({ expired: 0 });
    expect(await listAvailableAdInventory()).toEqual([]);
    await subscriptionEvent(input.orderId, { status: "cancelled", eventOffset: 2000 });
    expect(await listAvailableAdInventory()).toHaveLength(1);
    expect((await fixtureSql()`SELECT status FROM ad_reservations`)[0].status).toBe("expired");
  });
  it("scheduled cancellation preserves an already-paid advertisement until provider term end", async () => {
    const input = await monthlySetup(); await subscriptionEvent(input.orderId, { payment: true });
    const [reservation] = await fixtureSql()`SELECT id FROM ad_reservations`;
    await adminAction(input.userId, { action: "ad.approve", reservationId: reservation.id, reason: "Reviewed paid recurring advertisement" });
    await subscriptionEvent(input.orderId, { cancelAtEnd: true, eventOffset: 1000 });
    expect((await fixtureSql()`SELECT is_active FROM ad_slots`)[0].is_active).toBe(true);
    expect(await listAvailableAdInventory()).toEqual([]);
  });
  it("does not treat a late update to a previous charge as payment for the new month", async () => {
    const input = await monthlySetup(), paymentId = `pay_${randomUUID()}`, paidAt = new Date(Date.now() - 29 * 86400_000);
    await subscriptionEvent(input.orderId, { payment: true, paymentId, periodStart: paidAt, paymentCreatedAt: paidAt });
    const [reservation] = await fixtureSql()`SELECT id FROM ad_reservations`;
    await adminAction(input.userId, { action: "ad.approve", reservationId: reservation.id, reason: "Reviewed initial paid monthly advertisement" });
    const initialEnd = (await fixtureSql()`SELECT ends_at FROM ad_reservations`)[0].ends_at;
    await subscriptionEvent(input.orderId, { periodStart: new Date(Date.now() - 1000),
      periodEnd: new Date(Date.now() + 60 * 86400_000), eventOffset: 1000 });
    await subscriptionEvent(input.orderId, { payment: true, paymentId, paymentCreatedAt: paidAt, eventOffset: 2000 });
    expect((await fixtureSql()`SELECT is_active FROM ad_slots`)[0].is_active).toBe(false);
    expect((await fixtureSql()`SELECT ends_at FROM ad_reservations`)[0].ends_at).toEqual(initialEnd);
    expect((await fixtureSql()`SELECT status FROM entitlements`)[0].status).toBe("revoked");
    expect((await fixtureSql()`SELECT normalized_payload->>'verifiedChargeCreatedAt' AS charged FROM payment_events WHERE normalized_payload ? 'verifiedChargeCreatedAt'`)
      .every((event) => event.charged === paidAt.toISOString())).toBe(true);
  });
  it("accepts a delayed payment event after a newer subscription event without losing paid creative", async () => {
    const input = await monthlySetup();
    await subscriptionEvent(input.orderId, { eventOffset: 2000 });
    await subscriptionEvent(input.orderId, { payment: true, eventOffset: 1000 });
    expect((await fixtureSql()`SELECT status FROM ad_reservations`)[0].status).toBe("paid");
    expect((await fixtureSql()`SELECT status,is_active FROM ad_slots`)[0]).toMatchObject({ status: "pending", is_active: false });
    expect((await fixtureSql()`SELECT status FROM entitlements`)[0].status).toBe("active");
    const [reservation] = await fixtureSql()`SELECT id FROM ad_reservations`;
    await adminAction(input.userId, { action: "ad.approve", reservationId: reservation.id, reason: "Reviewed delayed verified payment and creative" });
    expect((await fixtureSql()`SELECT is_active FROM ad_slots`)[0].is_active).toBe(true);
  });
});
describe("durable advertisement inventory", () => {
  it("reserves a placement before one concurrent buyer can open provider checkout", async () => {
    const first = await setup(), second = { ...await owner(), inventoryId: first.inventoryId };
    const outcomes = await Promise.allSettled([checkout(first), checkout(second)]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(provider.createCheckout).toHaveBeenCalledTimes(1);
    expect((await fixtureSql()`SELECT count(*)::int AS count FROM ad_reservations WHERE status='held'`)[0].count).toBe(1);
    expect(await listAvailableAdInventory()).toEqual([]);
  });
  it("keeps ambiguous checkout holds indefinitely without releasing still-payable sessions", async () => {
    const input = await setup(); provider.createCheckout.mockRejectedValue(new PaymentProviderError(true));
    await expect(checkout(input)).rejects.toMatchObject({ uncertain: true });
    await fixtureSql()`UPDATE ad_reservations SET created_at=now()-interval '90 days'`;
    expect(await expireAdReservations()).toEqual({ expired: 0 });
    expect(await listAvailableAdInventory()).toEqual([]);
  });
  it("releases a hold after definitive checkout creation rejection", async () => {
    const input = await setup(); provider.createCheckout.mockRejectedValue(new PaymentProviderError(false));
    await expect(checkout(input)).rejects.toThrow();
    expect((await fixtureSql()`SELECT status FROM ad_reservations`)[0].status).toBe("cancelled");
    expect(await listAvailableAdInventory()).toHaveLength(1);
  });
  it("does not sell a placement still occupied by a valid legacy advertisement", async () => {
    const input = await setup();
    await fixtureSql()`INSERT INTO ad_slots(position,order_index,name,tagline,url,is_active,status,expires_at)
      VALUES('left',1,'Preserved legacy','Synthetic','https://example.org',true,'active',now()+interval '1 day')`;
    expect(await listAvailableAdInventory()).toEqual([]);
    await expect(checkout(input)).rejects.toMatchObject({ status: 409 });
    expect(provider.createCheckout).not.toHaveBeenCalled();
  });
  it("records paid creative as pending, then starts the full duration on audited approval", async () => {
    const input = await setup(), { orderId } = await checkout(input); await pay(orderId);
    const [reservation] = await fixtureSql()`SELECT * FROM ad_reservations`;
    expect(reservation.status).toBe("paid"); expect(reservation.starts_at).toBeNull();
    expect((await fixtureSql()`SELECT is_active,status FROM ad_slots`)[0]).toMatchObject({ is_active: false, status: "pending" });
    await adminAction(input.userId, { action: "ad.approve", reservationId: reservation.id, reason: "Reviewed synthetic ad creative and payment" });
    const [active] = await fixtureSql()`SELECT status,extract(epoch FROM ends_at-starts_at)::int AS seconds FROM ad_reservations`;
    expect(active).toMatchObject({ status: "active", seconds: 30 * 86400 });
    expect((await fixtureSql()`SELECT status,is_active FROM ad_slots`)[0]).toMatchObject({ status: "active", is_active: true });
    expect((await fixtureSql()`SELECT ad_slot_id,ends_at FROM entitlements`)[0].ad_slot_id).toBe(reservation.ad_slot_id);
    const before = (await fixtureSql()`SELECT ends_at FROM entitlements`)[0].ends_at;
    await pay(orderId, "succeeded", 1000);
    expect((await fixtureSql()`SELECT ends_at FROM entitlements`)[0].ends_at).toEqual(before);
  });
  it("verified full refund cancels creative and releases capacity without deleting history", async () => {
    const input = await setup(), { orderId } = await checkout(input); await pay(orderId);
    await pay(orderId, "refunded", 1000);
    expect((await fixtureSql()`SELECT status FROM ad_reservations`)[0].status).toBe("refunded");
    expect((await fixtureSql()`SELECT status,is_active FROM ad_slots`)[0]).toMatchObject({ status: "cancelled", is_active: false });
    expect((await fixtureSql()`SELECT count(*)::int AS count FROM payment_ledger`)[0].count).toBe(1);
    expect(await listAvailableAdInventory()).toHaveLength(1);
  });
  it("unpaid manual release needs explicit provider evidence and a confirmed audit", async () => {
    const input = await setup(); await checkout(input);
    const [reservation] = await fixtureSql()`SELECT id FROM ad_reservations`;
    await adminAction(input.userId, { action: "ad.release", reservationId: reservation.id,
      evidence: "Synthetic provider cancellation case DEMO-001 confirmed", reason: "Provider confirmed hosted session cancellation" });
    expect((await fixtureSql()`SELECT status,release_evidence FROM ad_reservations`)[0]).toMatchObject({ status: "cancelled", release_evidence: "Synthetic provider cancellation case DEMO-001 confirmed" });
    expect(await listAvailableAdInventory()).toHaveLength(1);
  });
  it("cannot release confirmed paid inventory using an unpaid-hold cancellation action", async () => {
    const input = await setup(), { orderId } = await checkout(input); await pay(orderId);
    const [reservation] = await fixtureSql()`SELECT id FROM ad_reservations`;
    await expect(adminAction(input.userId, { action: "ad.release", reservationId: reservation.id,
      evidence: "Synthetic cancellation reference requiring a refund instead", reason: "Attempt to bypass the payment refund requirement" })).rejects.toMatchObject({ status: 409 });
    expect(await listAvailableAdInventory()).toEqual([]);
  });
  it("expires a completed paid window and permits another buyer without erasing the first purchase", async () => {
    const input = await setup(), { orderId } = await checkout(input); await pay(orderId);
    const [reservation] = await fixtureSql()`SELECT id FROM ad_reservations`;
    await adminAction(input.userId, { action: "ad.approve", reservationId: reservation.id, reason: "Reviewed synthetic ad before controlled expiry" });
    await fixtureSql()`UPDATE ad_reservations SET starts_at=now()-interval '31 days',ends_at=now()-interval '1 day'`;
    await fixtureSql()`UPDATE ad_slots SET expires_at=now()-interval '1 day'`;
    expect(await listAvailableAdInventory()).toHaveLength(1);
    await checkout({ ...await owner(), inventoryId: input.inventoryId });
    const reservations = await fixtureSql()`SELECT status FROM ad_reservations ORDER BY created_at`;
    expect(reservations.map((row) => row.status)).toEqual(["expired", "held"]);
    expect((await fixtureSql()`SELECT count(*)::int AS count FROM payment_ledger`)[0].count).toBe(1);
  });
  it("limits a buyer to one unresolved unpaid ad hold across different placements", async () => {
    const input = await setup(); await checkout(input);
    const second = { ...await owner(), inventoryId: randomUUID() };
    await fixtureSql()`INSERT INTO ad_inventory(id,position,order_index,active) VALUES(${second.inventoryId},'right',2,true)`;
    await fixtureSql()`UPDATE sites SET owner_id=${input.userId} WHERE id=${second.siteId}`;
    await expect(checkout({ ...second, userId: input.userId })).rejects.toMatchObject({ status: 409 });
    expect(provider.createCheckout).toHaveBeenCalledTimes(1);
  });
  it("does not silently reactivate inventory when a payment arrives after an audited cancellation", async () => {
    const input = await setup(), { orderId } = await checkout(input);
    const [reservation] = await fixtureSql()`SELECT id FROM ad_reservations`;
    await adminAction(input.userId, { action: "ad.release", reservationId: reservation.id,
      evidence: "Synthetic provider cancellation case DEMO-002 confirmed", reason: "Provider confirmed cancellation before releasing capacity" });
    await expect(pay(orderId)).rejects.toMatchObject({ status: 409, retryable: false });
    expect((await fixtureSql()`SELECT status FROM ad_reservations`)[0].status).toBe("cancelled");
    expect(await fixtureSql()`SELECT id FROM entitlements`).toHaveLength(0);
    expect((await fixtureSql()`SELECT processed_at FROM payment_events`)[0].processed_at).toBeNull();
  });
});

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createCheckout, processPaymentWebhook, receivePaymentEvent } from "../../src/modules/payments/service";
import { deliverNotificationEmail, enqueueNotification, updateNotificationPreferences } from "../../src/modules/notifications/service";
import { MailDeliveryError } from "../../src/infrastructure/email/graph";
import { PaymentProviderError } from "../../src/infrastructure/payments/dodo";
import { processPaymentAnalytics } from "../../src/infrastructure/analytics/datafast";
import { cleanupIntegrationDatabase, fixtureSql, prepareIntegrationDatabase, resetIntegrationData } from "./database";

const config = vi.hoisted(() => ({ PAYMENTS_ENABLED: true, EMAIL_ENABLED: false, ANALYTICS_ENABLED: false,
  DATAFAST_API_KEY: "", JOB_MAX_ATTEMPTS: 3, SITE_URL: "https://thefastestweb.site", EMAIL_UNSUBSCRIBE_SECRET: "synthetic-unsubscribe-secret-at-least-32" }));
const provider = vi.hoisted(() => ({ createCheckout: vi.fn(), getPayment: vi.fn(), getSubscription: vi.fn() }));
const mail = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("../../src/config/env", () => ({ getEnv: () => config }));
vi.mock("../../src/infrastructure/payments/dodo", async (original) => ({ ...await original<object>(), dodo: provider }));
vi.mock("../../src/infrastructure/email/graph", async (original) => ({ ...await original<object>(), graphMail: mail }));

beforeAll(prepareIntegrationDatabase, 60_000);
afterAll(cleanupIntegrationDatabase, 30_000);
beforeEach(async () => {
  await resetIntegrationData(); vi.unstubAllGlobals();
  config.EMAIL_ENABLED = false; config.PAYMENTS_ENABLED = true; config.ANALYTICS_ENABLED = false; config.DATAFAST_API_KEY = "";
  provider.createCheckout.mockReset().mockResolvedValue({ id: "cs_synthetic", url: "https://checkout.dodopayments.com/session_synthetic" });
  provider.getPayment.mockReset(); provider.getSubscription.mockReset();
  mail.send.mockReset().mockResolvedValue({ status: "accepted" });
});

async function setup(recurring = false) {
  const sql = fixtureSql(), userId = randomUUID(), siteId = randomUUID(), productId = randomUUID();
  await sql`INSERT INTO users(id,email,name) VALUES(${userId},${`${userId}@example.com`},'Synthetic owner')`;
  await sql`INSERT INTO sites(id,slug,name,url,normalized_url,description,owner_id,owner_name)
    VALUES(${siteId},${siteId},'Synthetic site',${`https://example.com/${siteId}`},${`https://example.com/${siteId}`},'Synthetic',${userId},'Synthetic owner')`;
  await sql`INSERT INTO products(id,key,provider_product_id,title,kind,amount_cents,currency,billing_interval,entitlement_days,active)
    VALUES(${productId},'pro', 'prod_synthetic','Synthetic Pro','pro_listing',1900,'USD',${recurring ? "month" : "one_time"},${recurring ? null : 30},true)`;
  return { userId, siteId, productId };
}
async function order(recurring = false, analytics = false) {
  const data = await setup(recurring);
  const checkout = await createCheckout({ ...data, productKey: "pro", idempotencyKey: randomUUID(),
    analytics: { consent: analytics, visitorId: "00000000-0000-4000-8000-000000000009" } });
  return { ...data, orderId: checkout.orderId };
}
function payment(orderId: string, overrides: Record<string, unknown> = {}) {
  return { payment_id: "pay_synthetic", metadata: { order_id: orderId }, status: "succeeded", created_at: "2026-09-19T10:00:00Z",
    total_amount: 2090, currency: "USD", checkout_session_id: "cs_synthetic", product_cart: [{ product_id: "prod_synthetic", quantity: 1 }],
    refunds: [], disputes: [], is_update_payment_method: false, ...overrides };
}
async function event(type = "payment.succeeded", resourceId = "pay_synthetic", occurredAt = new Date("2026-09-19T10:00:00Z")) {
  const providerEventId = `evt_${randomUUID()}`;
  await receivePaymentEvent({ providerEventId, type, resourceId, paymentId: type.startsWith("subscription") ? undefined : "pay_synthetic",
    occurredAt, payloadHash: "a".repeat(64) });
  const [row] = await fixtureSql()`SELECT id FROM payment_events WHERE provider_event_id=${providerEventId}`;
  return row.id as string;
}

describe("durable Dodo transactions", () => {
  it.each(["featured_listing", "sponsorship"])("rejects an unfulfillable account-wide %s product before provider checkout", async (kind) => {
    const data = await setup();
    await fixtureSql()`UPDATE products SET kind=${kind},requires_site=false WHERE id=${data.productId}`;
    await expect(createCheckout({ userId: data.userId, productKey: "pro", idempotencyKey: randomUUID() })).rejects.toMatchObject({ status: 409 });
    expect(provider.createCheckout).not.toHaveBeenCalled();
    expect(await fixtureSql()`SELECT id FROM checkout_orders`).toHaveLength(0);
  });
  it("concurrent checkout requests reuse one durable session and server price", async () => {
    const data = await setup();
    const input = { ...data, productKey: "pro", idempotencyKey: randomUUID() };
    await Promise.allSettled(Array.from({ length: 8 }, () => createCheckout(input)));
    expect(provider.createCheckout).toHaveBeenCalledTimes(1);
    const [row] = await fixtureSql()`SELECT count(*)::int AS count FROM checkout_orders`;
    expect(row.count).toBe(1);
    expect(await createCheckout(input)).toMatchObject({ url: "https://checkout.dodopayments.com/session_synthetic" });
    expect(provider.createCheckout.mock.calls[0][0]).not.toHaveProperty("amount");
  });
  it("rejects another user's site before any provider call", async () => {
    const data = await setup(), stranger = randomUUID();
    await fixtureSql()`INSERT INTO users(id,email,name) VALUES(${stranger},'stranger@example.com','Stranger')`;
    await expect(createCheckout({ ...data, userId: stranger, productKey: "pro", idempotencyKey: randomUUID() })).rejects.toMatchObject({ status: 404 });
    expect(provider.createCheckout).not.toHaveBeenCalled();
  });
  it("ambiguous checkout failure stays uncertain and never auto-creates another session", async () => {
    const data = await setup(); provider.createCheckout.mockRejectedValue(new PaymentProviderError(true));
    const input = { ...data, productKey: "pro", idempotencyKey: randomUUID() };
    await expect(createCheckout(input)).rejects.toMatchObject({ uncertain: true });
    await expect(createCheckout({ ...input, idempotencyKey: randomUUID() })).rejects.toMatchObject({ status: 409 });
    expect(provider.createCheckout).toHaveBeenCalledTimes(1);
    expect((await fixtureSql()`SELECT status FROM checkout_orders`)[0].status).toBe("uncertain");
  });
  it("duplicate receipts persist exactly one event and outbox job", async () => {
    const input = { providerEventId: "evt_duplicate", type: "payment.succeeded", resourceId: "pay_synthetic", occurredAt: new Date(), payloadHash: "a".repeat(64) };
    await Promise.all(Array.from({ length: 10 }, () => receivePaymentEvent(input)));
    const [counts] = await fixtureSql()`SELECT (SELECT count(*)::int FROM payment_events) AS events,(SELECT count(*)::int FROM background_jobs) AS jobs`;
    expect({ ...counts }).toEqual({ events: 1, jobs: 1 });
    await expect(receivePaymentEvent({ ...input, resourceId: "different" })).rejects.toMatchObject({ retryable: false });
  });
  it("concurrent webhook processing creates one ledger/grant/notification and preserves tax amount", async () => {
    const data = await order(); provider.getPayment.mockResolvedValue(payment(data.orderId));
    const id = await event();
    const results = await Promise.all(Array.from({ length: 5 }, () => processPaymentWebhook(id)));
    expect(results.filter((item) => item.status === "processed")).toHaveLength(1);
    const [counts] = await fixtureSql()`SELECT (SELECT count(*)::int FROM payment_ledger) AS payments,
      (SELECT count(*)::int FROM entitlements WHERE status='active') AS grants,(SELECT count(*)::int FROM notifications) AS notifications`;
    expect({ ...counts }).toEqual({ payments: 1, grants: 1, notifications: 1 });
    expect((await fixtureSql()`SELECT amount_cents FROM payment_ledger`)[0].amount_cents).toBe(2090);
  });
  it("a foreign product cannot grant access or complete the event", async () => {
    const data = await order(); provider.getPayment.mockResolvedValue(payment(data.orderId, { product_cart: [{ product_id: "other_product", quantity: 1 }] }));
    const id = await event();
    await expect(processPaymentWebhook(id)).rejects.toMatchObject({ retryable: false });
    expect((await fixtureSql()`SELECT count(*)::int AS count FROM entitlements`)[0].count).toBe(0);
    expect((await fixtureSql()`SELECT processed_at FROM payment_events WHERE id=${id}`)[0].processed_at).toBeNull();
  });
  it("refund revokes only Dodo grant and replayed older success cannot restore it", async () => {
    const data = await order();
    await fixtureSql()`INSERT INTO entitlements(user_id,site_id,kind,source,source_id) VALUES(${data.userId},${data.siteId},'PRO','legacy','preserved')`;
    provider.getPayment.mockResolvedValue(payment(data.orderId)); await processPaymentWebhook(await event());
    provider.getPayment.mockResolvedValue(payment(data.orderId, { refund_status: "full" }));
    await processPaymentWebhook(await event("refund.succeeded", "refund_synthetic", new Date("2026-09-20T10:00:00Z")));
    provider.getPayment.mockResolvedValue(payment(data.orderId));
    await processPaymentWebhook(await event("payment.succeeded", "pay_synthetic", new Date("2026-09-19T11:00:00Z")));
    expect((await fixtureSql()`SELECT status FROM entitlements WHERE source='dodo'`)[0].status).toBe("revoked");
    expect((await fixtureSql()`SELECT status FROM entitlements WHERE source='legacy'`)[0].status).toBe("active");
    expect((await fixtureSql()`SELECT status FROM payment_ledger`)[0].status).toBe("refunded");
  });
  it("records payment history after a site is deleted without granting orphaned site access", async () => {
    const data = await order(); await fixtureSql()`DELETE FROM sites WHERE id=${data.siteId}`;
    provider.getPayment.mockResolvedValue(payment(data.orderId)); await processPaymentWebhook(await event());
    expect((await fixtureSql()`SELECT site_id,status FROM payment_ledger`)[0]).toMatchObject({ site_id: null, status: "succeeded" });
    expect((await fixtureSql()`SELECT status FROM entitlements`)[0].status).toBe("revoked");
  });
  it("subscription cancellation revokes its own grant and older active event cannot reinstate it", async () => {
    const data = await order(true);
    const subscription = { subscription_id: "sub_synthetic", product_id: "prod_synthetic", quantity: 1, metadata: { order_id: data.orderId },
      status: "active", created_at: "2026-09-19T10:00:00Z", next_billing_date: "2026-10-19T10:00:00Z" };
    provider.getSubscription.mockResolvedValue(subscription);
    await processPaymentWebhook(await event("subscription.active", "sub_synthetic"));
    provider.getSubscription.mockResolvedValue({ ...subscription, status: "cancelled" });
    await processPaymentWebhook(await event("subscription.cancelled", "sub_synthetic", new Date("2026-09-20T10:00:00Z")));
    provider.getSubscription.mockResolvedValue(subscription);
    await processPaymentWebhook(await event("subscription.active", "sub_synthetic", new Date("2026-09-19T11:00:00Z")));
    expect((await fixtureSql()`SELECT status FROM entitlements`)[0].status).toBe("revoked");
  });
  it("queues consented revenue only from confirmed ledger and omits personal data", async () => {
    config.ANALYTICS_ENABLED = true; config.DATAFAST_API_KEY = "df_synthetic";
    const data = await order(false, true); provider.getPayment.mockResolvedValue(payment(data.orderId));
    await processPaymentWebhook(await event());
    const [job] = await fixtureSql()`SELECT payload FROM background_jobs WHERE kind='analytics.payment'`;
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ transaction_id: "dodo:pay_synthetic" }), { status: 200 }));
    vi.stubGlobal("fetch", request);
    expect(await processPaymentAnalytics(job.payload.paymentId)).toEqual({ status: "recorded" });
    expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({ amount: 20.9, currency: "USD", transaction_id: "dodo:pay_synthetic" });
    expect(request.mock.calls[0][1].body).not.toMatch(/email|customer|name/);
  });
  it("attributes a confirmed cookieless checkout without fabricating cookie consent", async () => {
    config.ANALYTICS_ENABLED = true; config.DATAFAST_API_KEY = "df_synthetic";
    const data = await setup();
    const visitorId = "00000000-0000-4000-8000-000000000009";
    const checkout = await createCheckout({ ...data, productKey: "pro", idempotencyKey: randomUUID(),
      analytics: { consent: false, mode: "cookieless", eligible: true, visitorId } });
    const [order] = await fixtureSql()`SELECT product_snapshot FROM checkout_orders WHERE id=${checkout.orderId}`;
    expect(order.product_snapshot).toMatchObject({ analyticsConsent: false, analyticsMode: "cookieless", analyticsEligible: true, analyticsVisitorId: visitorId });
    provider.getPayment.mockResolvedValue(payment(checkout.orderId));
    await processPaymentWebhook(await event());
    const [job] = await fixtureSql()`SELECT payload FROM background_jobs WHERE kind='analytics.payment'`;
    expect(job).toBeTruthy();
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ transaction_id: "dodo:pay_synthetic" })));
    vi.stubGlobal("fetch", request);
    expect(await processPaymentAnalytics(job.payload.paymentId)).toEqual({ status: "recorded" });
    expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({ datafast_visitor_id: visitorId, transaction_id: "dodo:pay_synthetic" });
    // Revocation after queuing must also stop the durable worker.
    await fixtureSql()`UPDATE checkout_orders SET product_snapshot=jsonb_set(product_snapshot,'{analyticsEligible}','false'::jsonb) WHERE id=${checkout.orderId}`;
    expect(await processPaymentAnalytics(job.payload.paymentId)).toEqual({ status: "skipped" });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("does not create analytics jobs without eligible attribution", async () => {
    config.ANALYTICS_ENABLED = true; config.DATAFAST_API_KEY = "df_synthetic";
    const data = await order(); provider.getPayment.mockResolvedValue(payment(data.orderId));
    await processPaymentWebhook(await event());
    expect((await fixtureSql()`SELECT count(*)::int AS count FROM background_jobs WHERE kind='analytics.payment'`)[0].count).toBe(0);
  });
});

describe("queued notification delivery", () => {
  it("keeps in-app notifications while the email integration is disabled", async () => {
    const data = await setup();
    await enqueueNotification({ userId: data.userId, type: "welcome", eventKey: "welcome:one", variables: {} });
    expect((await fixtureSql()`SELECT count(*)::int AS count FROM notifications`)[0].count).toBe(1);
    expect((await fixtureSql()`SELECT count(*)::int AS count FROM email_deliveries`)[0].count).toBe(0);
  });
  it("checks latest preferences at delivery time and suppresses an opted-out category", async () => {
    config.EMAIL_ENABLED = true; const data = await setup();
    const result = await enqueueNotification({ userId: data.userId, type: "weekly_result", eventKey: "weekly:one", variables: { score: 88 } });
    await updateNotificationPreferences(data.userId, { weekly: false });
    expect(await deliverNotificationEmail(result.deliveryId!)).toEqual({ status: "suppressed" });
    expect(mail.send).not.toHaveBeenCalled();
  });
  it("deduplicates notification, outbox and accepted email retries", async () => {
    config.EMAIL_ENABLED = true; const data = await setup();
    const input = { userId: data.userId, type: "welcome" as const, eventKey: "welcome:one", variables: {} };
    const { deliveryId } = await enqueueNotification(input);
    await enqueueNotification(input);
    expect(await deliverNotificationEmail(deliveryId!)).toEqual({ status: "accepted" });
    expect(await deliverNotificationEmail(deliveryId!)).toEqual({ status: "accepted" });
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect((await fixtureSql()`SELECT count(*)::int AS count FROM background_jobs`)[0].count).toBe(1);
  });
  it("ambiguous Graph send is durable uncertain and cannot automatically resend", async () => {
    config.EMAIL_ENABLED = true; const data = await setup();
    const { deliveryId } = await enqueueNotification({ userId: data.userId, type: "welcome", eventKey: "welcome:one", variables: {} });
    mail.send.mockRejectedValue(new MailDeliveryError("UNCERTAIN", false));
    await expect(deliverNotificationEmail(deliveryId!)).rejects.toMatchObject({ retryable: false });
    await expect(deliverNotificationEmail(deliveryId!)).rejects.toMatchObject({ retryable: false });
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect((await fixtureSql()`SELECT status FROM email_deliveries`)[0].status).toBe("uncertain");
  });
  it("explicit throttling returns to pending for queue backoff", async () => {
    config.EMAIL_ENABLED = true; const data = await setup();
    const { deliveryId } = await enqueueNotification({ userId: data.userId, type: "welcome", eventKey: "welcome:one", variables: {} });
    mail.send.mockRejectedValueOnce(new MailDeliveryError("RATE_LIMITED", true));
    await expect(deliverNotificationEmail(deliveryId!)).rejects.toMatchObject({ retryable: true });
    expect((await fixtureSql()`SELECT status FROM email_deliveries`)[0].status).toBe("pending");
    expect(await deliverNotificationEmail(deliveryId!)).toEqual({ status: "accepted" });
  });
  it("crashed sending lease is marked uncertain instead of resent", async () => {
    config.EMAIL_ENABLED = true; const data = await setup();
    const { deliveryId } = await enqueueNotification({ userId: data.userId, type: "welcome", eventKey: "welcome:one", variables: {} });
    await fixtureSql()`UPDATE email_deliveries SET status='sending',updated_at=now()-interval '5 minutes' WHERE id=${deliveryId!}`;
    await expect(deliverNotificationEmail(deliveryId!)).rejects.toMatchObject({ retryable: false });
    expect((await fixtureSql()`SELECT status FROM email_deliveries`)[0].status).toBe("uncertain");
    expect(mail.send).not.toHaveBeenCalled();
  });
});

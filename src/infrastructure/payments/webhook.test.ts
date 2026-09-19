import { afterEach, describe, expect, it, vi } from "vitest";
import { Webhook } from "standardwebhooks";
import { verifyPaymentWebhook, readWebhookBody } from "./webhook";

const config = vi.hoisted(() => ({ PAYMENTS_ENABLED: true, DODO_WEBHOOK_SECRET: `whsec_${Buffer.alloc(32, 7).toString("base64")}` }));
vi.mock("@/config/env", () => ({ getEnv: () => config }));
const body = JSON.stringify({ type: "payment.succeeded", timestamp: "2026-09-19T10:00:00Z", data: {
  payment_id: "pay_synthetic", metadata: { order_id: "00000000-0000-4000-8000-000000000001" },
  customer: { email: "private@example.com" }, card_last_four: "9999", billing: { street: "private" },
} });
function headers(payload = body, time = new Date()) {
  return new Headers({ "webhook-id": "event_synthetic", "webhook-timestamp": `${Math.floor(time.getTime() / 1000)}`,
    "webhook-signature": new Webhook(config.DODO_WEBHOOK_SECRET).sign("event_synthetic", time, payload) });
}
afterEach(() => { config.PAYMENTS_ENABLED = true; });
describe("signed Dodo ingestion", () => {
  it("verifies original bytes and persists only resource references", () => {
    const event = verifyPaymentWebhook(Buffer.from(body), headers());
    expect(event).toMatchObject({ resourceId: "pay_synthetic", type: "payment.succeeded" });
    expect(JSON.stringify(event)).not.toMatch(/private|9999|billing|customer/);
    expect(event?.payloadHash).toMatch(/^[a-f0-9]{64}$/);
  });
  it("rejects tampered bytes, a missing signature and expired signatures", () => {
    expect(() => verifyPaymentWebhook(Buffer.from(`${body} `), headers())).toThrow("signature");
    expect(() => verifyPaymentWebhook(Buffer.from(body), new Headers())).toThrow("signature");
    expect(() => verifyPaymentWebhook(Buffer.from(body), headers(body, new Date(Date.now() - 600_000)))).toThrow("signature");
  });
  it("acknowledges authenticated unrelated events without recording raw payload", () => {
    const raw = JSON.stringify({ type: "license_key.created", timestamp: new Date().toISOString(), data: {} });
    expect(verifyPaymentWebhook(Buffer.from(raw), headers(raw))).toBeNull();
  });
  it("fails closed when disabled and bounds body size", async () => {
    config.PAYMENTS_ENABLED = false;
    expect(() => verifyPaymentWebhook(Buffer.from(body), headers())).toThrow("not available");
    await expect(readWebhookBody(new Request("https://example.com", { method: "POST", headers: { "Content-Type": "application/json" }, body: "x".repeat(262_145) }))).rejects.toMatchObject({ status: 413 });
  });
  it("reads raw whitespace without JSON normalization", async () => {
    const raw = `  ${body}\n`;
    expect((await readWebhookBody(new Request("https://example.com", { method: "POST", headers: { "Content-Type": "application/json" }, body: raw }))).toString()).toBe(raw);
  });
});

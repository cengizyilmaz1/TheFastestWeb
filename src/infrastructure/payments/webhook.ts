import { createHash } from "node:crypto";
import { Webhook } from "standardwebhooks";
import { z } from "zod";
import { getEnv } from "@/config/env";
import { AppError } from "@/lib/http/errors";

const identifier = z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/);
const envelope = z.object({ type: z.string().regex(/^[a-z_]+\.[a-z_]+$/).max(100),
  timestamp: z.iso.datetime({ offset: true }), data: z.record(z.string(), z.unknown()) });
const resource = z.object({ payment_id: identifier.optional(), subscription_id: identifier.optional(),
  refund_id: identifier.optional(), dispute_id: identifier.optional(),
  metadata: z.object({ order_id: z.uuid().optional() }).optional() });

export type VerifiedPaymentEvent = { providerEventId: string; type: string; resourceId: string;
  paymentId?: string; orderId?: string; occurredAt: Date; payloadHash: string };

export function verifyPaymentWebhook(raw: Buffer, headers: Headers): VerifiedPaymentEvent | null {
  const env = getEnv();
  if (!env.PAYMENTS_ENABLED || !env.DODO_WEBHOOK_SECRET) throw new AppError("FEATURE_DISABLED", "Payments are not available yet.", 503);
  if (raw.length > 262_144) throw new AppError("INVALID_REQUEST", "Webhook body is too large.", 413);
  const eventId = identifier.safeParse(headers.get("webhook-id"));
  if (!eventId.success) throw new AppError("UNAUTHORIZED", "Invalid webhook signature.", 401);
  let value: unknown;
  try {
    value = new Webhook(env.DODO_WEBHOOK_SECRET).verify(raw, {
      "webhook-id": eventId.data, "webhook-timestamp": headers.get("webhook-timestamp") ?? "",
      "webhook-signature": headers.get("webhook-signature") ?? "",
    });
  } catch { throw new AppError("UNAUTHORIZED", "Invalid webhook signature.", 401); }
  const parsed = envelope.safeParse(value);
  if (!parsed.success) throw new AppError("INVALID_REQUEST", "Invalid webhook payload.", 400);
  const family = parsed.data.type.split(".")[0];
  if (!["payment", "subscription", "refund", "dispute"].includes(family)) return null;
  const data = resource.safeParse(parsed.data.data);
  if (!data.success) throw new AppError("INVALID_REQUEST", "Invalid webhook resource.", 400);
  const id = family === "subscription" ? data.data.subscription_id
    : family === "refund" ? data.data.refund_id : family === "dispute" ? data.data.dispute_id : data.data.payment_id;
  if (!id || ((family === "refund" || family === "dispute") && !data.data.payment_id)) {
    throw new AppError("INVALID_REQUEST", "Invalid webhook resource.", 400);
  }
  return { providerEventId: eventId.data, type: parsed.data.type, resourceId: id,
    paymentId: data.data.payment_id, orderId: data.data.metadata?.order_id,
    occurredAt: new Date(parsed.data.timestamp), payloadHash: createHash("sha256").update(raw).digest("hex") };
}

/** Preserve exact bytes before signature verification; bound both time and size. */
export async function readWebhookBody(request: Request): Promise<Buffer> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new AppError("INVALID_REQUEST", "A JSON webhook body is required.", 415);
  }
  if (Number(request.headers.get("content-length")) > 262_144) throw new AppError("INVALID_REQUEST", "Webhook body is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("INVALID_REQUEST", "A webhook body is required.", 400);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([ (async () => {
      const chunks: Uint8Array[] = []; let length = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 262_144) throw new AppError("INVALID_REQUEST", "Webhook body is too large.", 413);
        chunks.push(value);
      }
      return Buffer.concat(chunks);
    })(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new AppError("INVALID_REQUEST", "Webhook body timed out.", 408)), 10_000); }) ]);
  } finally { clearTimeout(timer); await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}

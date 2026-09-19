import { eq } from "drizzle-orm";
import { getEnv } from "@/config/env";
import { getDb } from "@/db";
import { checkoutOrders, providerPayments } from "@/db/schema";
import { AppError } from "@/lib/http/errors";

export function minorToMajor(amount: number, currency: string): number {
  if (!Number.isSafeInteger(amount) || amount < 0 || !/^[A-Z]{3}$/.test(currency)) throw new AppError("INVALID_REQUEST", "Invalid analytics amount.", 400);
  const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return amount / 10 ** digits;
}

export async function recordDataFastPayment(input: { transactionId: string; amountCents: number; currency: string; visitorId: string; timestamp: Date }) {
  const env = getEnv();
  if (!env.ANALYTICS_ENABLED || !env.DATAFAST_API_KEY) return { status: "skipped" as const };
  try {
    const response = await fetch("https://datafa.st/api/v1/payments", { method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${env.DATAFAST_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ transaction_id: input.transactionId, amount: minorToMajor(input.amountCents, input.currency),
        currency: input.currency, datafast_visitor_id: input.visitorId, timestamp: input.timestamp.toISOString() }) });
    if (!response.ok) {
      await response.body?.cancel();
      const error = new AppError("UPSTREAM_UNAVAILABLE", "Analytics attribution is temporarily unavailable.", 503);
      Object.assign(error, { retryable: response.status === 429 || response.status >= 500 });
      throw error;
    }
    const receipt = await response.json() as { transaction_id?: unknown };
    // DataFast can return 200 for a missing initial visitor event. Do not claim
    // attributed revenue unless its response explicitly identifies this payment.
    return { status: receipt.transaction_id === input.transactionId ? "recorded" as const : "skipped" as const };
  } catch (error) {
    if (error instanceof AppError) throw error;
    // DataFast deduplicates transaction_id, so ambiguous requests can be retried.
    throw new AppError("UPSTREAM_UNAVAILABLE", "Analytics attribution is temporarily unavailable.", 503);
  }
}

export async function processPaymentAnalytics(paymentId: string): Promise<{ status: "recorded" | "skipped" }> {
  const env = getEnv();
  if (!env.ANALYTICS_ENABLED || !env.DATAFAST_API_KEY) return { status: "skipped" };
  const db = getDb();
  if (!db) throw new AppError("DATABASE_UNAVAILABLE", "Analytics attribution is temporarily unavailable.", 503);
  const [row] = await db.select({ payment: providerPayments, snapshot: checkoutOrders.productSnapshot, orderCreatedAt: checkoutOrders.createdAt })
    .from(providerPayments).innerJoin(checkoutOrders, eq(checkoutOrders.id, providerPayments.orderId)).where(eq(providerPayments.id, paymentId));
  if (!row || row.payment.status !== "succeeded" || row.snapshot.analyticsConsent !== true || Date.now() - row.orderCreatedAt.getTime() >= 86_400_000
    || typeof row.snapshot.analyticsVisitorId !== "string" || !/^[a-f0-9-]{36}$/i.test(row.snapshot.analyticsVisitorId)) return { status: "skipped" };
  return recordDataFastPayment({ transactionId: `dodo:${row.payment.providerPaymentId}`, amountCents: row.payment.amountCents,
    currency: row.payment.currency, visitorId: row.snapshot.analyticsVisitorId, timestamp: row.payment.occurredAt });
}

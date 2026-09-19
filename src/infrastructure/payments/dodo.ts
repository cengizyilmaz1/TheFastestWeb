import DodoPayments from "dodopayments";
import type { Payment } from "dodopayments/resources/payments";
import type { Subscription } from "dodopayments/resources/subscriptions";
import { getEnv } from "@/config/env";
import { AppError } from "@/lib/http/errors";

export type CheckoutInput = { orderId: string; productId: string; email: string; name: string };
export interface PaymentProvider {
  createCheckout(input: CheckoutInput): Promise<{ id: string; url: string }>;
  getPayment(id: string): Promise<Payment>;
  getSubscription(id: string): Promise<Subscription>;
}

/** Safe public error; provider bodies may contain payment or customer data. */
export class PaymentProviderError extends AppError {
  constructor(readonly uncertain = false) {
    super("UPSTREAM_UNAVAILABLE", uncertain
      ? "Checkout creation needs reconciliation. Please do not repeat this purchase."
      : "The payment provider is temporarily unavailable.", 503);
  }
}

export const isPaymentsEnabled = () => getEnv().PAYMENTS_ENABLED;

function client() {
  const env = getEnv();
  if (!env.PAYMENTS_ENABLED || !env.DODO_API_KEY) throw new AppError("FEATURE_DISABLED", "Payments are not available yet.", 503);
  // Dodo currently does not implement create idempotency. A network retry could
  // create another session; the durable local order is our single-call barrier.
  return new DodoPayments({ bearerToken: env.DODO_API_KEY, environment: env.DODO_ENVIRONMENT,
    maxRetries: 0, timeout: 15_000, logLevel: "off" });
}

export function validateCheckoutUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new PaymentProviderError(true); }
  if (url.protocol !== "https:" || url.username || url.password || url.port
    || !["checkout.dodopayments.com", "test.checkout.dodopayments.com"].includes(url.hostname)) {
    throw new PaymentProviderError(true);
  }
  return url.toString();
}

export const dodo: PaymentProvider = {
  async createCheckout(input) {
    const sdk = client();
    try {
      const session = await sdk.checkoutSessions.create({
        product_cart: [{ product_id: input.productId, quantity: 1 }],
        customer: { email: input.email, name: input.name.slice(0, 120) },
        metadata: { order_id: input.orderId },
        return_url: `${getEnv().SITE_URL}/dashboard?checkout=${encodeURIComponent(input.orderId)}`,
        cancel_url: `${getEnv().SITE_URL}/dashboard?checkout=cancelled`,
        feature_flags: { allow_discount_code: false, allow_currency_selection: false,
          allow_customer_editing_email: false, allow_customer_editing_name: false },
      });
      if (!session.checkout_url || !session.session_id) throw new PaymentProviderError(true);
      return { id: session.session_id, url: validateCheckoutUrl(session.checkout_url) };
    } catch (error) {
      if (error instanceof PaymentProviderError) throw error;
      // Explicit 4xx rejection (except timeout) means no accepted session.
      const rejected = error instanceof DodoPayments.APIError && error.status !== undefined
        && error.status >= 400 && error.status < 500 && error.status !== 408;
      throw new PaymentProviderError(!rejected);
    }
  },
  async getPayment(id) {
    try { return await client().payments.retrieve(id); }
    catch (error) { if (error instanceof AppError) throw error; throw new PaymentProviderError(); }
  },
  async getSubscription(id) {
    try { return await client().subscriptions.retrieve(id); }
    catch (error) { if (error instanceof AppError) throw error; throw new PaymentProviderError(); }
  },
};

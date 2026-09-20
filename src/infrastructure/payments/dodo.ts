import DodoPayments from "dodopayments";
import type { Payment } from "dodopayments/resources/payments";
import type { Subscription } from "dodopayments/resources/subscriptions";
import type { Product, ProductCreateParams, ProductUpdateParams } from "dodopayments/resources/products/products";
import { getEnv } from "@/config/env";
import { AppError } from "@/lib/http/errors";

export type CheckoutInput = { orderId: string; productId: string; email: string; name: string;
  amountCents: number; currency: string; billingInterval: "one_time" | "month" | "year" };
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

function client(catalog = false) {
  const env = getEnv();
  if ((!catalog && !env.PAYMENTS_ENABLED) || !env.DODO_API_KEY) throw new AppError("FEATURE_DISABLED", "Dodo Payments is not configured yet.", 503);
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

export function assertCatalogPrice(product: Product, expected: Pick<CheckoutInput, "productId" | "amountCents" | "currency" | "billingInterval">) {
  const price = product.price;
  const wrong = product.product_id !== expected.productId || Boolean(product.pricing_mode) || price.type === "usage_based_price"
    || !("price" in price) || price.price !== expected.amountCents || price.currency !== expected.currency
    || ("discount" in price && Boolean(price.discount)) || ("discount_bps" in price && Boolean(price.discount_bps))
    || ("purchasing_power_parity" in price && price.purchasing_power_parity)
    || (price.type === "one_time_price" && (expected.billingInterval !== "one_time" || price.pay_what_you_want))
    || (price.type === "recurring_price" && (expected.billingInterval === "one_time" || price.payment_frequency_count !== 1
      || price.payment_frequency_interval.toLowerCase() !== expected.billingInterval || Boolean(price.trial_period_days)));
  if (wrong) throw new AppError("CONFLICT", "This product's provider price needs reconciliation before purchase.", 409);
}

/** Product writes are never retried automatically, including ambiguous timeouts. */
export class CatalogProviderError extends AppError {
  constructor(readonly uncertain = false) {
    super("UPSTREAM_UNAVAILABLE", uncertain
      ? "Dodo may have accepted this change. Reconcile the product ID before trying again."
      : "Dodo could not complete the catalog request. Check its configuration and try again.", 503);
  }
}
function catalogFailure(error: unknown, mutation: boolean): never {
  if (error instanceof AppError) throw error;
  const rejected = error instanceof DodoPayments.APIError && error.status !== undefined
    && error.status >= 400 && error.status < 500 && error.status !== 408;
  throw new CatalogProviderError(mutation && !rejected);
}
export interface CatalogProvider {
  retrieve(id: string): Promise<Product>;
  create(input: ProductCreateParams): Promise<Product>;
  update(id: string, input: ProductUpdateParams): Promise<void>;
}
export const dodoCatalog: CatalogProvider = {
  async retrieve(id) {
    try { return await client(true).products.retrieve(id); } catch (error) { return catalogFailure(error, false); }
  },
  async create(input) {
    try { return await client(true).products.create(input); } catch (error) { return catalogFailure(error, true); }
  },
  async update(id, input) {
    try { await client(true).products.update(id, input); } catch (error) { catalogFailure(error, true); }
  },
};

export const dodo: PaymentProvider = {
  async createCheckout(input) {
    const sdk = client();
    // No session exists yet, so failure of this read is definitively safe.
    try { assertCatalogPrice(await sdk.products.retrieve(input.productId), input); }
    catch (error) { if (error instanceof AppError) throw error; throw new PaymentProviderError(false); }
    try {
      const session = await sdk.checkoutSessions.create({
        product_cart: [{ product_id: input.productId, quantity: 1 }],
        customer: { email: input.email, name: input.name.slice(0, 120) },
        metadata: { order_id: input.orderId },
        return_url: `${getEnv().SITE_URL}/submit?checkout=${encodeURIComponent(input.orderId)}`,
        cancel_url: `${getEnv().SITE_URL}/submit?checkout=cancelled`,
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

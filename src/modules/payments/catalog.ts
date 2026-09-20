import type { Product, ProductCreateParams, ProductUpdateParams } from "dodopayments/resources/products/products";
import { assertCatalogPrice } from "@/infrastructure/payments/dodo";
import { AppError } from "@/lib/http/errors";

/** Original commercial packages. Clients cannot supply a price or billing cycle. */
export const paymentPlans = [
  { key: "pro_lifetime", title: "TheFastestWeb Pro", kind: "pro_listing", amountCents: 900, currency: "USD",
    billingInterval: "one_time", entitlementDays: null, requiresSite: false,
    description: "Lifetime Pro account access on TheFastestWeb. One payment, no subscription." },
  { key: "sidebar_ad_monthly", title: "TheFastestWeb Sidebar Ad", kind: "sidebar_ad", amountCents: 1900, currency: "USD",
    billingInterval: "month", entitlementDays: null, requiresSite: true,
    description: "One sidebar advertising placement, billed monthly. Listing ownership and creative approval are required." },
] as const;
export type PaymentPlan = typeof paymentPlans[number];
export type PaymentPlanKey = PaymentPlan["key"];
export function getPaymentPlan(key: PaymentPlanKey): PaymentPlan {
  const plan = paymentPlans.find((item) => item.key === key);
  if (!plan) throw new AppError("NOT_FOUND", "Payment package not found.", 404);
  return plan;
}
export function productMetadata(productId: string, key: PaymentPlanKey, environment: string) {
  return { application: "thefastestweb", catalog_product_id: productId, catalog_key: key, environment };
}
export function productCreateInput(plan: PaymentPlan, productId: string, environment: string): ProductCreateParams {
  return { name: plan.title, description: plan.description, tax_category: "saas",
    metadata: productMetadata(productId, plan.key, environment),
    price: plan.billingInterval === "one_time"
      ? { type: "one_time_price", currency: "USD", price: plan.amountCents, pay_what_you_want: false,
        discount_bps: 0, purchasing_power_parity: false, tax_inclusive: false }
      : { type: "recurring_price", currency: "USD", price: plan.amountCents, payment_frequency_count: 1,
        payment_frequency_interval: "Month", subscription_period_count: 10, subscription_period_interval: "Year",
        trial_period_days: 0, discount_bps: 0, purchasing_power_parity: false, tax_inclusive: false } };
}
export function assertPlanProduct(product: Product, plan: PaymentPlan, providerProductId: string) {
  assertCatalogPrice(product, { productId: providerProductId, amountCents: plan.amountCents,
    currency: plan.currency, billingInterval: plan.billingInterval });
  if (product.price.type === "recurring_price" && (!Number.isSafeInteger(product.price.subscription_period_count)
    || product.price.subscription_period_count < 1)) {
    throw new AppError("CONFLICT", "The Dodo subscription has no valid billing term. Review its configuration before binding.", 409);
  }
}
export function assertManagedProduct(product: Product, plan: PaymentPlan, productId: string, environment: string) {
  const expected = productMetadata(productId, plan.key, environment);
  if (Object.entries(expected).some(([key, value]) => product.metadata?.[key] !== value)) {
    throw new AppError("CONFLICT", "Only a product created by this site's catalog can be updated or reconcile an uncertain creation. Use verify for an external product.", 409);
  }
}
export function productUpdateInput(product: Product, plan: PaymentPlan, productId: string, environment: string): ProductUpdateParams {
  assertManagedProduct(product, plan, productId, environment);
  // Price, tax, entitlements and provider settings are deliberately omitted.
  return { name: plan.title, description: plan.description,
    metadata: { ...product.metadata, ...productMetadata(productId, plan.key, environment) } };
}

import type { Product } from "dodopayments/resources/products/products";
import { describe, expect, it } from "vitest";
import { assertCatalogPrice, validateCheckoutUrl } from "./dodo";

const expected = { productId: "prod_synthetic", amountCents: 1900, currency: "USD", billingInterval: "one_time" as const };
const product = { product_id: expected.productId, price: { type: "one_time_price", price: 1900, currency: "USD" } } as Product;
describe("Dodo checkout boundaries", () => {
  it("accepts fixed catalog price before tax", () => expect(() => assertCatalogPrice(product, expected)).not.toThrow());
  it.each([
    { price: 2000 }, { currency: "EUR" }, { pay_what_you_want: true }, { discount_bps: 1000 }, { purchasing_power_parity: true },
  ])("rejects undisclosed provider pricing changes %j", (changes) => {
    expect(() => assertCatalogPrice({ ...product, price: { ...product.price, ...changes } } as Product, expected)).toThrow("reconciliation");
  });
  it("rejects an unexpected subscription billing frequency", () => {
    const recurring = { ...product, price: { type: "recurring_price", currency: "USD", price: 1900,
      payment_frequency_count: 3, payment_frequency_interval: "Month" } } as Product;
    expect(() => assertCatalogPrice(recurring, { ...expected, billingInterval: "month" })).toThrow("reconciliation");
  });
  it.each(["https://evil.example/", "javascript:alert(1)", "https://checkout.dodopayments.com.evil.example", "https://name:secret@checkout.dodopayments.com/"])("rejects untrusted redirect %s", (url) => {
    expect(() => validateCheckoutUrl(url)).toThrow();
  });
  it("allows only hosted HTTPS checkout", () => expect(validateCheckoutUrl("https://checkout.dodopayments.com/session")).toBe("https://checkout.dodopayments.com/session"));
});

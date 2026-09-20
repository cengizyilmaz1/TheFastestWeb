import { checkoutAnalyticsHeaders } from "@/infrastructure/analytics/datafast-browser";

export type CatalogProduct = {
  key: string; title: string; kind: string; requiresSite: boolean;
  amountCents: number; currency: string; billingInterval: "one_time" | "month" | "year";
  entitlementDays: number | null;
};
export type CheckoutCatalog = {
  products: CatalogProduct[];
  adInventory: { id: string; position: "left" | "right"; orderIndex: number }[];
};

async function read<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "Purchases are temporarily unavailable.");
  return body as T;
}
export async function loadCheckoutCatalog(): Promise<CheckoutCatalog> {
  return read(await fetch("/api/payments/catalog", { cache: "no-store", signal: AbortSignal.timeout(15_000) }));
}
export function accountPro(catalog: CheckoutCatalog) {
  return catalog.products.find((product) => product.key === "pro_lifetime" && product.kind === "pro_listing" && !product.requiresSite
    && product.billingInterval === "one_time" && product.entitlementDays === null);
}
export function monthlyAd(catalog: CheckoutCatalog) {
  return catalog.products.find((product) => product.key === "sidebar_ad_monthly" && product.kind === "sidebar_ad" && product.requiresSite
    && product.billingInterval === "month");
}
export function productPrice(product: CatalogProduct) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: product.currency, maximumFractionDigits: product.amountCents % 100 ? 2 : 0 }).format(product.amountCents / 100);
}
export function productPeriod(product: CatalogProduct) {
  return product.billingInterval === "one_time" ? "one-time" : product.billingInterval === "month" ? "/month" : "/year";
}

async function checkout(product: CatalogProduct, siteId?: string, adInventoryId?: string) {
  const storageKey = "tfwCheckout:" + product.key + ":" + (siteId || "account") + ":" + (adInventoryId || "");
  let idempotencyKey = sessionStorage.getItem(storageKey);
  if (!idempotencyKey || !/^[a-f0-9-]{36}$/i.test(idempotencyKey)) {
    idempotencyKey = crypto.randomUUID();
    sessionStorage.setItem(storageKey, idempotencyKey);
  }
  const result = await read<{ orderId: string; url: string }>(await fetch("/api/payments/checkout", {
    method: "POST", headers: { "Content-Type": "application/json", ...checkoutAnalyticsHeaders() },
    body: JSON.stringify({ productKey: product.key, siteId, adInventoryId, idempotencyKey }),
    signal: AbortSignal.timeout(30_000),
  }));
  const target = new URL(result.url);
  if (target.protocol !== "https:" || target.username || target.password || !["checkout.dodopayments.com", "test.checkout.dodopayments.com"].includes(target.hostname)) {
    throw new Error("The checkout address could not be verified.");
  }
  if (/^[a-f0-9-]{36}$/i.test(result.orderId)) sessionStorage.setItem("tfwCheckoutOrder:" + result.orderId, storageKey);
  window.location.assign(target.href);
}

export function acknowledgeCheckout(orderId: string) {
  const receiptKey = "tfwCheckoutOrder:" + orderId;
  const attemptKey = sessionStorage.getItem(receiptKey);
  if (attemptKey?.startsWith("tfwCheckout:")) sessionStorage.removeItem(attemptKey);
  sessionStorage.removeItem(receiptKey);
}

export async function startProCheckout() {
  const product = accountPro(await loadCheckoutCatalog());
  if (!product) throw new Error("Pro purchases are not available yet.");
  await checkout(product);
}

const normalizedAddress = (value: string) => {
  const address = new URL(value);
  address.hash = "";
  return address.href.replace(/\/$/, "");
};
export async function startAdCheckout(url: string, position?: "left" | "right", draft?: {
  name: string; tagline: string; usePublished: (name: string, tagline: string) => void;
}) {
  const catalog = await loadCheckoutCatalog();
  const product = monthlyAd(catalog);
  const inventory = catalog.adInventory.find((item) => !position || item.position === position);
  if (!product || !inventory) throw new Error("Advertisement purchases are not available yet.");
  const account = await read<{ ownedSites: { id: string }[] }>(await fetch("/api/founders/collaborations", { cache: "no-store", signal: AbortSignal.timeout(15_000) }));
  const owned = new Set(account.ownedSites.map((site) => site.id));
  if (!owned.size) throw new Error("Submit your website before purchasing a placement.");
  let selected: { id: string; url: string; name: string; tagline: string | null; description: string } | undefined;
  for (let offset = 0; offset < 1000; offset += 100) {
    const page = await read<{ sites: NonNullable<typeof selected>[]; hasMore: boolean }>(await fetch("/api/sites?limit=100&offset=" + offset, { signal: AbortSignal.timeout(15_000) }));
    selected = page.sites.find((site) => owned.has(site.id) && normalizedAddress(site.url) === normalizedAddress(url));
    if (selected || !page.hasMore) break;
  }
  if (!selected) throw new Error("Use the URL of a published website that belongs to your account.");
  const name = selected.name.slice(0, 200), tagline = (selected.tagline ?? selected.description).slice(0, 200);
  if (draft && (draft.name !== name || draft.tagline !== tagline)) {
    draft.usePublished(name, tagline);
    throw new Error("We loaded your published website details. Review the preview, then continue to checkout.");
  }
  await checkout(product, selected.id, inventory.id);
}

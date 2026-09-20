export type PaymentPlan = {
  key: string; title: string; kind: string; amountCents: number; currency: string;
  billingInterval: "one_time" | "month" | "year"; requiresSite: boolean; entitlementDays: number | null;
  productId: string | null; providerProductId: string | null; active: boolean;
  syncStatus: "not_synced" | "synced" | "pending" | "uncertain" | "failed" | "conflict";
  lastErrorCode: string | null; lastSyncedAt: string | null;
};
export type PaymentCatalog = {
  provider: "dodo"; environment: "test_mode" | "live_mode";
  enabled: boolean; configured: boolean; products: PaymentPlan[];
};
export type CatalogMode = "create" | "verify" | "bind" | "update";
export type CatalogAction = { key: string; mode: CatalogMode; providerProductId?: string; reason: string };
export type CatalogPreview = { before: PaymentPlan; proposed: CatalogAction & Pick<PaymentPlan,
  "title" | "kind" | "amountCents" | "currency" | "billingInterval" | "requiresSite" | "entitlementDays"> & {
  environment: PaymentCatalog["environment"]; providerMutation: boolean; priceWillChange: false; remotePriceCheck: string;
  taxCategory: string; subscriptionTerm: string;
}; token: string; expiresAt: string; financialMutation: false };
export type CatalogResult = { status: string; product: PaymentPlan; providerMutation: boolean };

async function read<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "The payment catalog could not be loaded.");
  return body as T;
}

export async function loadPaymentCatalog(): Promise<PaymentCatalog> {
  return read(await fetch("/api/admin/payment-catalog", { cache: "no-store", signal: AbortSignal.timeout(15_000) }));
}

export async function previewCatalogAction(action: CatalogAction): Promise<CatalogPreview> {
  return read(await fetch("/api/admin/payment-catalog", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation: "preview", ...action }), signal: AbortSignal.timeout(30_000) }));
}

export async function confirmCatalogAction(action: CatalogAction, token: string): Promise<CatalogResult> {
  if (!token) throw new Error("Review the product sync before confirming it.");
  return read(await fetch("/api/admin/payment-catalog", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation: "confirm", ...action, token }), signal: AbortSignal.timeout(60_000) }));
}

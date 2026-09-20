"use client";

import { useEffect, useState } from "react";
import { productPrice } from "@/components/pricing/checkout-client";
import { confirmCatalogAction, loadPaymentCatalog, previewCatalogAction, type CatalogAction,
  type CatalogMode, type CatalogPreview, type PaymentCatalog, type PaymentPlan } from "./catalog-client";

const field = "w-full rounded-[10px] border border-border bg-bg-card px-3 py-2.5 text-[0.85rem] text-text-primary outline-none focus:border-accent disabled:opacity-60";
const secondary = "rounded-[10px] border border-border bg-bg-card px-4 py-2.5 text-[0.82rem] font-semibold text-text-primary hover:border-border-light disabled:cursor-not-allowed disabled:opacity-50";
const primary = "rounded-[10px] bg-gradient-to-br from-accent to-accent-bright px-4 py-2.5 text-[0.85rem] font-bold text-bg-deep disabled:cursor-not-allowed disabled:opacity-50";
const actions: Record<CatalogMode, { label: string; detail: string; confirm: string }> = {
  create: { label: "Create and link product", detail: "Create a Dodo product at the price shown and link it to this package.", confirm: "Create and link in Dodo" },
  verify: { label: "Verify linked product", detail: "Read the linked Dodo product and check its price, currency, and billing period.", confirm: "Verify Dodo product" },
  bind: { label: "Link existing product", detail: "Verify an existing Dodo product against this package before linking it. Its price is not changed.", confirm: "Verify and link product" },
  update: { label: "Update product details", detail: "Update the name and metadata of the linked app-owned product. Its price and billing period stay unchanged.", confirm: "Update details in Dodo" },
};
const statusLabels: Record<PaymentPlan["syncStatus"], string> = {
  not_synced: "Not synced", synced: "Synced", pending: "In progress", uncertain: "Needs verification", failed: "Failed", conflict: "Does not match",
};

function terms(product: Pick<PaymentPlan, "key" | "title" | "kind" | "amountCents" | "currency" | "billingInterval" | "requiresSite" | "entitlementDays">) {
  return `${productPrice(product)} ${product.billingInterval === "one_time" ? "one-time · lifetime" : product.billingInterval === "month" ? "/ month" : "/ year"}`;
}

export function PaymentCatalogPanel() {
  const [catalog, setCatalog] = useState<PaymentCatalog | null>(null);
  const [key, setKey] = useState("pro_lifetime");
  const [mode, setMode] = useState<CatalogMode>("create");
  const [providerId, setProviderId] = useState("");
  const [reason, setReason] = useState("");
  const [review, setReview] = useState<{ action: CatalogAction; preview: CatalogPreview } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    let active = true;
    void loadPaymentCatalog().then((value) => {
      if (!active) return;
      setCatalog(value);
      const initial = value.products.find((item) => item.key === "pro_lifetime") ?? value.products[0];
      if (initial) { setKey(initial.key); setMode(initial.providerProductId ? "verify" : "create"); }
    }).catch((failure) => { if (active) setError(failure instanceof Error ? failure.message : "The payment catalog could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const selected = catalog?.products.find((item) => item.key === key);
  const createBlocked = Boolean(selected?.providerProductId || ["pending", "uncertain", "conflict"].includes(selected?.syncStatus ?? ""));
  const modeBlocked = mode === "create" ? createBlocked : ["verify", "update"].includes(mode) ? !selected?.providerProductId : !providerId.trim();
  const canReview = Boolean(catalog?.configured && selected && !modeBlocked && reason.trim().length >= 8);

  async function refresh() {
    setLoading(true); setError(""); setReview(null);
    try { setCatalog(await loadPaymentCatalog()); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "The payment catalog could not be loaded."); }
    finally { setLoading(false); }
  }

  async function preview() {
    if (!selected || !canReview) return;
    setBusy(true); setError(""); setStatus("");
    const action: CatalogAction = { key, mode, reason: reason.trim(), ...(mode === "bind" ? { providerProductId: providerId.trim() } : {}) };
    try { setReview({ action, preview: await previewCatalogAction(action) }); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "The sync could not be previewed."); }
    finally { setBusy(false); }
  }

  async function confirm() {
    if (!review) return;
    setBusy(true); setError(""); setStatus("");
    try {
      const result = await confirmCatalogAction(review.action, review.preview.token);
      setStatus(`Product sync ${result.status}. ${result.providerMutation ? "Dodo was updated." : "Provider verification completed."}`);
      setCatalog(await loadPaymentCatalog());
      setMode("verify");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The sync result could not be confirmed. Refresh the status before retrying.");
      try { setCatalog(await loadPaymentCatalog()); } catch { /* Keep the last known state until an explicit refresh. */ }
    } finally { setReview(null); setBusy(false); }
  }

  return <section aria-labelledby="payment-catalog-title" className="mt-8">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div><h2 id="payment-catalog-title" className="font-display text-[1.35rem] font-[800] tracking-[-0.02em]">Dodo product catalog</h2>
        <p className="mt-2 max-w-[600px] text-[0.82rem] leading-relaxed text-text-secondary">Review the original packages and sync their Dodo products. Every change requires a preview and confirmation.</p></div>
      <button type="button" className={secondary} disabled={loading || busy} onClick={refresh}>{loading ? "Loading…" : "Refresh status"}</button>
    </div>

    {error && <p role="alert" className="mb-5 rounded-[10px] border border-red/30 bg-red/10 p-3 text-[0.85rem] text-red">{error}</p>}
    {status && <p role="status" className="mb-5 rounded-[10px] border border-green/30 bg-green/10 p-3 text-[0.85rem] text-green">{status}</p>}
    {loading && !catalog && <p role="status" className="text-[0.85rem] text-text-secondary">Loading payment settings…</p>}

    {catalog && <>
      <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[10px] border border-border bg-bg-card px-4 py-3 text-[0.8rem]">
        <span className="font-semibold">Dodo · {catalog.environment === "live_mode" ? "Live mode" : "Test mode"}</span>
        <span className={catalog.configured ? "text-green" : "text-orange"}>{catalog.configured ? "Credentials configured" : "Server credentials required"}</span>
        <span className="text-text-secondary">Checkout {catalog.enabled ? "enabled" : "disabled"}</span>
      </div>
      {!catalog.configured && <p className="mb-5 text-[0.82rem] text-text-secondary">Configure Dodo credentials in the server environment before syncing. Credentials are never entered in this panel.</p>}

      <div className="mb-7 grid grid-cols-2 gap-4 max-[640px]:grid-cols-1" aria-label="Payment packages">
        {catalog.products.map((product) => <button type="button" key={product.key} aria-pressed={key === product.key} disabled={busy || Boolean(review)}
          onClick={() => { setKey(product.key); setMode(product.providerProductId ? "verify" : "create"); setProviderId(""); setStatus(""); }}
          className={`rounded-[14px] border bg-bg-card p-5 text-left transition-colors disabled:cursor-not-allowed ${key === product.key ? "border-accent" : "border-border hover:border-border-light"}`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-display text-[1.1rem] font-[800]">{product.title}</h3>
            <span className={`text-[0.72rem] font-semibold ${product.syncStatus === "synced" ? "text-green" : "text-orange"}`}>{statusLabels[product.syncStatus]}</span></div>
          <p className="font-mono text-[1.25rem] font-bold">{terms(product)}</p>
          <p className="mt-2 text-[0.78rem] text-text-secondary">{product.requiresSite ? "Applies to an owned website" : "Applies to the account"} · {product.active ? "Active" : "Inactive"}</p>
          <p className="mt-4 break-all font-mono text-[0.72rem] text-text-secondary">{product.providerProductId || "No Dodo product linked"}</p>
          {product.lastErrorCode && <p className="mt-2 text-[0.72rem] text-orange">Last result: {product.lastErrorCode}</p>}
          {product.lastSyncedAt && <p className="mt-2 text-[0.72rem] text-text-secondary">Last synced: {new Date(product.lastSyncedAt).toLocaleString()}</p>}
        </button>)}
      </div>

      {selected && <section aria-labelledby="catalog-sync-title" className="rounded-[14px] border border-border bg-bg-main p-5 max-[640px]:p-4">
        <h3 id="catalog-sync-title" className="font-display text-[1.15rem] font-[800]">Sync {selected.title}</h3>
        <div className="mt-4 grid gap-4 min-[640px]:grid-cols-2">
          <label className="text-[0.8rem] font-semibold text-text-secondary">Action
            <select className={`${field} mt-1.5`} value={mode} disabled={busy || Boolean(review)} onChange={(event) => setMode(event.target.value as CatalogMode)}>
              {(Object.keys(actions) as CatalogMode[]).map((action) => <option value={action} key={action}
                disabled={action === "create" ? createBlocked : ["verify", "update"].includes(action) ? !selected.providerProductId : false}>{actions[action].label}</option>)}
            </select>
          </label>
          <div className="self-center text-[0.8rem] leading-relaxed text-text-secondary">{actions[mode].detail}</div>
          {mode === "bind" && <label className="text-[0.8rem] font-semibold text-text-secondary min-[640px]:col-span-2">Existing Dodo product ID
            <input className={`${field} mt-1.5 font-mono`} value={providerId} onChange={(event) => setProviderId(event.target.value)} maxLength={200} autoComplete="off" spellCheck={false} disabled={busy || Boolean(review)} placeholder="pdt_…" />
          </label>}
          <label className="text-[0.8rem] font-semibold text-text-secondary min-[640px]:col-span-2">Reason for this action
            <textarea className={`${field} mt-1.5 min-h-[88px] font-body`} value={reason} onChange={(event) => setReason(event.target.value)} minLength={8} maxLength={500}
              disabled={busy || Boolean(review)} placeholder="Brief reason for the audit log. Do not include secrets." />
          </label>
        </div>
        {createBlocked && !selected.providerProductId && <p className="mt-3 text-[0.8rem] leading-relaxed text-orange">A previous sync needs verification. Link the existing Dodo product after checking it in Dodo before attempting another create.</p>}

        {review && <div className="mt-5 rounded-[10px] border border-accent/40 bg-accent/5 p-4" aria-label="Sync preview">
          <h4 className="font-semibold text-[0.9rem]">Review before confirming</h4>
          <dl className="mt-3 grid grid-cols-[100px_1fr] gap-x-3 gap-y-2 text-[0.8rem] max-[400px]:grid-cols-1">
            <dt className="text-text-secondary">Environment</dt><dd>{review.preview.proposed.environment === "live_mode" ? "Live Dodo account" : "Test Dodo account"}</dd>
            <dt className="text-text-secondary">Action</dt><dd>{actions[review.action.mode].label}</dd>
            <dt className="text-text-secondary">Package</dt><dd>{review.preview.proposed.title} · {terms(review.preview.proposed)}</dd>
            <dt className="text-text-secondary">Product ID</dt><dd className="break-all font-mono text-[0.75rem]">{review.action.providerProductId || review.preview.before.providerProductId || "New product will be created"}</dd>
            <dt className="text-text-secondary">Tax category</dt><dd>{review.preview.proposed.taxCategory}</dd>
            {review.preview.proposed.billingInterval === "month" && <><dt className="text-text-secondary">Term</dt><dd>{review.preview.proposed.subscriptionTerm}</dd></>}
            <dt className="text-text-secondary">Reason</dt><dd className="break-words">{review.action.reason}</dd>
          </dl>
          <p className="mt-3 text-[0.75rem] text-text-secondary">{actions[review.action.mode].detail} Dodo price verification runs on confirmation; a mismatch prevents activation. Preview expires {new Date(review.preview.expiresAt).toLocaleTimeString()}.</p>
          <div className="mt-4 flex flex-wrap gap-3"><button type="button" className={primary} disabled={busy} onClick={confirm}>{busy ? "Syncing…" : actions[review.action.mode].confirm}</button>
            <button type="button" className={secondary} disabled={busy} onClick={() => setReview(null)}>Discard preview</button></div>
        </div>}
        {!review && <button type="button" className={`${primary} mt-5`} disabled={busy || loading || !canReview} onClick={preview}>{busy ? "Preparing preview…" : "Preview product sync"}</button>}
      </section>}
    </>}
  </section>;
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminAction } from "@/modules/admin/service";

export default function ProductForm() {
  const router = useRouter();
  const [preview, setPreview] = useState<{ token: string; proposed: AdminAction; before: unknown } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget), days = String(form.get("days") ?? "");
    const action = preview?.proposed ?? { action: "product.save", reason: form.get("reason"), product: {
      id: String(form.get("id") || crypto.randomUUID()), key: form.get("key"), providerProductId: form.get("providerProductId") || null,
      title: form.get("title"), kind: form.get("kind"), amountCents: Number(form.get("amountCents")), currency: String(form.get("currency")).toUpperCase(),
      billingInterval: form.get("interval"), entitlementDays: days ? Number(days) : null, requiresSite: form.has("requiresSite"), active: form.has("active"),
    } };
    try {
      const response = await fetch("/api/admin/actions", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: preview ? "confirm" : "preview", action, ...(preview ? { token: preview.token } : {}) }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Catalog update failed.");
      if (preview) { setPreview(null); setMessage(`Catalog saved. Audit ${result.auditId}.`); router.refresh(); } else setPreview(result);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Catalog update failed."); }
    finally { setBusy(false); }
  }
  return <section className="mt-8 rounded-xl border border-border bg-bg-card p-6"><h2 className="text-xl font-semibold">Product catalog</h2><p className="mt-2 text-sm text-text-secondary">Use approved provider product IDs and prices. Amounts use currency minor units; tax is calculated by the provider. Leave record ID empty to create a product. Deactivate records to preserve purchase history.</p>
    <form onSubmit={submit} className="mt-5"><fieldset disabled={busy || Boolean(preview)} className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm">Existing record ID<input className="form-field mt-2" name="id" placeholder="Empty creates a new UUID" /></label>
      <label className="text-sm">Catalog key<input className="form-field mt-2" name="key" required pattern="[a-z0-9_-]+" maxLength={80} /></label>
      <label className="text-sm">Title<input className="form-field mt-2" name="title" required minLength={2} maxLength={200} /></label>
      <label className="text-sm">Dodo product ID<input className="form-field mt-2" name="providerProductId" maxLength={200} /></label>
      <label className="text-sm">Access kind<select className="form-field mt-2" name="kind"><option value="pro_listing">Pro listing</option><option value="featured_listing">Featured listing</option><option value="sponsorship">Sponsorship</option><option value="sidebar_ad">Sidebar ad (fixed duration)</option></select></label>
      <label className="text-sm">Billing interval<select className="form-field mt-2" name="interval"><option value="one_time">One time</option><option value="month">Monthly</option><option value="year">Yearly</option></select></label>
      <label className="text-sm">Amount in minor units<input className="form-field mt-2" name="amountCents" type="number" min={0} max={2147483647} step={1} required /></label>
      <label className="text-sm">Currency<input className="form-field mt-2" name="currency" required minLength={3} maxLength={3} placeholder="ISO 4217" /></label>
      <label className="text-sm">One-time access duration (days)<input className="form-field mt-2" name="days" type="number" min={1} max={36500} placeholder="Empty = no fixed expiry" /></label>
      <div className="flex flex-col justify-center gap-3 text-sm"><label><input name="requiresSite" type="checkbox" defaultChecked className="mr-2" /> Requires an owned site</label><label><input name="active" type="checkbox" className="mr-2" /> Active in checkout</label></div>
      <label className="text-sm sm:col-span-2">Reason<textarea className="form-field mt-2" name="reason" required minLength={8} maxLength={500} /></label>
    </fieldset>{preview && <pre className="mt-5 overflow-auto rounded border border-border p-4 text-xs">{JSON.stringify({ before: preview.before, proposed: preview.proposed }, null, 2)}</pre>}
      <div className="mt-5 flex gap-3"><button className="button-primary" type="submit" disabled={busy}>{busy ? "Working…" : preview ? "Confirm catalog change" : "Preview catalog change"}</button>{preview && <button className="button-secondary" type="button" onClick={() => setPreview(null)}>Discard preview</button>}</div>
      <p role="status" className="mt-4 text-sm">{message}</p></form></section>;
}


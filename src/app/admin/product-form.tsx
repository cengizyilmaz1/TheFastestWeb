"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminAction } from "@/modules/admin/service";
import { FormSection, FormStatus, PreviewBoard, checkbox, field, label, primaryButton, secondaryButton, toggleRow } from "./form-ui";

export default function ProductForm() {
  const router = useRouter();
  const [preview, setPreview] = useState<{ token: string; proposed: AdminAction; before: unknown } | null>(null);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(""); setFailed(false);
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
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "Catalog update failed."); }
    finally { setBusy(false); }
  }
  return <FormSection title="Product catalog" detail="Use approved provider product IDs and prices. Amounts use currency minor units; tax is calculated by the provider. Leave record ID empty to create a product. Deactivate records to preserve purchase history.">
    <form onSubmit={submit}><fieldset disabled={busy || Boolean(preview)} className="grid min-w-0 gap-x-5 gap-y-5 sm:grid-cols-2">
      <label className={label}>Existing record ID<input className={field} name="id" placeholder="Empty creates a new UUID" /></label>
      <label className={label}>Catalog key<input className={field} name="key" required pattern="[a-z0-9_-]+" maxLength={80} /></label>
      <label className={label}>Title<input className={field} name="title" required minLength={2} maxLength={200} /></label>
      <label className={label}>Dodo product ID<input className={field} name="providerProductId" maxLength={200} /></label>
      <label className={label}>Access kind<select className={field} name="kind"><option value="pro_listing">Pro listing</option><option value="featured_listing">Featured listing</option><option value="sponsorship">Sponsorship</option><option value="sidebar_ad">Sidebar ad (fixed duration)</option></select></label>
      <label className={label}>Billing interval<select className={field} name="interval"><option value="one_time">One time</option><option value="month">Monthly</option><option value="year">Yearly</option></select></label>
      <label className={label}>Amount in minor units<input className={field} name="amountCents" type="number" min={0} max={2147483647} step={1} required /></label>
      <label className={label}>Currency<input className={field} name="currency" required minLength={3} maxLength={3} placeholder="ISO 4217" /></label>
      <label className={label}>One-time access duration (days)<input className={field} name="days" type="number" min={1} max={36500} placeholder="Empty = no fixed expiry" /></label>
      <div className="self-end"><label className={toggleRow}>Requires an owned site<input className={checkbox} name="requiresSite" type="checkbox" defaultChecked /></label><label className={toggleRow}>Active in checkout<input className={checkbox} name="active" type="checkbox" /></label></div>
      <label className={`${label} sm:col-span-2`}>Reason<textarea className={`${field} min-h-28 leading-relaxed`} name="reason" required minLength={8} maxLength={500} /></label>
    </fieldset>{preview && <PreviewBoard value={{ before: preview.before, proposed: preview.proposed }} />}
      <div className="mt-7 flex flex-wrap gap-3"><button className={primaryButton} type="submit" disabled={busy}>{busy ? "Working…" : preview ? "Confirm catalog change" : "Preview catalog change"}</button>{preview && <button className={secondaryButton} type="button" onClick={() => setPreview(null)}>Discard preview</button>}</div>
      <FormStatus message={message} failed={failed} /></form></FormSection>;
}

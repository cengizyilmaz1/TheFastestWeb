"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { categoryCatalog, type CategorySlug } from "@/modules/catalog/categories";

type Review = { token: string; expiresAt: string };
const field = "mt-1 block w-full rounded-lg border border-border bg-bg-card px-3 py-2 text-text-primary";

export function CategoryEditor({ siteId, current }: { siteId: string; current: string }) {
  const router = useRouter(), id = useId();
  const [category, setCategory] = useState(current as CategorySlug), [reason, setReason] = useState("");
  const [review, setReview] = useState<Review | null>(null), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [status, setStatus] = useState("");
  const action = { action: "site.category", siteId, categorySlug: category, reason: reason.trim() };

  async function save(operation: "preview" | "confirm") {
    setBusy(true); setError(""); setStatus("");
    try {
      const response = await fetch("/api/admin/actions", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation, action, ...(operation === "confirm" ? { token: review?.token } : {}) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "The category could not be saved. Refresh and try again.");
      if (operation === "preview") setReview(result);
      else { setReview(null); setReason(""); setStatus("Category updated and recorded in the audit log."); router.refresh(); }
    } catch (failure) { setReview(null); setError(failure instanceof Error ? failure.message : "The category could not be saved."); }
    finally { setBusy(false); }
  }

  return <details className="mt-2 max-w-[340px] text-[0.75rem]">
    <summary className="w-fit cursor-pointer font-semibold text-accent-bright">Edit category</summary>
    <div className="mt-3 space-y-3 rounded-lg border border-border bg-bg-main p-3">
      <fieldset disabled={busy || Boolean(review)} className="space-y-3">
        <label htmlFor={`${id}-category`} className="block text-text-secondary">Primary category
          <select id={`${id}-category`} className={field} value={category} onChange={(event) => setCategory(event.target.value as CategorySlug)}>
            {categoryCatalog.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
          </select>
        </label>
        <label htmlFor={`${id}-reason`} className="block text-text-secondary">Reason
          <textarea id={`${id}-reason`} className={field} value={reason} onChange={(event) => setReason(event.target.value)} minLength={8} maxLength={500} rows={2} placeholder="Explain the product's main purpose" />
        </label>
      </fieldset>
      <p className="text-text-secondary">The primary category changes. Other relevant secondary categories are retained.</p>
      {review ? <div className="space-y-2">
        <p>Change to <strong>{categoryCatalog.find((item) => item.slug === category)?.name}</strong>? Confirmation expires in five minutes.</p>
        <div className="flex gap-3"><button type="button" disabled={busy} className="font-semibold text-accent-bright disabled:opacity-50" onClick={() => save("confirm")}>{busy ? "Saving…" : "Confirm change"}</button>
          <button type="button" disabled={busy} className="text-text-secondary" onClick={() => setReview(null)}>Cancel</button></div>
      </div> : <button type="button" disabled={busy || reason.trim().length < 8 || category === current} className="font-semibold text-accent-bright disabled:opacity-50" onClick={() => save("preview")}>{busy ? "Loading…" : "Preview change"}</button>}
      {error && <p role="alert" className="text-red">{error}</p>}
      {status && <p role="status" className="text-green">{status}</p>}
    </div>
  </details>;
}

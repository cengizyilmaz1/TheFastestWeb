"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminAction } from "@/modules/admin/service";

export default function AdminActionForm({ role }: { role: "admin" | "moderator" }) {
  const router = useRouter();
  const [action, setAction] = useState("site.monitoring");
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [lifecycle, setLifecycle] = useState("suspended");
  const [paused, setPaused] = useState(true);
  const [evidence, setEvidence] = useState("");
  const [preview, setPreview] = useState<{ token: string; before: unknown; proposed: AdminAction } | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(confirm: boolean) {
    setBusy(true); setStatus("");
    const proposed = preview?.proposed ?? { action, reason,
      ...(action.startsWith("site.") ? { siteId: target, ...(action === "site.lifecycle" ? { lifecycle } : { paused }) }
        : action.startsWith("claim.") ? { claimId: target } : action === "payment.review" ? { orderId: target }
          : action.startsWith("ad.") ? { reservationId: target, ...(action === "ad.release" ? { evidence } : {}) } : { jobId: target }) };
    try {
      const response = await fetch("/api/admin/actions", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: confirm ? "confirm" : "preview", action: proposed, ...(confirm ? { token: preview?.token } : {}) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The action could not be completed.");
      if (confirm) { setPreview(null); setStatus(`Recorded audit ${result.auditId}.`); router.refresh(); }
      else setPreview(result);
    } catch (error) { setStatus(error instanceof Error ? error.message : "The action could not be completed."); }
    finally { setBusy(false); }
  }
  return <section className="mt-8 rounded-xl border border-border bg-bg-card p-6"><h2 className="text-xl font-semibold">Review an action</h2><p className="mt-2 text-sm text-text-secondary">No bulk deletes. Payment review records evidence without changing payment status or contacting the provider.</p>
    <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm">Action<select className="form-field mt-2" value={action} disabled={Boolean(preview)} onChange={(event) => setAction(event.target.value)}>
      <option value="site.monitoring">Pause / resume monitoring</option><option value="site.lifecycle">Change site lifecycle</option><option value="claim.reject">Reject pending claim</option>
      {role === "admin" && <><option value="claim.transfer">Transfer site after verified claim</option><option value="job.retry">Retry failed job</option><option value="job.cancel">Cancel job</option><option value="payment.review">Record payment review only</option><option value="ad.approve">Approve paid ad creative</option><option value="ad.release">Release unpaid hold after provider cancellation</option></>}
    </select></label><label className="text-sm">Target record ID<input className="form-field mt-2" value={target} disabled={Boolean(preview)} onChange={(event) => setTarget(event.target.value)} placeholder="UUID from the report" /></label>
      {action === "site.lifecycle" && <label className="text-sm">Lifecycle<select className="form-field mt-2" value={lifecycle} disabled={Boolean(preview)} onChange={(event) => setLifecycle(event.target.value)}><option value="suspended">Suspended</option><option value="archived">Archived</option><option value="active">Active and listed</option></select></label>}
      {action === "site.monitoring" && <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={paused} disabled={Boolean(preview)} onChange={(event) => setPaused(event.target.checked)} /> Pause monitoring</label>}
      {action === "ad.release" && <label className="text-sm sm:col-span-2">Provider cancellation evidence<textarea className="form-field mt-2" minLength={20} maxLength={1000} value={evidence} disabled={Boolean(preview)} onChange={(event) => setEvidence(event.target.value)} placeholder="Reference the confirmed provider cancellation. Do not enter secrets or customer data." /></label>}
      <label className="text-sm sm:col-span-2">Reason<textarea className="form-field mt-2" minLength={8} maxLength={500} value={reason} disabled={Boolean(preview)} onChange={(event) => setReason(event.target.value)} placeholder="Explain the evidence and intended outcome" /></label></div>
    {preview && <div className="mt-5 rounded-lg border border-border p-4"><h3 className="font-semibold">Preview</h3><p className="mt-2 text-xs text-text-muted">This confirmation expires in five minutes. Changes to the record invalidate it.</p><pre className="mt-3 overflow-auto text-xs">{JSON.stringify({ before: preview.before, proposed: preview.proposed }, null, 2)}</pre></div>}
    <div className="mt-5 flex gap-3"><button type="button" className="button-primary" disabled={busy || reason.trim().length < 8 || !target} onClick={() => submit(Boolean(preview))}>{busy ? "Working…" : preview ? "Confirm this action" : "Preview change"}</button>{preview && <button type="button" className="button-secondary" disabled={busy} onClick={() => setPreview(null)}>Discard preview</button>}</div><p role="status" className="mt-4 text-sm">{status}</p>
  </section>;
}

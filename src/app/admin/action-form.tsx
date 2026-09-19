"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminAction } from "@/modules/admin/service";
import { FormSection, FormStatus, PreviewBoard, checkbox, field, label, primaryButton, secondaryButton, toggleRow } from "./form-ui";

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
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(confirm: boolean) {
    setBusy(true); setStatus(""); setFailed(false);
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
    } catch (error) { setFailed(true); setStatus(error instanceof Error ? error.message : "The action could not be completed."); }
    finally { setBusy(false); }
  }
  return <FormSection title="Review an action" detail="No bulk deletes. Payment review records evidence without changing payment status or contacting the provider.">
    <div className="grid gap-x-5 gap-y-5 sm:grid-cols-2"><label className={label}>Action<select className={field} value={action} disabled={Boolean(preview)} onChange={(event) => setAction(event.target.value)}>
      <option value="site.monitoring">Pause / resume monitoring</option><option value="site.lifecycle">Change site lifecycle</option><option value="claim.reject">Reject pending claim</option>
      {role === "admin" && <><option value="claim.transfer">Transfer site after verified claim</option><option value="job.retry">Retry failed job</option><option value="job.cancel">Cancel job</option><option value="payment.review">Record payment review only</option><option value="ad.approve">Approve paid ad creative</option><option value="ad.release">Release unpaid hold after provider cancellation</option></>}
    </select></label><label className={label}>Target record ID<input className={field} value={target} disabled={Boolean(preview)} onChange={(event) => setTarget(event.target.value)} placeholder="UUID from the report" /></label>
      {action === "site.lifecycle" && <label className={label}>Lifecycle<select className={field} value={lifecycle} disabled={Boolean(preview)} onChange={(event) => setLifecycle(event.target.value)}><option value="suspended">Suspended</option><option value="archived">Archived</option><option value="active">Active and listed</option></select></label>}
      {action === "site.monitoring" && <div className="self-end"><label className={toggleRow}>Pause monitoring<input className={checkbox} type="checkbox" checked={paused} disabled={Boolean(preview)} onChange={(event) => setPaused(event.target.checked)} /></label></div>}
      {action === "ad.release" && <label className={`${label} sm:col-span-2`}>Provider cancellation evidence<textarea className={`${field} min-h-28 leading-relaxed`} minLength={20} maxLength={1000} value={evidence} disabled={Boolean(preview)} onChange={(event) => setEvidence(event.target.value)} placeholder="Reference the confirmed provider cancellation. Do not enter secrets or customer data." /></label>}
      <label className={`${label} sm:col-span-2`}>Reason<textarea className={`${field} min-h-28 leading-relaxed`} minLength={8} maxLength={500} value={reason} disabled={Boolean(preview)} onChange={(event) => setReason(event.target.value)} placeholder="Explain the evidence and intended outcome" /></label></div>
    {preview && <PreviewBoard value={{ before: preview.before, proposed: preview.proposed }} note="This confirmation expires in five minutes. Changes to the record invalidate it." />}
    <div className="mt-7 flex flex-wrap gap-3"><button type="button" className={primaryButton} disabled={busy || reason.trim().length < 8 || !target} onClick={() => submit(Boolean(preview))}>{busy ? "Working…" : preview ? "Confirm this action" : "Preview change"}</button>{preview && <button type="button" className={secondaryButton} disabled={busy} onClick={() => setPreview(null)}>Discard preview</button>}</div><FormStatus message={status} failed={failed} />
  </FormSection>;
}

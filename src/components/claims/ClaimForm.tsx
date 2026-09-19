"use client";
import { useState } from "react";
type Challenge = { id: string; token: string; expiresAt: string; method: "dns_txt" | "well_known"; verification: { recordName: string; recordValue: string; url: string } };
export function ClaimForm({ siteId }: { siteId: string }) {
  const [method, setMethod] = useState<"dns_txt" | "well_known">("dns_txt"), [challenge, setChallenge] = useState<Challenge | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function submit(verify: boolean) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(verify ? "/api/claims/verify" : "/api/claims", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(verify && challenge ? { claimId: challenge.id, token: challenge.token } : { siteId, method }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Verification could not be completed.");
      if (!verify) setChallenge(data); else { setMessage(data.requiresReview ? "Domain control verified. This website already has an owner, so the claim is awaiting review." : "Domain control verified. You can manage this website from your dashboard."); setChallenge(null); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Please try again."); } finally { setBusy(false); }
  }
  return <div className="mt-8 rounded-xl border border-border bg-bg-main p-6"><label className="text-sm font-medium">Verification method<select className="form-field mt-2" value={method} disabled={busy || !!challenge} onChange={(event) => setMethod(event.target.value as typeof method)}><option value="dns_txt">DNS TXT record</option><option value="well_known">Verification file</option></select></label>
    {!challenge ? <button type="button" disabled={busy} onClick={() => submit(false)} className="button-primary mt-5">{busy ? "Preparing…" : "Create verification challenge"}</button> : <div className="mt-6"><h2 className="text-lg font-medium">{method === "dns_txt" ? "Add this TXT record" : "Publish this verification file"}</h2><p className="mt-3 break-all font-mono text-xs text-text-secondary">{method === "dns_txt" ? challenge.verification.recordName : challenge.verification.url}</p><label className="mt-4 block text-xs text-text-secondary">Exact content<textarea readOnly className="form-field mt-2 font-mono" rows={3} value={challenge.verification.recordValue} /></label><p className="mt-3 text-xs text-text-muted">Expires {new Date(challenge.expiresAt).toLocaleString()}. Keep this page open until verification is complete.</p><button type="button" onClick={() => submit(true)} disabled={busy} className="button-primary mt-5">{busy ? "Checking…" : "Verify domain control"}</button></div>}
    <p role="status" className="mt-4 text-sm text-text-secondary">{message}</p></div>;
}

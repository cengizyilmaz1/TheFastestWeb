"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle, File, Globe, SpinnerGap, WarningCircle } from "@phosphor-icons/react";
type Challenge = { id: string; token: string; expiresAt: string; method: "dns_txt" | "well_known"; verification: { recordName: string; recordValue: string; url: string } };
const methods = [
  { value: "dns_txt", label: "DNS TXT record", detail: "Add a TXT record where you manage the domain's DNS.", icon: Globe },
  { value: "well_known", label: "Verification file", detail: "Publish a small text file on the website itself.", icon: File },
] as const;
// globals.css resets `font` on form controls outside any cascade layer, so button type is pinned with important utilities.
const buttonType = " text-[15px]! font-semibold!";

export function ClaimForm({ siteId }: { siteId: string }) {
  const [method, setMethod] = useState<"dns_txt" | "well_known">("dns_txt"), [challenge, setChallenge] = useState<Challenge | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  async function submit(verify: boolean) {
    setBusy(true); setMessage(""); setFailed(false);
    try {
      const response = await fetch(verify ? "/api/claims/verify" : "/api/claims", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(verify && challenge ? { claimId: challenge.id, token: challenge.token } : { siteId, method }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Verification could not be completed.");
      if (!verify) setChallenge(data); else { setMessage(data.requiresReview ? "Domain control verified. This website already has an owner, so the claim is awaiting review." : "Domain control verified. You can manage this website from your dashboard."); setChallenge(null); }
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "Please try again."); } finally { setBusy(false); }
  }
  const locked = busy || !!challenge;

  return <div className="mt-10">
    <fieldset disabled={locked}>
      <legend className="text-sm font-semibold text-text-primary">Verification method</legend>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{methods.map((option) => { const selected = method === option.value, Icon = option.icon; return <label key={option.value} className={`relative flex items-start gap-4 rounded-2xl border bg-bg-main p-5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${locked ? "cursor-not-allowed" : "cursor-pointer hover:border-text-muted"} ${selected ? "border-text-primary shadow-panel" : "border-border-light"} ${locked && !selected ? "opacity-55" : ""}`}>
        <input type="radio" name="verification-method" value={option.value} className="sr-only" checked={selected} onChange={() => setMethod(option.value)} />
        <span aria-hidden className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${selected ? "bg-brand text-on-brand" : "bg-bg-card text-text-secondary"}`}><Icon size={20} /></span>
        <span className="min-w-0"><span className="block text-[15px] font-semibold text-text-primary">{option.label}</span><span className="mt-1 block text-[13px] leading-relaxed text-text-muted">{option.detail}</span></span>
      </label>; })}</div>
    </fieldset>

    {!challenge ? <button type="button" disabled={busy} onClick={() => submit(false)} className={"button-primary mt-7 min-h-12 px-6" + buttonType}>{busy ? "Preparing…" : "Create verification challenge"}{busy ? <SpinnerGap size={18} weight="bold" className="animate-spin" aria-hidden /> : <ArrowRight size={18} weight="bold" aria-hidden />}</button>
      : <section className="panel mt-8 overflow-hidden">
        <div className="px-6 pt-7 sm:px-8"><h2 className="text-xl font-semibold tracking-[-.03em] sm:text-2xl">{method === "dns_txt" ? "Add this TXT record" : "Publish this verification file"}</h2></div>
        <dl className="mt-5 text-[15px]">
          <div className="grid gap-x-8 gap-y-1 border-t border-border px-6 py-4 sm:grid-cols-[9rem_minmax(0,1fr)] sm:px-8"><dt className="text-text-secondary">{method === "dns_txt" ? "Record type" : "File type"}</dt><dd className="font-semibold text-text-primary">{method === "dns_txt" ? "TXT" : "Plain text"}</dd></div>
          <div className="grid gap-x-8 gap-y-1 border-t border-border px-6 py-4 sm:grid-cols-[9rem_minmax(0,1fr)] sm:px-8"><dt className="text-text-secondary">{method === "dns_txt" ? "Record name" : "File address"}</dt><dd className="[overflow-wrap:anywhere] font-mono text-[13px] leading-relaxed text-text-primary">{method === "dns_txt" ? challenge.verification.recordName : challenge.verification.url}</dd></div>
          <div className="grid gap-x-8 gap-y-2 border-t border-border px-6 py-4 sm:grid-cols-[9rem_minmax(0,1fr)] sm:px-8"><dt><label htmlFor="claim-record-value" className="text-text-secondary">Exact content</label></dt><dd><textarea id="claim-record-value" readOnly className="form-field resize-none bg-bg-card font-mono! text-[13px]! leading-relaxed!" rows={3} value={challenge.verification.recordValue} onFocus={(event) => event.currentTarget.select()} /></dd></div>
          <div className="grid gap-x-8 gap-y-1 border-t border-border px-6 py-4 sm:grid-cols-[9rem_minmax(0,1fr)] sm:px-8"><dt className="text-text-secondary">Expires</dt><dd className="font-semibold text-text-primary">{new Date(challenge.expiresAt).toLocaleString()}</dd></div>
        </dl>
        <div className="flex flex-col gap-4 border-t border-border bg-bg-card px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8"><p className="max-w-[40ch] text-[13px] leading-relaxed text-text-secondary">Keep this page open until verification is complete.</p><button type="button" onClick={() => submit(true)} disabled={busy} className={"button-primary min-h-12 shrink-0 px-6" + buttonType}>{busy ? "Checking…" : "Verify domain control"}{busy && <SpinnerGap size={18} weight="bold" className="animate-spin" aria-hidden />}</button></div>
      </section>}

    <div role="status" className={message ? `mt-6 flex items-start gap-3 rounded-2xl px-5 py-4 text-sm leading-relaxed text-text-primary ${failed ? "bg-red-dim" : "bg-green-dim"}` : ""}>{message && <>{failed ? <WarningCircle size={20} weight="fill" className="mt-0.5 shrink-0 text-red" aria-hidden /> : <CheckCircle size={20} weight="fill" className="mt-0.5 shrink-0 text-green" aria-hidden />}<p>{message}{!failed && <> <Link href="/dashboard" className="ml-1 font-semibold underline decoration-2 underline-offset-4">Open dashboard</Link></>}</p></>}</div>
  </div>;
}

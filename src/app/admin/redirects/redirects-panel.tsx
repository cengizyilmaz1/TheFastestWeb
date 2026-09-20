"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
type Rule = { id: string; sourcePath: string; destinationPath: string; statusCode: number; enabled: boolean; version: number;
  statistics: { total: number; human: number; bot: number; today: number; last30Days: number; lastSeenAt: string | null } };
const count = new Intl.NumberFormat("en-US");
const lastSeen = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
export function RedirectsPanel({ rules }: { rules: Rule[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Rule | null>(null), [source, setSource] = useState(""), [destination, setDestination] = useState("");
  const [status, setStatus] = useState(301), [enabled, setEnabled] = useState(true), [reason, setReason] = useState("");
  const [preview, setPreview] = useState<{ token: string; rule: object } | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  function edit(rule: Rule | null) { setEditing(rule); setSource(rule?.sourcePath ?? ""); setDestination(rule?.destinationPath ?? ""); setStatus(rule?.statusCode ?? 301); setEnabled(rule?.enabled ?? true); setReason(""); setPreview(null); setMessage(""); }
  async function send(operation: "preview" | "confirm") {
    setBusy(true); setMessage("");
    const rule = operation === "confirm" ? preview?.rule : { id: editing?.id ?? crypto.randomUUID(), sourcePath: source.trim(), destinationPath: destination.trim(), statusCode: status, enabled, expectedVersion: editing?.version ?? 0, reason };
    try {
      const response = await fetch("/api/admin/redirects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation, rule, token: preview?.token }) });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "The redirect could not be saved.");
      if (operation === "preview") setPreview({ token: data.token, rule: data.proposed });
      else { edit(null); setMessage("Redirect saved."); router.refresh(); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "The request failed."); setPreview(null); }
    finally { setBusy(false); }
  }
  const field = "mt-1 w-full rounded-lg border border-border bg-bg-main px-3 py-2 text-sm text-text-primary";
  return <div className="grid gap-5 min-[1100px]:grid-cols-[1.2fr_1fr]">
    <section className="rounded-[14px] border border-border bg-bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4"><h2 className="font-display font-bold">Managed redirects</h2><button onClick={() => edit(null)} className="text-sm text-accent-bright">New redirect</button></div>
      {rules.length ? <ul className="divide-y divide-border">{rules.map(rule => <li key={rule.id} className="p-4">
        <button onClick={() => edit(rule)} className="w-full rounded text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"><span className="block break-all text-sm font-semibold">{rule.sourcePath} → {rule.destinationPath}</span>
          <span className="mt-1 block text-xs text-text-secondary">HTTP {rule.statusCode} · {rule.enabled ? "Enabled" : "Disabled"} · Edit</span></button>
        <dl className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-bg-main p-3 text-xs sm:grid-cols-4">
          {[["All requests", rule.statistics.total], ["Today", rule.statistics.today], ["Last 30 days", rule.statistics.last30Days], ["Detected bots", rule.statistics.bot]].map(([label, value]) => <div key={label}>
            <dt className="text-text-secondary">{label}</dt><dd className="mt-1 font-mono text-sm font-semibold">{count.format(value as number)}</dd>
          </div>)}
        </dl>
        <p className="mt-2 text-xs text-text-secondary">Last request: {rule.statistics.lastSeenAt ? `${lastSeen.format(new Date(rule.statistics.lastSeenAt))} UTC` : "None recorded"}</p>
      </li>)}</ul> : <p className="p-5 text-sm text-text-secondary">No custom redirects yet.</p>}
    </section>
    <form className="rounded-[14px] border border-border bg-bg-card p-5" onChange={() => setPreview(null)} onSubmit={event => { event.preventDefault(); void send("preview"); }}>
      <h2 className="font-display font-bold">{editing ? "Edit redirect" : "New redirect"}</h2>
      <label className="mt-4 block text-sm">Old path<input required value={source} onChange={event => setSource(event.target.value)} placeholder="/old-page" maxLength={500} className={field} /></label>
      <label className="mt-3 block text-sm">Destination path<input required value={destination} onChange={event => setDestination(event.target.value)} placeholder="/about" maxLength={500} className={field} /></label>
      <label className="mt-3 block text-sm">Redirect type<select value={status} onChange={event => setStatus(Number(event.target.value))} className={field}><option value={301}>301 — Permanent</option><option value={302}>302 — Temporary</option><option value={307}>307 — Temporary, preserve method</option><option value={308}>308 — Permanent, preserve method</option></select></label>
      <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />Enabled</label>
      <label className="mt-3 block text-sm">Reason<textarea required minLength={8} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} className={field} rows={2} /></label>
      <p className="mt-3 text-xs leading-relaxed text-text-secondary">Use exact paths on this website. Query strings are discarded. External destinations, protected account routes, redirect chains and loops are blocked.</p>
      {preview ? <div className="mt-4 rounded-lg border border-accent/40 p-3"><p className="text-sm">Save this {status} redirect from <strong>{source}</strong> to <strong>{destination}</strong>?</p><button type="button" disabled={busy} onClick={() => void send("confirm")} className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg-deep disabled:opacity-50">{busy ? "Saving…" : "Confirm change"}</button></div>
        : <button disabled={busy} className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg-deep disabled:opacity-50">{busy ? "Checking…" : "Preview change"}</button>}
      {message && <p role="status" className="mt-3 text-sm text-text-secondary">{message}</p>}
    </form>
  </div>;
}

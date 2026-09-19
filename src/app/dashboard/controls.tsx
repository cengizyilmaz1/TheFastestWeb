"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowsClockwiseIcon, LockKeyIcon } from "@phosphor-icons/react";

async function api(url: string, method: string, body: unknown) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "The request could not be completed.");
  return data;
}

const label = "block text-sm font-medium text-text-primary";
const field = "form-field mt-2 font-normal!";
const toggleRow = "flex min-h-[52px] cursor-pointer items-center justify-between gap-5 border-t border-border py-3 text-[15px] text-text-primary transition-colors last:border-b hover:bg-bg-main";
const checkbox = "h-5 w-5 flex-none cursor-pointer accent-brand";
// globals.css resets `font` on every <button> outside a layer, so button type is restated with important utilities.
const smallButton = "button-secondary min-h-10 px-4 text-[13px]! font-semibold!";
const inkButton = "button-ink text-sm! font-semibold!";

function Status({ message, failed }: { message: string; failed: boolean }) {
  return <p role="status" className={`text-sm leading-relaxed ${message ? "mt-4" : ""} ${failed ? "text-red" : "text-text-secondary"}`}>{message}</p>;
}

export function RetestButton({ slug }: { slug: string }) {
  const router = useRouter();
  const [job, setJob] = useState<{ id: string; status: string } | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!job || ["succeeded", "failed", "cancelled"].includes(job.status)) return;
    let ended = false;
    const controller = new AbortController();
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${job.id}`, { signal: controller.signal });
        const data = await response.json(); if (!response.ok || ended) return;
        setJob(data.job);
        if (["succeeded", "failed", "cancelled"].includes(data.job.status)) router.refresh();
      } catch { /* An interrupted poll does not imply a failed durable job. */ }
    }, 5000);
    return () => { ended = true; controller.abort(); clearInterval(interval); };
  }, [job, router]);
  async function run() {
    setBusy(true); setError("");
    try { setJob((await api(`/api/sites/${encodeURIComponent(slug)}/retest`, "POST", {})).job); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Retest could not be scheduled."); }
    finally { setBusy(false); }
  }
  const message = error || (job ? `Test ${job.status}` : "");
  return <div className="flex flex-col items-end">
    <button className={smallButton} type="button" disabled={busy || Boolean(job && !["succeeded", "failed", "cancelled"].includes(job.status))} onClick={run}>
      {busy ? "Scheduling…" : <><ArrowsClockwiseIcon size={15} weight="bold" aria-hidden /><span>Retest<span className="sr-only xl:not-sr-only"> website</span></span></>}
    </button>
    <p role="status" className={`text-right text-xs leading-snug ${message ? "mt-2" : ""} ${error ? "text-red" : "text-text-muted"}`}>{message}</p>
  </div>;
}

export function NotificationRead({ id }: { id: string }) {
  const router = useRouter(), [status, setStatus] = useState("");
  return <div className="flex flex-col items-end gap-2"><button type="button" className={smallButton} onClick={async () => { try { await api("/api/notifications/read", "POST", { id }); router.refresh(); } catch { setStatus("Could not update notification."); } }}>Mark read</button><span role="status" className="text-xs text-red">{status}</span></div>;
}

export function PreferencesForm({ initial }: { initial: { marketing: boolean; performance: boolean; weekly: boolean; badge: boolean } }) {
  const [values, setValues] = useState(initial), [status, setStatus] = useState(""), [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  const labels = { performance: "Performance changes", weekly: "Weekly results and rankings", badge: "Badges and eligibility", marketing: "Optional reminders and product updates" };
  return <form onSubmit={async (event) => { event.preventDefault(); setBusy(true); setStatus(""); setFailed(false); try { await api("/api/notifications/preferences", "PATCH", values); setStatus("Email preferences saved."); } catch (failure) { setFailed(true); setStatus(failure instanceof Error ? failure.message : "Could not save preferences."); } finally { setBusy(false); } }}>
    <div>{(Object.keys(labels) as (keyof typeof labels)[]).map((key) => <label key={key} className={toggleRow}>{labels[key]}<input className={checkbox} type="checkbox" checked={values[key]} onChange={(event) => setValues({ ...values, [key]: event.target.checked })} /></label>)}</div>
    <div className="mt-6 flex flex-wrap items-center justify-between gap-x-8 gap-y-4"><p className="max-w-[44ch] text-[13px] leading-relaxed text-text-muted">Essential account and payment messages remain enabled.</p><button className={inkButton} disabled={busy}>{busy ? "Saving…" : "Save preferences"}</button></div>
    <Status message={status} failed={failed} /></form>;
}

export function CheckoutButton({ productKey, requiresSite, sites, adInventory }: { productKey: string; requiresSite: boolean; sites: { id: string; name: string }[];
  adInventory?: { id: string; position: string; orderIndex: number }[] }) {
  const [siteId, setSiteId] = useState(sites[0]?.id ?? ""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const [inventoryId, setInventoryId] = useState(adInventory?.[0]?.id ?? "");
  const [requestKey] = useState(() => crypto.randomUUID());
  async function checkout() {
    setBusy(true); setMessage("");
    try { const result = await api("/api/payments/checkout", "POST", { productKey, ...(requiresSite ? { siteId } : {}),
      ...(adInventory ? { adInventoryId: inventoryId } : {}), idempotencyKey: requestKey });
      const destination = new URL(result.url);
      if (destination.protocol !== "https:" || !["checkout.dodopayments.com", "test.checkout.dodopayments.com"].includes(destination.hostname)) throw new Error("The checkout URL is unavailable.");
      location.assign(destination.href);
    } catch (failure) { setMessage(failure instanceof Error ? failure.message : "Checkout could not be started."); setBusy(false); }
  }
  return <div>{requiresSite && <label className={`${label} mt-3`}>Owned website<select className={field} value={siteId} onChange={(event) => setSiteId(event.target.value)}>{sites.length ? sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>) : <option value="">Add a website first</option>}</select></label>}
    {adInventory && <label className={`${label} mt-4`}>Reserved placement<select className={field} value={inventoryId} onChange={(event) => setInventoryId(event.target.value)}>{adInventory.length ? adInventory.map((item) => <option key={item.id} value={item.id}>{item.position} sidebar, position {item.orderIndex}</option>) : <option value="">No placement available</option>}</select><span className="mt-2 block text-xs font-normal leading-relaxed text-text-muted">The placement is held before checkout. Creative is reviewed after payment; the purchased duration starts at approval. Abandoned checkout holds require operator reconciliation.</span></label>}
    <div className="mt-5"><button type="button" className={inkButton} disabled={busy || (requiresSite && !siteId) || Boolean(adInventory && !inventoryId)} onClick={checkout}><LockKeyIcon size={16} weight="bold" aria-hidden />{busy ? "Opening checkout…" : "Continue to secure checkout"}</button><Status message={message} failed /></div></div>;
}

export function FounderForm({ initial, name, countries, sites }: { initial: {
  id: string; slug: string; name: string; bio: string | null; websiteUrl: string | null; countryCode: string | null;
  visibility: "public" | "private"; socialLinks: { platform: string; url: string }[];
} | null; name: string; countries: { code: string; name: string }[]; sites: { id: string; name: string }[] }) {
  const router = useRouter(), [status, setStatus] = useState(""), [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setStatus(""); setFailed(false);
    const form = new FormData(event.currentTarget);
    try { await api("/api/founders/me", "PUT", { slug: form.get("slug"), name: form.get("name"), bio: form.get("bio") || null,
      websiteUrl: form.get("websiteUrl") || null, countryCode: form.get("countryCode") || null,
      visibility: form.has("public") ? "public" : "private", socialLinks: initial?.socialLinks ?? [] }); setStatus("Profile saved."); router.refresh(); }
    catch (failure) { setFailed(true); setStatus(failure instanceof Error ? failure.message : "Profile could not be saved."); }
    finally { setBusy(false); }
  }
  return <div><form onSubmit={save} className="grid gap-x-5 gap-y-5 sm:grid-cols-2"><label className={label}>Display name<input className={field} name="name" defaultValue={initial?.name ?? name} required maxLength={100} /></label><label className={label}>Public profile URL slug<input className={field} name="slug" defaultValue={initial?.slug ?? ""} required pattern="[a-z0-9]+(-[a-z0-9]+)*" minLength={2} maxLength={80} /></label>
    <label className={label}>Website<input className={field} name="websiteUrl" type="url" defaultValue={initial?.websiteUrl ?? ""} /></label><label className={label}>Country<select className={field} name="countryCode" defaultValue={initial?.countryCode ?? ""}><option value="">Not specified</option>{countries.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}</select></label>
    <label className={`${label} sm:col-span-2`}>Short bio<textarea className={`${field} min-h-32 leading-relaxed`} name="bio" defaultValue={initial?.bio ?? ""} maxLength={1000} /></label>
    <div className="sm:col-span-2"><label className={toggleRow}>Publish my founder profile<input className={checkbox} type="checkbox" name="public" defaultChecked={initial?.visibility === "public"} /></label></div>
    <div className="sm:col-span-2"><button className={inkButton} disabled={busy}>{busy ? "Saving…" : "Save profile"}</button></div></form>
    {initial && sites.length > 0 && <form className="mt-10 flex flex-wrap items-end gap-3 border-t border-border pt-7" onSubmit={async (event) => { event.preventDefault(); const data = new FormData(event.currentTarget); try { await api("/api/founders/link", "POST", { founderId: initial.id, siteId: data.get("siteId") }); setFailed(false); setStatus("Website linked to your profile."); router.refresh(); } catch (failure) { setFailed(true); setStatus(failure instanceof Error ? failure.message : "Could not link website."); } }}><label className={`${label} min-w-0 grow basis-64`}>Link an owned website<select name="siteId" className={field}>{sites.map((site) => <option value={site.id} key={site.id}>{site.name}</option>)}</select></label><button className="button-secondary min-h-[46px] text-sm! font-semibold!">Link website</button></form>}
    <Status message={status} failed={failed} /></div>;
}

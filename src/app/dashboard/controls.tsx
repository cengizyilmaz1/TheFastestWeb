"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

async function api(url: string, method: string, body: unknown) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "The request could not be completed.");
  return data;
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
  return <div><button className="button-secondary" type="button" disabled={busy || Boolean(job && !["succeeded", "failed", "cancelled"].includes(job.status))} onClick={run}>{busy ? "Scheduling…" : "Retest website"}</button><p role="status" className="mt-2 text-xs text-text-muted">{error || (job ? `Test ${job.status}` : "One shared daily measurement")}</p></div>;
}

export function NotificationRead({ id }: { id: string }) {
  const router = useRouter(), [status, setStatus] = useState("");
  return <div><button type="button" className="text-xs underline" onClick={async () => { try { await api("/api/notifications/read", "POST", { id }); router.refresh(); } catch { setStatus("Could not update notification."); } }}>Mark read</button><span role="status" className="ml-2 text-xs">{status}</span></div>;
}

export function PreferencesForm({ initial }: { initial: { marketing: boolean; performance: boolean; weekly: boolean; badge: boolean } }) {
  const [values, setValues] = useState(initial), [status, setStatus] = useState(""), [busy, setBusy] = useState(false);
  const labels = { performance: "Performance changes", weekly: "Weekly results and rankings", badge: "Badges and eligibility", marketing: "Optional reminders and product updates" };
  return <form onSubmit={async (event) => { event.preventDefault(); setBusy(true); setStatus(""); try { await api("/api/notifications/preferences", "PATCH", values); setStatus("Email preferences saved."); } catch (failure) { setStatus(failure instanceof Error ? failure.message : "Could not save preferences."); } finally { setBusy(false); } }}>
    <div className="space-y-3">{(Object.keys(labels) as (keyof typeof labels)[]).map((key) => <label key={key} className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={values[key]} onChange={(event) => setValues({ ...values, [key]: event.target.checked })} />{labels[key]}</label>)}</div>
    <p className="mt-4 text-xs text-text-muted">Essential account and payment messages remain enabled.</p><button className="button-secondary mt-5" disabled={busy}>{busy ? "Saving…" : "Save preferences"}</button><p role="status" className="mt-3 text-sm">{status}</p></form>;
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
  return <div>{requiresSite && <label className="mt-3 block text-sm">Owned website<select className="form-field mt-2" value={siteId} onChange={(event) => setSiteId(event.target.value)}>{sites.length ? sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>) : <option value="">Add a website first</option>}</select></label>}
    {adInventory && <label className="mt-3 block text-sm">Reserved placement<select className="form-field mt-2" value={inventoryId} onChange={(event) => setInventoryId(event.target.value)}>{adInventory.length ? adInventory.map((item) => <option key={item.id} value={item.id}>{item.position} sidebar · position {item.orderIndex}</option>) : <option value="">No placement available</option>}</select><span className="mt-2 block text-xs text-text-muted">The placement is held before checkout. Creative is reviewed after payment; the purchased duration starts at approval. Abandoned checkout holds require operator reconciliation.</span></label>}
    <button type="button" className="button-primary mt-4" disabled={busy || (requiresSite && !siteId) || Boolean(adInventory && !inventoryId)} onClick={checkout}>{busy ? "Opening checkout…" : "Continue to secure checkout"}</button><p role="status" className="mt-3 text-sm">{message}</p></div>;
}

export function FounderForm({ initial, name, countries, sites }: { initial: {
  id: string; slug: string; name: string; bio: string | null; websiteUrl: string | null; countryCode: string | null;
  visibility: "public" | "private"; socialLinks: { platform: string; url: string }[];
} | null; name: string; countries: { code: string; name: string }[]; sites: { id: string; name: string }[] }) {
  const router = useRouter(), [status, setStatus] = useState(""), [busy, setBusy] = useState(false);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setStatus("");
    const form = new FormData(event.currentTarget);
    try { await api("/api/founders/me", "PUT", { slug: form.get("slug"), name: form.get("name"), bio: form.get("bio") || null,
      websiteUrl: form.get("websiteUrl") || null, countryCode: form.get("countryCode") || null,
      visibility: form.has("public") ? "public" : "private", socialLinks: initial?.socialLinks ?? [] }); setStatus("Profile saved."); router.refresh(); }
    catch (failure) { setStatus(failure instanceof Error ? failure.message : "Profile could not be saved."); }
    finally { setBusy(false); }
  }
  return <div><form onSubmit={save} className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Display name<input className="form-field mt-2" name="name" defaultValue={initial?.name ?? name} required maxLength={100} /></label><label className="text-sm">Public profile URL slug<input className="form-field mt-2" name="slug" defaultValue={initial?.slug ?? ""} required pattern="[a-z0-9]+(-[a-z0-9]+)*" minLength={2} maxLength={80} /></label>
    <label className="text-sm">Website<input className="form-field mt-2" name="websiteUrl" type="url" defaultValue={initial?.websiteUrl ?? ""} /></label><label className="text-sm">Country<select className="form-field mt-2" name="countryCode" defaultValue={initial?.countryCode ?? ""}><option value="">Not specified</option>{countries.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}</select></label>
    <label className="text-sm sm:col-span-2">Short bio<textarea className="form-field mt-2" name="bio" defaultValue={initial?.bio ?? ""} maxLength={1000} /></label><label className="flex items-center gap-3 text-sm sm:col-span-2"><input type="checkbox" name="public" defaultChecked={initial?.visibility === "public"} />Publish my founder profile</label>
    <div><button className="button-secondary" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button></div></form>
    {initial && sites.length > 0 && <form className="mt-6 flex flex-wrap gap-3" onSubmit={async (event) => { event.preventDefault(); const data = new FormData(event.currentTarget); try { await api("/api/founders/link", "POST", { founderId: initial.id, siteId: data.get("siteId") }); setStatus("Website linked to your profile."); router.refresh(); } catch (failure) { setStatus(failure instanceof Error ? failure.message : "Could not link website."); } }}><label className="grow text-sm">Link an owned website<select name="siteId" className="form-field mt-2">{sites.map((site) => <option value={site.id} key={site.id}>{site.name}</option>)}</select></label><button className="button-secondary self-end">Link website</button></form>}
    <p role="status" className="mt-4 text-sm">{status}</p></div>;
}

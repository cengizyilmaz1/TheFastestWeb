"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Website = { id: string; name: string; slug: string };
type Invitation = { id: string; site: Website; founder: { id: string; name: string; slug: string | null };
  status: string; expiresAt: string; createdAt: string; canRespond?: boolean };
type Collaborations = {
  incoming: Invitation[]; outgoing: Invitation[];
  ownedSites: (Website & { founders: { id: string; name: string; slug: string | null; visibility: "public" | "private" }[] })[];
  ownLinks: { site: Website; founderId: string }[];
};
type Removal = { siteId: string; founderId: string; label: string };

const endpoint = "/api/founders/collaborations";
async function call(method: string, body?: unknown, signal?: AbortSignal) {
  const response = await fetch(endpoint, { method, cache: "no-store", signal,
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "The collaboration request could not be completed.");
  return result;
}
function expiry(value: string) { return new Date(value).toLocaleDateString("en-GB", { timeZone: "UTC" }); }
function state(invitation: Invitation) {
  return invitation.status === "pending" && new Date(invitation.expiresAt).getTime() <= Date.now() ? "expired" : invitation.status;
}

export default function Collaborators({ profileVersion }: { profileVersion: string | null }) {
  const [data, setData] = useState<Collaborations | null>(null), [siteId, setSiteId] = useState("");
  const [busy, setBusy] = useState(""), [message, setMessage] = useState(""), [failed, setFailed] = useState(false);
  const [removal, setRemoval] = useState<Removal | null>(null), [reload, setReload] = useState(0);

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    void call("GET", undefined, controller.signal).then((result: Collaborations) => {
      setData(result);
      setSiteId((current) => result.ownedSites.some((site) => site.id === current) ? current : result.ownedSites[0]?.id ?? "");
    }).catch(() => {
      if (!disposed) { setFailed(true); setMessage("Collaborations could not be loaded. Try again."); }
    }).finally(() => clearTimeout(timer));
    return () => { disposed = true; clearTimeout(timer); controller.abort(); };
  }, [profileVersion, reload]);

  async function mutate(action: string, method: string, body: unknown, success: string) {
    if (busy) return;
    setBusy(action); setMessage(""); setFailed(false);
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15_000);
    try {
      await call(method, body, controller.signal);
      setMessage(success); setRemoval(null); setReload((value) => value + 1);
    } catch (error) {
      setFailed(true);
      setMessage(controller.signal.aborted ? "The result is not confirmed. Refresh this section before repeating the action."
        : error instanceof Error ? error.message : "The collaboration request could not be completed.");
    } finally { clearTimeout(timer); setBusy(""); }
  }

  return <div>
    <p className="text-sm text-text-secondary">Invite a founder to appear alongside your website. They choose whether to accept. Attribution does not transfer ownership or grant account access, and no invitation email is sent automatically.</p>
    <p role={failed ? "alert" : "status"} className={`mt-3 text-sm ${failed ? "text-score-poor" : "text-text-secondary"}`}>{message}</p>
    {failed && <button type="button" className="button-secondary mt-3" disabled={Boolean(busy)} onClick={() => { setMessage(""); setFailed(false); setReload((value) => value + 1); }}>Refresh collaborations</button>}
    {!data ? <p className="mt-5 text-sm text-text-muted">{failed ? "Collaboration records are temporarily unavailable." : "Loading collaboration records…"}</p> : <>
      {data.ownedSites.length > 0 ? <form className="mt-6 grid items-end gap-4 md:grid-cols-[1fr_1fr_auto]" onSubmit={(event) => {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        void mutate("invite", "POST", { siteId, founderSlug: String(form.get("founderSlug") ?? "").trim() }, "Invitation recorded. The founder can respond from their dashboard.");
      }}>
        <label className="text-sm">Your website<select className="form-field mt-2" value={siteId} disabled={Boolean(busy)} onChange={(event) => setSiteId(event.target.value)}>
          {data.ownedSites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
        </select></label>
        <label className="text-sm">Public founder slug<input className="form-field mt-2" name="founderSlug" required minLength={2} maxLength={80} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="e.g. alice-smith" autoCapitalize="none" autoCorrect="off" disabled={Boolean(busy)} /></label>
        <button className="button-primary" disabled={Boolean(busy) || !siteId}>{busy === "invite" ? "Recording invitation…" : "Invite founder"}</button>
      </form> : <p className="mt-5 text-sm text-text-muted">An owned website is required to send invitations. You can still respond to invitations below.</p>}
      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <div><h3 className="font-semibold">Received invitations</h3>{data.incoming.length ? <ul className="mt-3 divide-y divide-border">{data.incoming.map((invitation) => <li key={invitation.id} className="py-4">
          <p className="text-sm font-medium">{invitation.site.name}</p><p className="mt-1 text-xs text-text-muted">{invitation.founder.name} · {state(invitation)} · Expires <time dateTime={invitation.expiresAt}>{expiry(invitation.expiresAt)}</time></p>
          {invitation.canRespond && <div className="mt-3 flex flex-wrap gap-3"><button className="button-secondary" disabled={Boolean(busy)} type="button" onClick={() => void mutate(`accept:${invitation.id}`, "PATCH", { invitationId: invitation.id, decision: "accept" }, "Invitation accepted. Your founder profile is now associated with this website.")}>Accept invitation</button>
            <button className="text-sm underline" disabled={Boolean(busy)} type="button" onClick={() => void mutate(`reject:${invitation.id}`, "PATCH", { invitationId: invitation.id, decision: "reject" }, "Invitation declined.")}>Decline</button></div>}
        </li>)}</ul> : <p className="mt-3 text-sm text-text-muted">No received invitations.</p>}</div>
        <div><h3 className="font-semibold">Sent invitations</h3>{data.outgoing.length ? <ul className="mt-3 divide-y divide-border">{data.outgoing.map((invitation) => <li key={invitation.id} className="py-4">
          <p className="text-sm font-medium">{invitation.founder.name} · {invitation.site.name}</p><p className="mt-1 text-xs text-text-muted">{state(invitation)} · Expires <time dateTime={invitation.expiresAt}>{expiry(invitation.expiresAt)}</time></p>
          {state(invitation) === "pending" && <button className="mt-3 text-sm underline" disabled={Boolean(busy)} type="button" onClick={() => void mutate(`revoke:${invitation.id}`, "PATCH", { invitationId: invitation.id, decision: "revoke" }, "Pending invitation cancelled.")}>Cancel invitation</button>}
        </li>)}</ul> : <p className="mt-3 text-sm text-text-muted">No sent invitations.</p>}</div>
      </div>
      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <div><h3 className="font-semibold">Founders on your websites</h3>{data.ownedSites.some((site) => site.founders.length) ? <ul className="mt-3 divide-y divide-border">{data.ownedSites.flatMap((site) => site.founders.map((founder) => <li key={`${site.id}:${founder.id}`} className="flex items-start justify-between gap-4 py-4">
          <div><p className="text-sm">{founder.visibility === "public" && founder.slug ? <Link className="underline" href={`/founders/${founder.slug}`}>{founder.name}</Link> : "Private profile"}</p><p className="mt-1 text-xs text-text-muted">{site.name}</p></div>
          <button className="text-sm underline" disabled={Boolean(busy)} type="button" onClick={() => setRemoval({ siteId: site.id, founderId: founder.id, label: `Remove this founder's attribution from ${site.name}` })}>Remove attribution</button>
        </li>))}</ul> : <p className="mt-3 text-sm text-text-muted">No linked founder profiles yet.</p>}</div>
        <div><h3 className="font-semibold">Your founder attributions</h3>{data.ownLinks.length ? <ul className="mt-3 divide-y divide-border">{data.ownLinks.map((link) => <li key={`${link.site.id}:${link.founderId}`} className="flex items-start justify-between gap-4 py-4">
          <p className="text-sm">{link.site.name}</p><button className="text-sm underline" disabled={Boolean(busy)} type="button" onClick={() => setRemoval({ siteId: link.site.id, founderId: link.founderId, label: `Remove your founder attribution from ${link.site.name}` })}>Leave attribution</button>
        </li>)}</ul> : <p className="mt-3 text-sm text-text-muted">Your founder profile has no website attributions.</p>}</div>
      </div>
      {removal && <div className="mt-6 border-t border-border pt-5" role="group" aria-label="Confirm attribution removal"><p className="text-sm font-medium">{removal.label}?</p><p className="mt-2 text-xs text-text-muted">This removes the association only. A new invitation is required to restore another founder&apos;s attribution.</p><div className="mt-4 flex gap-3">
        <button className="button-secondary" disabled={Boolean(busy)} type="button" onClick={() => void mutate("remove", "DELETE", { siteId: removal.siteId, founderId: removal.founderId }, "Founder attribution removed.")}>Confirm removal</button>
        <button className="text-sm underline" disabled={Boolean(busy)} type="button" onClick={() => setRemoval(null)}>Keep attribution</button>
      </div></div>}
      <p className="mt-6 text-xs text-text-muted">Shows the latest 50 invitations in each direction and up to 100 websites and attributions. Private founder names remain hidden from other accounts.</p>
    </>}
  </div>;
}

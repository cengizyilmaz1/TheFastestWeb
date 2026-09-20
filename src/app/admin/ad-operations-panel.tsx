"use client";

import { useEffect, useState } from "react";
import { canReviewCreative, confirmAdAction, loadAdReport, previewAdAction, safeCreativeUrl, type AdPreview,
  type AdReport, type AdRow, type InventoryRow, type ReservationRow } from "./ad-operations-client";

const field = "mt-1.5 w-full rounded-[10px] border border-border bg-bg-card px-3 py-2.5 text-[0.85rem] text-text-primary outline-none focus:border-accent disabled:opacity-60";
const secondary = "rounded-[10px] border border-border bg-bg-card px-3 py-2 text-[0.8rem] font-semibold text-text-primary hover:border-border-light disabled:cursor-not-allowed disabled:opacity-50";
const primary = "rounded-[10px] bg-gradient-to-br from-accent to-accent-bright px-4 py-2.5 text-[0.85rem] font-bold text-bg-deep disabled:cursor-not-allowed disabled:opacity-50";
const text = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value) : "Not available";
const empty = { rows: [], nextCursor: null };

export function AdOperationsPanel() {
  const [inventory, setInventory] = useState<AdReport<InventoryRow>>(empty);
  const [reservations, setReservations] = useState<AdReport<ReservationRow>>(empty);
  const [ads, setAds] = useState<AdRow[]>([]);
  const [adsCursor, setAdsCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [reportsLoaded, setReportsLoaded] = useState(false);
  const [error, setError] = useState(""), [status, setStatus] = useState("");
  const [position, setPosition] = useState<"left" | "right">("left"), [orderIndex, setOrderIndex] = useState(0);
  const [acceptReservations, setAcceptReservations] = useState(true), [inventoryReason, setInventoryReason] = useState("");
  const [reservationId, setReservationId] = useState(""), [approvalReason, setApprovalReason] = useState("");
  const [review, setReview] = useState<AdPreview | null>(null), [creativeReviewed, setCreativeReviewed] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([loadAdReport("ad-inventory"), loadAdReport("ad-reservations"), loadAdReport("ads")])
      .then(([places, purchases, published]) => { if (active) { setInventory(places); setReservations(purchases); setAds(published.rows); setAdsCursor(published.nextCursor); setReportsLoaded(true); } })
      .catch((failure) => { if (active) setError(failure instanceof Error ? failure.message : "Advertisement records could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function refresh() {
    setLoading(true); setReportsLoaded(false); setReview(null); setError("");
    try {
      const [places, purchases, published] = await Promise.all([loadAdReport("ad-inventory"), loadAdReport("ad-reservations"), loadAdReport("ads")]);
      setInventory(places); setReservations(purchases); setAds(published.rows); setAdsCursor(published.nextCursor); setReportsLoaded(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Advertisement records could not be loaded."); }
    finally { setLoading(false); }
  }

  async function more(section: "ad-inventory" | "ad-reservations" | "ads") {
    const cursor = section === "ad-inventory" ? inventory.nextCursor : section === "ads" ? adsCursor : reservations.nextCursor;
    if (!cursor) return;
    setLoading(true); setError("");
    try {
      if (section === "ad-inventory") {
        const page = await loadAdReport(section, cursor);
        setInventory((current) => ({ rows: [...current.rows, ...page.rows], nextCursor: page.nextCursor }));
      } else if (section === "ad-reservations") {
        const page = await loadAdReport(section, cursor);
        setReservations((current) => ({ rows: [...current.rows, ...page.rows], nextCursor: page.nextCursor }));
      } else {
        const page = await loadAdReport(section, cursor);
        setAds((current) => [...current, ...page.rows]); setAdsCursor(page.nextCursor);
      }
    } catch (failure) { setError(failure instanceof Error ? failure.message : "More records could not be loaded."); }
    finally { setLoading(false); }
  }

  const existing = inventory.rows.find((row) => row.position === position && row.order_index === orderIndex);
  const occupied = ads.find((row) => row.position === position && row.order_index === orderIndex && row.is_active && row.status === "active"
    && (!row.expires_at || new Date(row.expires_at).getTime() > Date.now()));
  const selected = reservations.rows.find((row) => row.id === reservationId);
  const reviewable = (row: ReservationRow) => canReviewCreative(row, ads.find((ad) => ad.id === row.ad_slot_id));
  const reserved = existing && reservations.rows.find((row) => row.inventory_id === existing.id && ["held", "paid", "active"].includes(row.status));
  const locked = busy || Boolean(review) || loading || !reportsLoaded;
  const creativeUrl = safeCreativeUrl(review?.before?.creative_url);
  const canApprove = review?.proposed.action === "ad.approve" && canReviewCreative({ status: text(review.before?.status),
    ends_at: typeof review.before?.ends_at === "string" ? review.before.ends_at : null }, {
    status: typeof review.before?.creative_status === "string" ? review.before.creative_status : undefined,
    is_active: typeof review.before?.creative_is_active === "boolean" ? review.before.creative_is_active : undefined })
    && Boolean(review.before?.creative_name && review.before?.creative_tagline && creativeUrl);

  async function preview(kind: "inventory" | "approval") {
    if (locked) return;
    setBusy(true); setError(""); setStatus(""); setCreativeReviewed(false);
    try {
      const action = kind === "inventory" ? { action: "ad.inventory" as const, inventoryId: existing?.id ?? crypto.randomUUID(),
        position, orderIndex, active: acceptReservations, reason: inventoryReason.trim() }
        : { action: "ad.approve" as const, reservationId, reason: approvalReason.trim() };
      setReview(await previewAdAction(action));
    } catch (failure) { setError(failure instanceof Error ? failure.message : "The change could not be previewed."); }
    finally { setBusy(false); }
  }

  async function confirm() {
    if (!review || review.proposed.action === "ad.approve" && (!canApprove || !creativeReviewed)) return;
    setBusy(true); setError(""); setStatus("");
    try {
      const result = await confirmAdAction(review);
      setStatus(`Advertisement change saved. Audit ${result.auditId}.`);
      await refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "The change could not be confirmed. Refresh the records before trying again."); }
    finally { setReview(null); setBusy(false); setCreativeReviewed(false); }
  }

  return <section aria-labelledby="ad-operations-title" className="mt-10 border-t border-border pt-8">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 id="ad-operations-title" className="font-display text-[1.35rem] font-[800]">Advertisement placements</h2>
      <p className="mt-2 max-w-[650px] text-[0.82rem] leading-relaxed text-text-secondary">Configure available sidebar positions, then review paid creative before publishing it. Existing purchases keep their reserved position.</p></div>
      <button type="button" className={secondary} disabled={busy || loading} onClick={refresh}>{loading ? "Loading…" : "Refresh placements"}</button></div>
    {error && <p role="alert" className="mb-4 text-[0.82rem] text-red">{error}</p>}
    {status && <p role="status" className="mb-4 break-words text-[0.82rem] text-green">{status}</p>}

    <div className="grid gap-5 min-[800px]:grid-cols-2">
      <div className="min-w-0 rounded-[14px] border border-border bg-bg-card p-5">
        <h3 className="font-display text-[1.05rem] font-bold">Placement inventory</h3>
        <p className="mt-2 text-[0.78rem] leading-relaxed text-text-secondary">Five positions per sidebar. Enabling a position accepts new reservations; it does not publish an advertisement.</p>
        <div tabIndex={0} aria-label="Scrollable placement inventory" className="mt-4 max-h-[190px] overflow-auto rounded-lg border border-border">
          <table className="w-full text-left text-[0.75rem]"><caption className="sr-only">Configured sidebar inventory</caption>
            <thead><tr className="border-b border-border text-text-secondary"><th scope="col" className="px-3 py-2 font-medium">Position</th><th scope="col" className="px-3 py-2 font-medium">New bookings</th></tr></thead>
            <tbody>{inventory.rows.map((row) => <tr key={row.id} className="border-b border-border last:border-0"><td className="px-3 py-2 capitalize">{row.position} · {row.order_index + 1}</td><td className={`px-3 py-2 ${row.active ? "text-green" : "text-text-secondary"}`}>{row.active ? "Enabled" : "Disabled"}</td></tr>)}</tbody>
          </table>
          {!inventory.rows.length && <p className="p-3 text-[0.78rem] text-text-secondary">{loading ? "Loading inventory…" : "No placement inventory configured."}</p>}
        </div>
        {inventory.nextCursor && <button type="button" className={`${secondary} mt-2`} disabled={locked} onClick={() => more("ad-inventory")}>Load more inventory</button>}
        <fieldset disabled={locked} className="mt-4 min-w-0 space-y-3">
          <div className="grid grid-cols-2 gap-3"><label className="text-[0.78rem] font-semibold text-text-secondary">Sidebar<select className={field} value={position} onChange={(event) => setPosition(event.target.value as "left" | "right")}><option value="left">Left</option><option value="right">Right</option></select></label>
            <label className="text-[0.78rem] font-semibold text-text-secondary">Position<select className={field} value={orderIndex} onChange={(event) => setOrderIndex(Number(event.target.value))}>{[0, 1, 2, 3, 4].map((index) => <option key={index} value={index}>{index + 1}</option>)}</select></label></div>
          <label className="flex items-center justify-between gap-3 text-[0.8rem] text-text-secondary">Accept new reservations<input type="checkbox" checked={acceptReservations} onChange={(event) => setAcceptReservations(event.target.checked)} className="h-4 w-4 accent-accent" /></label>
          {occupied && <p className="text-[0.75rem] leading-relaxed text-orange">This position has an active advertisement ({occupied.name}). New capacity cannot be enabled here while it is occupied.</p>}
          {reserved && !occupied && <p className="text-[0.75rem] leading-relaxed text-orange">This position has a {reserved.status} reservation. Its capacity remains reserved for that purchase.</p>}
          <label className="block text-[0.78rem] font-semibold text-text-secondary">Reason<textarea className={`${field} min-h-[75px]`} value={inventoryReason} onChange={(event) => setInventoryReason(event.target.value)} minLength={8} maxLength={500} placeholder="Why this position should accept or stop new reservations" /></label>
          <button type="button" className={primary} disabled={locked || inventoryReason.trim().length < 8 || Boolean((occupied || reserved) && acceptReservations)} onClick={() => preview("inventory")}>Preview inventory change</button>
        </fieldset>
      </div>

      <div className="min-w-0 rounded-[14px] border border-border bg-bg-card p-5">
        <h3 className="font-display text-[1.05rem] font-bold">Paid creative review</h3>
        <p className="mt-2 text-[0.78rem] leading-relaxed text-text-secondary">Review paid creative or restore an eligible inactive advertisement. Payment, ownership and placement availability are checked again on confirmation.</p>
        <div tabIndex={0} aria-label="Scrollable advertisement reservations" className="mt-4 max-h-[190px] overflow-auto rounded-lg border border-border">
          <table className="w-full text-left text-[0.75rem]"><caption className="sr-only">Advertisement reservations</caption>
            <thead><tr className="border-b border-border text-text-secondary"><th scope="col" className="px-3 py-2 font-medium">Reservation</th><th scope="col" className="px-3 py-2 font-medium">Status</th></tr></thead>
            <tbody>{reservations.rows.map((row) => <tr key={row.id} className="border-b border-border last:border-0"><td className="px-3 py-2 font-mono" title={row.id}>{row.id.slice(0, 8)}</td><td className="px-3 py-2">{row.status === "paid" ? "Paid · review needed" : row.status}</td></tr>)}</tbody>
          </table>
          {!reservations.rows.length && <p className="p-3 text-[0.78rem] text-text-secondary">{loading ? "Loading reservations…" : "No advertisement reservations."}</p>}
        </div>
        {reservations.nextCursor && <button type="button" className={`${secondary} mt-2`} disabled={locked} onClick={() => more("ad-reservations")}>Load more reservations</button>}
        {adsCursor && <button type="button" className={`${secondary} mt-2`} disabled={locked} onClick={() => more("ads")}>Load more creative records</button>}
        <fieldset disabled={locked} className="mt-4 min-w-0 space-y-3">
          <label className="block text-[0.78rem] font-semibold text-text-secondary">Reservation to review<select className={field} value={reservationId} onChange={(event) => setReservationId(event.target.value)}><option value="">Choose paid or inactive creative</option>{reservations.rows.filter(reviewable).map((row) => <option key={row.id} value={row.id}>{row.id.slice(0, 8)} · {row.status === "active" ? "Recover inactive creative" : row.created_at.slice(0, 10)}</option>)}</select></label>
          {selected && <p className="break-all text-[0.72rem] text-text-secondary">Site {selected.site_id || "not available"} · Owner account {selected.user_id}</p>}
          <label className="block text-[0.78rem] font-semibold text-text-secondary">Review reason<textarea className={`${field} min-h-[75px]`} value={approvalReason} onChange={(event) => setApprovalReason(event.target.value)} minLength={8} maxLength={500} placeholder="Why this paid advertisement should be published" /></label>
          <button type="button" className={primary} disabled={locked || !selected || !reviewable(selected) || approvalReason.trim().length < 8} onClick={() => preview("approval")}>Preview paid creative</button>
        </fieldset>
      </div>
    </div>

    {review && <div className="mt-5 rounded-[14px] border border-accent/40 bg-accent/5 p-5" aria-label="Advertisement change preview">
      <h3 className="font-display text-[1.05rem] font-bold">{review.proposed.action === "ad.inventory" ? "Review inventory change" : "Review creative before publishing"}</h3>
      {review.proposed.action === "ad.inventory" ? <div className="mt-3 space-y-2 text-[0.82rem]">
        <p className="capitalize">{review.proposed.position} sidebar · position {review.proposed.orderIndex + 1}</p>
        <p>{review.before ? "Existing placement" : "New placement"}: bookings {review.before?.active === true ? "enabled" : "disabled"} → {review.proposed.active ? "enabled" : "disabled"}.</p>
        <p className="text-text-secondary">This change does not move or cancel existing paid advertisements.</p>
      </div> : <>
        <div className="mt-4 rounded-[10px] border border-border bg-bg-card p-4"><p className="font-display text-[1rem] font-bold">{text(review.before?.creative_name)}</p>
          <p className="mt-1 text-[0.82rem] leading-relaxed text-text-secondary">{text(review.before?.creative_tagline)}</p>
          {creativeUrl ? <a href={creativeUrl} target="_blank" rel="noopener noreferrer" className="mt-3 block break-all text-[0.78rem] text-accent underline">{creativeUrl}</a> : <p className="mt-2 text-[0.8rem] text-red">A valid creative URL is required before approval.</p>}
        </div>
        <p className="mt-3 break-all text-[0.75rem] text-text-secondary">Reservation {review.proposed.reservationId} · Payment status: {text(review.before?.status)} · Creative: {text(review.before?.creative_status)}</p>
        <p className="mt-2 text-[0.8rem] text-text-secondary capitalize">{text(review.before?.placement_position)} sidebar · position {typeof review.before?.placement_order_index === "number" ? review.before.placement_order_index + 1 : "not available"}</p>
        <p className="mt-2 text-[0.8rem] leading-relaxed text-text-secondary">Approval publishes this creative through the verified paid period. Renewals extend an approved placement after payment verification.</p>
        <label className="mt-4 flex items-start gap-2 text-[0.82rem] text-text-secondary"><input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-accent" checked={creativeReviewed} onChange={(event) => setCreativeReviewed(event.target.checked)} disabled={busy || !canApprove} />I have reviewed the creative and its destination.</label>
      </>}
      <p className="mt-3 text-[0.8rem] text-text-secondary">Reason: {review.proposed.reason}</p>
      <p className="mt-1 text-[0.75rem] text-text-secondary">Preview expires {new Date(review.expiresAt).toLocaleTimeString()}.</p>
      <div className="mt-4 flex flex-wrap gap-3"><button type="button" className={primary} disabled={busy || review.proposed.action === "ad.approve" && (!canApprove || !creativeReviewed)} onClick={confirm}>{busy ? "Saving…" : review.proposed.action === "ad.approve" ? "Approve and publish creative" : "Confirm inventory change"}</button>
        <button type="button" className={secondary} disabled={busy} onClick={() => setReview(null)}>Discard preview</button></div>
    </div>}
  </section>;
}

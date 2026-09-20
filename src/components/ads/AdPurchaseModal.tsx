"use client";

import { useEffect, useRef, useState } from "react";
import { getFaviconUrl, getDomain } from "@/lib/utils";
import { loadCheckoutCatalog, monthlyAd, productPrice, startAdCheckout, type CheckoutCatalog } from "@/components/pricing/checkout-client";

interface AdPurchaseModalProps {
  open: boolean;
  onClose: () => void;
  preferredPosition?: "left" | "right";
}

export function AdPurchaseModal({ open, onClose, preferredPosition }: AdPurchaseModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [catalog, setCatalog] = useState<CheckoutCatalog | null>(null);
  const [catalogFailed, setCatalogFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void loadCheckoutCatalog().then((value) => { if (active) { setCatalog(value); setCatalogFailed(false); } })
      .catch(() => { if (active) { setCatalog(null); setCatalogFailed(true); } });
    return () => { active = false; };
  }, [open]);

  useEffect(() => {
    if (!open || !dialogRef.current) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = dialogRef.current;
    dialog.querySelector<HTMLElement>("button")?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key !== "Tab") return;
      const controls = [...dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), [tabindex="0"]')].filter(element => element.offsetParent !== null);
      const first = controls[0], last = controls.at(-1);
      if (!first || !last) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", handleKey);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", handleKey); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [open, onClose]);

  if (!open) return null;

  const product = catalog ? monthlyAd(catalog) : undefined;
  const available = Boolean(product && catalog?.adInventory.some((item) => !preferredPosition || item.position === preferredPosition));
  const fullUrl = url.startsWith("http") ? url : `https://${url}`;
  const showPreview = url.trim().length > 3;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await startAdCheckout(fullUrl, preferredPosition, { name, tagline, usePublished: (publishedName, publishedTagline) => {
        setName(publishedName); setTagline(publishedTagline);
      } });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button type="button" tabIndex={-1} aria-label="Dismiss advertisement checkout" onClick={onClose} className="absolute inset-0 border-0 bg-black/60 backdrop-blur-sm" />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="ad-purchase-title" className="relative max-h-[90dvh] overflow-y-auto bg-bg-main border border-border rounded-[16px] w-full max-w-[420px] shadow-[0_20px_60px_rgba(0,0,0,0.5)] animate-fade-in-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-0">
          <h2 id="ad-purchase-title" className="font-display font-[800] text-[1.15rem]">
            Get Featured
          </h2>
          <button
            onClick={onClose}
            aria-label="Close advertisement checkout"
            className="text-text-muted hover:text-text-primary transition-colors text-xl leading-none border-none bg-transparent cursor-pointer p-1"
          >
            &#10005;
          </button>
        </div>

        <p className="text-[0.8rem] text-text-muted px-5 mt-1">
          Your published website details are used for the sidebar placement.
        </p>
        <p role="status" className="text-[0.8rem] text-text-secondary px-5 mt-2">
          {available && product ? `${productPrice(product)}/month. Renews until cancelled or the subscription term ends.`
            : catalogFailed ? "Checkout availability could not be loaded. Close and reopen to try again."
              : catalog ? "No monthly placement is available right now." : "Checking checkout availability…"}
        </p>

        <form onSubmit={handleSubmit} className="px-5 pb-5 pt-4">
          {/* URL */}
          <div className="mb-3">
            <label htmlFor="advertisement-url" className="block text-[0.75rem] font-semibold text-text-secondary mb-1">
              Website URL
            </label>
            <input
              id="advertisement-url"
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://yoursite.com"
              required
              className="w-full px-3 py-2.5 rounded-[10px] bg-bg-card border border-border text-text-primary text-[0.85rem] font-mono outline-none transition-colors focus:border-accent placeholder:text-text-muted"
            />
          </div>

          {/* Name */}
          <div className="mb-3">
            <label htmlFor="advertisement-name" className="block text-[0.75rem] font-semibold text-text-secondary mb-1">
              Website Name
            </label>
            <input
              id="advertisement-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Awesome SaaS"
              required
              maxLength={200}
              className="w-full px-3 py-2.5 rounded-[10px] bg-bg-card border border-border text-text-primary text-[0.85rem] outline-none transition-colors focus:border-accent placeholder:text-text-muted"
            />
          </div>

          {/* Tagline */}
          <div className="mb-4">
            <label htmlFor="advertisement-tagline" className="block text-[0.75rem] font-semibold text-text-secondary mb-1">
              Tagline
            </label>
            <input
              id="advertisement-tagline"
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="Ship faster with AI"
              required
              maxLength={200}
              className="w-full px-3 py-2.5 rounded-[10px] bg-bg-card border border-border text-text-primary text-[0.85rem] outline-none transition-colors focus:border-accent placeholder:text-text-muted"
            />
          </div>

          {/* Preview */}
          {showPreview && name && (
            <div className="mb-4">
              <div className="text-[0.68rem] font-semibold text-text-muted uppercase tracking-wide mb-1.5">
                Preview
              </div>
              <div className="bg-bg-card border border-border rounded-[10px] px-3 py-3 flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getFaviconUrl(fullUrl)}
                  alt=""
                  className="w-8 h-8 rounded-[6px] object-contain shrink-0 bg-white p-0.5"
                />
                <div className="min-w-0">
                  <div className="font-bold text-[0.82rem] text-text-primary truncate">
                    {name}
                  </div>
                  <div className="text-[0.7rem] text-text-muted truncate">
                    {tagline || getDomain(fullUrl)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="text-red text-[0.8rem] mb-3">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading || !available || !name || !tagline || !url}
            className="w-full py-3 rounded-[10px] bg-gradient-to-br from-accent to-accent-bright text-bg-deep font-bold text-[0.92rem] border-none cursor-pointer font-body transition-all duration-200 hover:-translate-y-px hover:shadow-[0_0_25px_var(--color-accent-glow)] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Redirecting..." : "Continue to checkout"}
          </button>

          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-3 text-[0.68rem] text-text-muted">
            {["Desktop sidebar placement", "Monthly billing", "Cancel future renewals"].map(
              (label) => (
                <span key={label} className="flex items-center gap-1">
                  <span className="text-green text-[0.55rem]">&#10003;</span>
                  {label}
                </span>
              )
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

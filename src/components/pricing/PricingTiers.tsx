"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ArrowUpRight } from "@phosphor-icons/react";
import { accountPro, loadCheckoutCatalog, monthlyAd, productPeriod, productPrice, startProCheckout, type CheckoutCatalog } from "./checkout-client";

const freeFeatures = ["One website listing", "Recorded performance results", "Scheduled speed monitoring", "Homepage badge required"];
const proFeatures = ["Unlimited website submissions", "No homepage badge requirement", "Dofollow website links", "One payment for Pro account access"];
const adFeatures = ["One desktop sidebar placement", "Shown beside the leaderboard", "Your name, tagline and a direct link", "Billed monthly, cancel anytime"];

export function PricingTiers({ isPro = false }: { isPro?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [catalog, setCatalog] = useState<CheckoutCatalog | null>(null);
  const [catalogFailed, setCatalogFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void loadCheckoutCatalog().then(value => { if (active) setCatalog(value); })
      .catch(() => { if (active) setCatalogFailed(true); });
    return () => { active = false; };
  }, []);
  const product = catalog ? accountPro(catalog) : undefined;
  const ad = catalog ? monthlyAd(catalog) : undefined;
  const openSpots = catalog?.adInventory.length ?? 0;
  const catalogStatus = catalogFailed ? "Checkout availability could not be loaded. Please refresh to try again."
    : catalog ? "Pro checkout is currently unavailable." : "Checking checkout availability…";

  async function handleProCheckout() {
    setLoading(true); setError("");
    try { await startProCheckout(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Purchases are temporarily unavailable."); }
    finally { setLoading(false); }
  }

  return <>
    <div className="@container"><div className="grid grid-cols-1 gap-5 @2xl:grid-cols-2 @4xl:grid-cols-3">
      <section className="content-card flex flex-col">
        <div className="mb-7 flex items-center justify-between gap-3"><h2 className="font-display text-xl font-semibold">Free</h2><span className="text-xs text-text-secondary">For your first website</span></div>
        <p className="flex items-baseline gap-3"><span className="font-display text-[3.5rem] font-medium leading-none tracking-[-0.05em]">$0</span><span className="text-sm text-text-secondary">no payment</span></p>
        <p className="mt-5 text-sm leading-7 text-text-secondary">Give your website a place on the leaderboard. Start with one listing and see how it performs.</p>
        <ul className="my-7 flex-1 space-y-3 border-t border-border pt-6">{freeFeatures.map(text => <li key={text} className="flex gap-3 text-sm text-text-primary"><Check size={17} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" /><span>{text}</span></li>)}</ul>
        <Link href="/submit" className="content-action-secondary w-full">Submit your website <ArrowUpRight size={17} aria-hidden="true" /></Link>
        <p className="mt-3 text-center text-xs leading-5 text-text-secondary">Sign in with Google to get started.</p>
      </section>
      <section className="content-card flex flex-col border-t-2 border-t-accent">
        <div className="mb-7 flex items-center justify-between gap-3"><h2 className="font-display text-xl font-semibold">Pro</h2><span className="rounded-md bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">One-time purchase</span></div>
        <p className="flex items-baseline gap-3"><span className="font-display text-[3.5rem] font-medium leading-none tracking-[-0.05em]">{product ? productPrice(product) : "$9"}</span><span className="text-sm text-text-secondary">{product ? productPeriod(product) : "USD · one-time"}</span></p>
        <p className="mt-5 text-sm leading-7 text-text-secondary">For builders with more to share. Add every website you manage, without a badge on each homepage.</p>
        <ul className="my-7 flex-1 space-y-3 border-t border-border pt-6">{proFeatures.map(text => <li key={text} className="flex gap-3 text-sm text-text-primary"><Check size={17} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" /><span>{text}</span></li>)}</ul>
        {isPro ? <p className="content-action-secondary w-full" role="status">Your Pro plan is active</p> : <button type="button" onClick={handleProCheckout} disabled={loading || !product} className="content-action w-full">{loading ? "Opening checkout…" : "Get Pro access"}<ArrowUpRight size={17} aria-hidden="true" /></button>}
        <p role={!isPro && !product ? "status" : undefined} className="mt-3 text-center text-xs leading-5 text-text-secondary">{!isPro && !product ? catalogStatus : "No recurring listing subscription."}</p>
      </section>
      <section className="content-card flex flex-col @2xl:col-span-2 @4xl:col-span-1">
        <div className="mb-7 flex items-center justify-between gap-3"><h2 className="font-display text-xl font-semibold">Sidebar ad</h2><span className="rounded-md border border-border-light px-2.5 py-1 text-xs font-medium text-text-secondary">Sponsored</span></div>
        <p className="flex items-baseline gap-3"><span className="font-display text-[3.5rem] font-medium leading-none tracking-[-0.05em]">{ad ? productPrice(ad) : "$19"}</span><span className="text-sm text-text-secondary">{ad ? `${ad.currency} ${productPeriod(ad)}` : "USD /month"}</span></p>
        <p className="mt-5 text-sm leading-7 text-text-secondary">Put your product beside the rankings. A labelled placement, separate from organic results and measured scores.</p>
        <ul className="my-7 flex-1 space-y-3 border-t border-border pt-6">{adFeatures.map(text => <li key={text} className="flex gap-3 text-sm text-text-primary"><Check size={17} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" /><span>{text}</span></li>)}</ul>
        <Link href="/advertise" className="content-action-secondary w-full">Book a placement <ArrowUpRight size={17} aria-hidden="true" /></Link>
        <p className="mt-3 text-center text-xs leading-5 text-text-secondary">{openSpots > 0 ? `${openSpots} ${openSpots === 1 ? "placement is" : "placements are"} open right now.` : "Subject to availability and creative approval."}</p>
      </section>
    </div></div>
    {error && <p role="alert" className="mt-5 text-sm text-red">{error}</p>}
    <p className="mt-5 text-xs leading-6 text-text-secondary">Prices in USD. Applicable taxes and the final amount are shown at checkout. Listing and monitoring depend on eligibility and service availability.</p>
  </>;
}

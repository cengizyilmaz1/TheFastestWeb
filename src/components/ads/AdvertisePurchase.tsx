"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight } from "@phosphor-icons/react";
import { loadCheckoutCatalog, monthlyAd, productPrice, type CheckoutCatalog } from "@/components/pricing/checkout-client";
import { AdPurchaseModal } from "./AdPurchaseModal";

export function AdvertisePurchase() {
  const [catalog, setCatalog] = useState<CheckoutCatalog | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let active = true;
    void loadCheckoutCatalog().then(value => { if (active) setCatalog(value); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);
  const product = catalog ? monthlyAd(catalog) : undefined;
  const available = Boolean(product && catalog?.adInventory.length);
  return <>
    <p className="flex items-baseline gap-3"><span className="font-display text-5xl font-medium tracking-[-0.05em]">{product ? productPrice(product) : "$19"}</span><span className="text-sm text-text-secondary">USD / month</span></p>
    <p className="my-5 text-sm leading-7 text-text-secondary">One sidebar placement. Monthly billing through Dodo Payments.</p>
    <button type="button" className="content-action w-full" onClick={() => setOpen(true)} disabled={!available}>Book a placement <ArrowUpRight aria-hidden="true" size={18} /></button>
    <p role="status" className="mt-3 text-xs leading-6 text-text-secondary">{failed ? "Availability could not be loaded. Refresh to try again." : !catalog ? "Checking available placements…" : available ? "Availability is confirmed again at checkout." : "No placement is available to purchase right now."}</p>
    <AdPurchaseModal open={open} onClose={() => setOpen(false)} />
  </>;
}

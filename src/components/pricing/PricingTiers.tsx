"use client";

import { useState } from "react";
import Link from "next/link";
import { AdPurchaseModal } from "@/components/ads/AdPurchaseModal";

const INACTIVITY_INFO = "Speed monitoring pauses after 10 days without login. Listing is removed after 30 days of inactivity. Log back in at any time to reactivate instantly.";

const tiers = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Get started with daily speed monitoring for one website.",
    features: [
      { text: "1 website listing", included: true },
      { text: "Dofollow backlink", included: true },
      { text: "Speed trend alerts", included: true },
      { text: "Daily speed monitoring", included: true },
      { text: "Badge embed required", included: true, conditional: true },
      { text: "Pauses after 10 days inactive, removed at 30", included: true, conditional: true, info: INACTIVITY_INFO },
      { text: "Unlimited website listings", included: false },
      { text: "Lifetime tracking", included: false },
    ],
    cta: "Submit Your Site",
    href: "/submit",
    highlight: false,
    isCheckout: false,
  },
  {
    name: "Pro",
    price: "$9",
    period: "one-time",
    description:
      "Unlimited sites, dofollow backlinks, and priority support. Pay once, own forever.",
    features: [
      { text: "Unlimited website listings", included: true },
      { text: "Dofollow backlink", included: true },
      { text: "Speed trend alerts", included: true },
      { text: "Priority tracking", included: true },
      { text: "No badge required", included: true },
      { text: "Lifetime tracking", included: true },
      { text: "Weekly recap email", included: true },
      { text: "Priority support", included: true },
    ],
    cta: "Upgrade to Pro",
    href: "",
    highlight: true,
    isCheckout: true,
  },
  {
    name: "Ad Slot",
    price: "$19",
    period: "/month",
    description:
      "Featured placement on every page + mention in our weekly recap email to all site owners.",
    features: [
      { text: "Featured sidebar placement", included: true },
      { text: "Visible on every page", included: true },
      { text: "Weekly recap email mention", included: true },
      { text: "Custom icon & description", included: true },
      { text: "Direct link to your site", included: true },
      { text: "Cancel anytime", included: true },
    ],
    cta: "Get Featured",
    href: "",
    highlight: false,
    isCheckout: false,
    isAdCheckout: true,
  },
];

interface PricingTiersProps {
  isPro?: boolean;
}

export function PricingTiers({ isPro = false }: PricingTiersProps) {
  const [loading, setLoading] = useState(false);
  const [adModalOpen, setAdModalOpen] = useState(false);
  const [infoTooltip, setInfoTooltip] = useState<string | null>(null);

  async function handleProCheckout() {
    setLoading(true);
    try {
      const resp = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: "pro" }),
      });

      if (resp.status === 401) {
        window.location.href = "/submit";
        return;
      }

      const data = await resp.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      // fallback to submit page
      window.location.href = "/submit";
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
    {infoTooltip && (
      <div className="fixed inset-0 z-40" onClick={() => setInfoTooltip(null)} />
    )}
    <div className="grid grid-cols-3 gap-5 max-w-[900px] mx-auto max-[800px]:grid-cols-1 max-[800px]:max-w-[400px]">
      {tiers.map((tier) => (
        <div
          key={tier.name}
          className={`relative rounded-[14px] p-6 flex flex-col ${
            tier.highlight
              ? "bg-bg-card border-2 border-accent shadow-[0_0_40px_rgba(245,158,11,0.1)]"
              : "bg-bg-card border border-border"
          }`}
        >
          {tier.highlight && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-gradient-to-r from-accent to-accent-bright text-bg-deep text-[0.68rem] font-bold tracking-wide uppercase">
              Most Popular
            </div>
          )}

          <div className="mb-5">
            <h2 className="font-display font-[800] text-[1.2rem] text-text-primary mb-1">
              {tier.name}
            </h2>
            <div className="flex items-baseline gap-1">
              <span className="font-mono font-[800] text-[2.2rem] leading-none text-text-primary">
                {tier.price}
              </span>
              <span className="text-text-muted text-[0.82rem]">
                {tier.period}
              </span>
            </div>
            <p className="text-text-secondary text-[0.82rem] mt-2 leading-relaxed">
              {tier.description}
            </p>
          </div>

          <ul className="flex-1 space-y-2.5 mb-6">
            {tier.features.map((feature) => (
              <li
                key={feature.text}
                className={`flex items-start gap-2 text-[0.82rem] ${"conditional" in feature && feature.conditional ? "text-text-muted" : feature.included ? "text-text-secondary" : "text-text-muted line-through opacity-50"}`}
              >
                {"conditional" in feature && feature.conditional ? (
                  <span className="text-text-muted text-[0.9rem] leading-none mt-0.5 shrink-0">~</span>
                ) : feature.included ? (
                  <span className="text-green text-[0.9rem] leading-none mt-0.5 shrink-0">
                    &#10003;
                  </span>
                ) : (
                  <span className="text-text-muted text-[0.9rem] leading-none mt-0.5 shrink-0">
                    &#10005;
                  </span>
                )}
                <span className="flex items-center gap-1">
                  {feature.text}
                  {"info" in feature && feature.info && (
                    <span className="relative inline-flex">
                      <button
                        type="button"
                        onClick={() => setInfoTooltip(infoTooltip === feature.text ? null : feature.text)}
                        className="w-[14px] h-[14px] rounded-full bg-bg-elevated border border-border text-text-muted text-[9px] font-bold flex items-center justify-center cursor-pointer hover:border-border-light hover:text-text-primary transition-colors"
                        aria-label="More info"
                      >
                        i
                      </button>
                      {infoTooltip === feature.text && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-[220px] bg-bg-elevated border border-border rounded-[10px] p-3 text-[0.75rem] text-text-secondary shadow-[0_8px_24px_rgba(0,0,0,0.4)] z-50" onClick={(e) => e.stopPropagation()}>
                          {feature.info}
                          <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-bg-elevated border-r border-b border-border rotate-45 -mt-1" />
                        </div>
                      )}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>

          {tier.isCheckout ? (
            isPro ? (
              <div className="block w-full text-center py-2.5 rounded-[10px] font-semibold text-[0.88rem] bg-bg-elevated border border-border text-text-muted">
                Current Plan
              </div>
            ) : (
              <button
                onClick={handleProCheckout}
                disabled={loading}
                className="block w-full text-center py-2.5 rounded-[10px] font-semibold text-[0.88rem] no-underline transition-all duration-200 cursor-pointer border-none font-body bg-gradient-to-br from-accent to-accent-bright text-bg-deep shadow-[0_0_20px_var(--color-accent-glow)] hover:-translate-y-0.5 hover:shadow-[0_0_30px_rgba(245,158,11,0.25)] disabled:opacity-60"
              >
                {loading ? "Redirecting..." : tier.cta}
              </button>
            )
          ) : "isAdCheckout" in tier && tier.isAdCheckout ? (
            <button
              onClick={() => setAdModalOpen(true)}
              className="block w-full text-center py-2.5 rounded-[10px] font-semibold text-[0.88rem] no-underline transition-all duration-200 cursor-pointer border-none font-body bg-bg-elevated border border-border text-text-primary hover:bg-bg-card-hover hover:border-border-light"
            >
              {tier.cta}
            </button>
          ) : (
            <Link
              href={tier.href}
              className={`block text-center py-2.5 rounded-[10px] font-semibold text-[0.88rem] no-underline transition-all duration-200 bg-bg-elevated border border-border text-text-primary hover:bg-bg-card-hover hover:border-border-light`}
            >
              {tier.cta}
            </Link>
          )}
        </div>
      ))}
    </div>

      <AdPurchaseModal open={adModalOpen} onClose={() => setAdModalOpen(false)} />
    </>
  );
}

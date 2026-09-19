"use client";

import Link from "next/link";

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
      { text: "Permanent website listing", included: true },
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
      "Existing Pro members retain unlimited sites and listings without a badge requirement.",
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
  return (
    <>
    <p role="status" className="max-w-[700px] mx-auto text-center text-[0.85rem] text-text-secondary mb-8">
      New Pro upgrades and advertising purchases are temporarily unavailable. Existing plans remain active.
    </p>
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
              Existing Pro plans
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
                disabled
                className="block w-full text-center py-2.5 rounded-[10px] font-semibold text-[0.88rem] no-underline transition-all duration-200 cursor-pointer border-none font-body bg-gradient-to-br from-accent to-accent-bright text-bg-deep shadow-[0_0_20px_var(--color-accent-glow)] hover:-translate-y-0.5 hover:shadow-[0_0_30px_rgba(245,158,11,0.25)] disabled:opacity-60"
              >
                Upgrades temporarily unavailable
              </button>
            )
          ) : "isAdCheckout" in tier && tier.isAdCheckout ? (
            <button
              disabled
              className="block w-full text-center py-2.5 rounded-[10px] font-semibold text-[0.88rem] no-underline transition-all duration-200 cursor-pointer border-none font-body bg-bg-elevated border border-border text-text-primary hover:bg-bg-card-hover hover:border-border-light"
            >
              Purchases temporarily unavailable
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

    </>
  );
}

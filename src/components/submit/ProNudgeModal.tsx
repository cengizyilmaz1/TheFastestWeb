"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { accountPro, loadCheckoutCatalog, productPrice, type CatalogProduct } from "@/components/pricing/checkout-client";

interface ProNudgeModalProps {
  onContinueFree: () => void;
  onClose: () => void;
  onUpgrade?: () => Promise<void>; // if provided, handles checkout inline
}

const PERKS = [
  {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
      </svg>
    ),
    label: "Dofollow backlink",
    sub: "Free gives you nofollow only. Pro gives full SEO credit on your listing.",
  },
  {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M9 21V9" />
      </svg>
    ),
    label: "Unlimited site listings",
    sub: "Free plan is limited to 1 site.",
  },
  {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2-2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
    ),
    label: "Weekly recap email",
    sub: "Weekly digest of your site's scores sent to your inbox.",
  },
  {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    label: "Lifetime Pro access",
    sub: "One payment for account-wide Pro benefits. No recurring listing fee.",
  },
];

export function ProNudgeModal({ onContinueFree, onClose, onUpgrade }: ProNudgeModalProps) {
  const [mounted, setMounted] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [error, setError] = useState("");
  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [catalogLoaded, setCatalogLoaded] = useState(false);

  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    if (!onUpgrade) return;
    let active = true;
    void loadCheckoutCatalog().then((catalog) => { if (active) setProduct(accountPro(catalog) ?? null); })
      .catch(() => undefined).finally(() => { if (active) setCatalogLoaded(true); });
    return () => { active = false; };
  }, [onUpgrade]);

  if (!mounted) return null;

  async function handleUpgrade() {
    if (!onUpgrade) return;
    setUpgrading(true);
    setError("");
    try {
      await onUpgrade();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Purchases are temporarily unavailable.");
    } finally {
      setUpgrading(false);
    }
  }

  const modal = (
    <div
      className="fixed inset-0 z-[500] bg-black/70 backdrop-blur-[6px] flex items-center justify-center p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-bg-main border border-border rounded-[16px] w-full max-w-[400px] animate-modal-in overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.6)]">
        <div className="h-1 w-full bg-gradient-to-r from-accent to-accent-bright" />

        <div className="p-6">
          <div className="flex items-start justify-between mb-1">
            <h3 className="font-display font-[900] text-[1.1rem] tracking-[-0.02em]">
              Unlock more with Pro
            </h3>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg bg-bg-card border border-border text-text-muted text-sm cursor-pointer flex items-center justify-center shrink-0 transition-all hover:bg-bg-card-hover hover:text-text-primary ml-3"
            >
              &#10005;
            </button>
          </div>
          <p className="text-text-muted text-[0.78rem] mb-4">
            Free submission works — but here&apos;s what you&apos;d be leaving behind.
          </p>
          {onUpgrade && <p role="status" className="text-text-secondary text-[0.8rem] mb-4">
            {product ? `${productPrice(product)} one-time. Lifetime Pro access.` : catalogLoaded ? "Pro checkout is not available right now." : "Checking Pro availability…"}
          </p>}

          <div className="flex flex-col gap-2.5 mb-5">
            {PERKS.map((perk) => (
              <div key={perk.label} className="flex items-start gap-3 p-3 rounded-[10px] bg-bg-card border border-border">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent/20 to-accent-bright/10 flex items-center justify-center shrink-0 text-accent mt-0.5">
                  {perk.icon}
                </div>
                <div>
                  <p className="text-[0.83rem] font-semibold text-text-primary leading-snug">{perk.label}</p>
                  <p className="text-[0.73rem] text-text-muted leading-snug mt-0.5">{perk.sub}</p>
                </div>
              </div>
            ))}
          </div>

          {error && <p role="alert" className="text-red text-[0.78rem] mb-3">{error}</p>}
          <div className="flex flex-col gap-2">
            {onUpgrade ? (
              <button
                onClick={handleUpgrade}
                disabled={upgrading || !product}
                className="w-full py-3 rounded-[10px] font-bold text-[0.92rem] bg-gradient-to-br from-accent to-accent-bright text-bg-deep border-none cursor-pointer font-body transition-all duration-200 hover:-translate-y-px hover:shadow-[0_0_25px_var(--color-accent-glow)] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {upgrading ? "Redirecting to checkout..." : "Upgrade to Pro"}
              </button>
            ) : (
              <Link
                href="/pricing"
                className="block w-full text-center py-3 rounded-[10px] font-bold text-[0.92rem] bg-gradient-to-br from-accent to-accent-bright text-bg-deep no-underline transition-all duration-200 hover:-translate-y-px hover:shadow-[0_0_25px_var(--color-accent-glow)]"
              >
                View Pro pricing
              </Link>
            )}
            <button
              type="button"
              onClick={onContinueFree}
              className="w-full py-2.5 rounded-[10px] font-medium text-[0.85rem] bg-transparent border border-border text-text-muted cursor-pointer transition-all hover:border-border-light hover:text-text-primary"
            >
              Continue with free plan
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

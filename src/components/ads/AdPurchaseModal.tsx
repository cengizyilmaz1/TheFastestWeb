"use client";

import { useState } from "react";
import { getFaviconUrl, getDomain } from "@/lib/utils";

interface AdPurchaseModalProps {
  open: boolean;
  onClose: () => void;
  preferredPosition?: "left" | "right";
}

export function AdPurchaseModal({ open, onClose, preferredPosition }: AdPurchaseModalProps) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const fullUrl = url.startsWith("http") ? url : `https://${url}`;
  const showPreview = url.trim().length > 3;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const resp = await fetch("/api/ad-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          tagline,
          url: fullUrl,
          preferredPosition,
        }),
      });

      const data = await resp.json();
      if (data.error) {
        setError(data.error);
        setLoading(false);
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setError("Something went wrong. Please try again.");
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
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-bg-main border border-border rounded-[16px] w-full max-w-[420px] shadow-[0_20px_60px_rgba(0,0,0,0.5)] animate-fade-in-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-0">
          <h2 className="font-display font-[800] text-[1.15rem]">
            Get Featured
          </h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors text-xl leading-none border-none bg-transparent cursor-pointer p-1"
          >
            &#10005;
          </button>
        </div>

        <p className="text-[0.8rem] text-text-muted px-5 mt-1">
          Your ad will appear in the sidebar on every page.
        </p>

        <form onSubmit={handleSubmit} className="px-5 pb-5 pt-4">
          {/* URL */}
          <div className="mb-3">
            <label className="block text-[0.75rem] font-semibold text-text-secondary mb-1">
              Website URL
            </label>
            <input
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
            <label className="block text-[0.75rem] font-semibold text-text-secondary mb-1">
              Website Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Awesome SaaS"
              required
              maxLength={30}
              className="w-full px-3 py-2.5 rounded-[10px] bg-bg-card border border-border text-text-primary text-[0.85rem] outline-none transition-colors focus:border-accent placeholder:text-text-muted"
            />
          </div>

          {/* Tagline */}
          <div className="mb-4">
            <label className="block text-[0.75rem] font-semibold text-text-secondary mb-1">
              Tagline
            </label>
            <input
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="Ship faster with AI"
              required
              maxLength={60}
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
            disabled={loading || !name || !tagline || !url}
            className="w-full py-3 rounded-[10px] bg-gradient-to-br from-accent to-accent-bright text-bg-deep font-bold text-[0.92rem] border-none cursor-pointer font-body transition-all duration-200 hover:-translate-y-px hover:shadow-[0_0_25px_var(--color-accent-glow)] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Redirecting..." : "Subscribe - $19/mo"}
          </button>

          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-3 text-[0.68rem] text-text-muted">
            {["Visible on every page", "Cancel anytime", "Weekly recap mention"].map(
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

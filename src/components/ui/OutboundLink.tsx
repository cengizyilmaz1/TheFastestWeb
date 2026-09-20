"use client";

import type { ReactNode } from "react";
import { outboundHref, type OutboundPlacement } from "@/lib/outbound";

export function observeOutboundClick(placement: OutboundPlacement, id: string | number): void {
  const endpoint = placement === "sidebar" ? "/api/ad-click" : "/api/site-click";
  const body = JSON.stringify({ id });
  try {
    // A string beacon is text/plain, which the JSON-only endpoint rejects.
    // Navigation never waits for measurement and still works without JavaScript.
    if (navigator.sendBeacon?.(endpoint, new Blob([body], { type: "application/json" }))) return;
    void fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body,
      keepalive: true, credentials: "omit", redirect: "error" }).catch(() => undefined);
  } catch { /* Measurement cannot interrupt the external link. */ }
}

export function OutboundLink({ href, placement, trackingId, children, className, rel, title }: {
  href: string; placement: OutboundPlacement; trackingId: string | number; children?: ReactNode;
  className?: string; rel?: string; title?: string;
}) {
  return <a href={outboundHref(href, placement)} target="_blank" rel={rel ?? "noopener noreferrer"} className={className} title={title}
    onClick={() => observeOutboundClick(placement, trackingId)}
    onAuxClick={(event) => { if (event.button === 1) observeOutboundClick(placement, trackingId); }}>
    {children}
  </a>;
}

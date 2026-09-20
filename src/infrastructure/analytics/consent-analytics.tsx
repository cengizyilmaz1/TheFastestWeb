"use client";
import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { DataFastWeb } from "datafast";
import { isAnalyticsOrigin, isAnalyticsPage, type PublicAnalyticsConfig } from "./consent";
import { browserAnalyticsAllowed, clearDataFastStorage, guardAnalyticsNavigation, isAnalyticsReferrer, loadDataFastClient, prepareCookielessAnalytics, stopDataFastClient } from "./datafast-browser";

/** Cookieless measurement has no banner or floating controls. Google Analytics
 * is deliberately not loaded; authentication/security cookies are unaffected. */
export default function ConsentAnalytics({ config }: { config: PublicAnalyticsConfig }) {
  const pathname = usePathname(), params = useSearchParams();
  const search = params.toString();
  useEffect(() => {
    if (!config.enabled || !isAnalyticsOrigin(location.origin, config.siteOrigin) || !config.datafastDomain) return;
    let disposed = false, stopping = false;
    let loading: Promise<DataFastWeb> | undefined;
    const eligible = () => browserAnalyticsAllowed() && isAnalyticsOrigin(location.origin, config.siteOrigin)
      && isAnalyticsPage(location.pathname, location.search) && !location.hash && isAnalyticsReferrer(document.referrer);
    const restoreNavigation = eligible() ? guardAnalyticsNavigation() : () => undefined;
    const revoke = () => {
      if (browserAnalyticsAllowed() || stopping) return;
      stopping = true;
      prepareCookielessAnalytics(config.datafastDomain!);
      // Also suppress pending server attribution for the signed-in account.
      try { localStorage.setItem("tfw-pending-analytics-revocation", "1"); } catch { /* Optional storage. */ }
      void fetch("/api/analytics/consent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ granted: false }) })
        .then((response) => { if (response.ok) localStorage.removeItem("tfw-pending-analytics-revocation"); }).catch(() => undefined);
      void stopDataFastClient().then((started) => {
        try { clearDataFastStorage(localStorage); clearDataFastStorage(sessionStorage); } catch { /* Optional storage. */ }
        // SDK optOut cannot cancel an already-running queue flush. Leave this
        // document after saving denial, so remaining requests/listeners stop.
        if (started) location.reload();
      }).catch(() => undefined);
    };
    // Strict-mode mount cleanup must finish before importing a provider.
    queueMicrotask(() => {
      if (disposed) return;
      prepareCookielessAnalytics(config.datafastDomain!);
      if (!browserAnalyticsAllowed()) { revoke(); return; }
      if (!eligible() || !config.datafastWebsiteId) return;
      loading = loadDataFastClient(config.datafastWebsiteId, config.datafastDomain!);
      void loading.then(async (client) => {
        if (disposed || !eligible()) return;
        await client.trackPageview(location.pathname);
        await client.flush();
      }).catch(() => { /* Optional measurement never blocks the website. */ });
    });
    window.addEventListener("focus", revoke);
    window.addEventListener("storage", revoke);
    return () => { disposed = true; restoreNavigation(); window.removeEventListener("focus", revoke); window.removeEventListener("storage", revoke); };
  }, [config.enabled, config.siteOrigin, config.datafastWebsiteId, config.datafastDomain, pathname, search]);
  return null;
}

"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ChartLineIcon } from "@phosphor-icons/react";
import { ANALYTICS_CONSENT_COOKIE, isAnalyticsPage, readAnalyticsConsent, type AnalyticsConsent, type PublicAnalyticsConfig } from "./consent";

type AnalyticsWindow = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void; [key: `ga-disable-${string}`]: boolean };
function browserSignals() { return { gpc: Boolean((navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl), dnt: navigator.doNotTrack }; }

export default function ConsentAnalytics({ config }: { config: PublicAnalyticsConfig }) {
  const [consent, setConsent] = useState<AnalyticsConsent>("unset");
  const [loaded, setLoaded] = useState(false);
  const trackersStarted = useRef(false);
  const [consentError, setConsentError] = useState("");
  const pathname = usePathname(), params = useSearchParams();
  const search = params.toString();
  useEffect(() => {
    const read = () => {
      const value = readAnalyticsConsent(document.cookie, browserSignals());
      // A different tab or changed privacy signal can revoke consent while this
      // tab is idle. Removing script elements cannot remove provider listeners.
      if (value !== "granted" && trackersStarted.current) { location.reload(); return; }
      setConsent(value); setLoaded(true);
    };
    // Schedule the external cookie read after mounting; server markup is stable.
    queueMicrotask(read);
    try {
      if (localStorage.getItem("tfw-pending-analytics-revocation") === "1") {
        void fetch("/api/analytics/consent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ granted: false }) })
          .then((response) => { if (!response.ok) throw new Error("Consent update failed"); localStorage.removeItem("tfw-pending-analytics-revocation"); setConsentError(""); })
          .catch(() => setConsentError("Browser analytics are disabled. Retry saving the account attribution preference."));
      }
    } catch { /* Storage may be disabled by the browser; consent cookies still apply. */ }
    window.addEventListener("focus", read);
    return () => window.removeEventListener("focus", read);
  }, []);
  const eligible = isAnalyticsPage(pathname, search);
  useEffect(() => {
    if (!config.enabled || consent !== "granted" || !eligible) return;
    const win = window as unknown as AnalyticsWindow;
    trackersStarted.current = true;
    const scripts: HTMLScriptElement[] = [];
    // Trackers install their own history listeners with no unload API. Keep
    // consented tracking in this public document only; every route transition
    // gets a fresh document before third-party code can observe a private URL.
    const push = history.pushState, replace = history.replaceState;
    const navigate = (original: History["pushState"]) => (data: unknown, unused: string, url?: string | URL | null) => {
      const target = url ? new URL(url, location.href) : null;
      if (target && target.href !== location.href) { location.assign(target.href); return; }
      original.call(history, data, unused, url);
    };
    history.pushState = navigate(push); history.replaceState = navigate(replace);
    if (config.gaId) {
      win[`ga-disable-${config.gaId}`] = false;
      win.dataLayer ??= [];
      win.gtag ??= (...args: unknown[]) => { win.dataLayer!.push(args); };
      win.gtag("consent", "default", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
      win.gtag("js", new Date());
      win.gtag("config", config.gaId, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
      win.gtag("event", "page_view", { page_location: `${location.origin}${location.pathname}`, page_referrer: "", page_title: document.title });
      const script = document.createElement("script");
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(config.gaId)}`;
      script.async = true; script.referrerPolicy = "no-referrer"; document.head.append(script); scripts.push(script);
    }
    if (config.datafastWebsiteId && config.datafastDomain) {
      const script = document.createElement("script");
      script.src = "https://datafa.st/js/script.js"; script.defer = true; script.referrerPolicy = "no-referrer";
      script.dataset.websiteId = config.datafastWebsiteId; script.dataset.domain = config.datafastDomain;
      script.dataset.disablePayments = "true"; script.dataset.disableConsole = "true";
      document.head.append(script); scripts.push(script);
    }
    return () => { for (const script of scripts) script.remove(); history.pushState = push; history.replaceState = replace;
      if (config.gaId) win[`ga-disable-${config.gaId}`] = true; };
  }, [config.enabled, config.gaId, config.datafastWebsiteId, config.datafastDomain, consent, eligible]);
  useEffect(() => {
    if (consent !== "granted" || !config.enabled) return;
    const guard = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0 || anchor.target === "_blank") return;
      const target = new URL(anchor.href);
      if (target.origin === location.origin && target.href !== location.href) {
        event.preventDefault(); event.stopImmediatePropagation(); location.assign(target.href);
      }
    };
    document.addEventListener("click", guard, true);
    return () => document.removeEventListener("click", guard, true);
  }, [consent, config.enabled]);
  async function choose(value: "granted" | "denied") {
    const signals = browserSignals();
    const choice = signals.gpc || signals.dnt === "1" ? "denied" : value;
    document.cookie = `${ANALYTICS_CONSENT_COOKIE}=${choice}; Path=/; Max-Age=15552000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    if (choice === "denied") {
      try { localStorage.setItem("tfw-pending-analytics-revocation", "1"); } catch { /* Cookie-based denial still applies. */ }
      const domains = ["", location.hostname, `.${location.hostname}`, ...(config.datafastDomain ? [config.datafastDomain, `.${config.datafastDomain}`] : [])];
      for (const part of document.cookie.split(";")) {
        const name = part.trim().split("=")[0];
        if (/^(_ga(?:_|$)|_gid$|datafast_)/.test(name)) for (const domain of domains) document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax${domain ? `; Domain=${domain}` : ""}`;
      }
      try {
        const result = await fetch("/api/analytics/consent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ granted: false }) });
        if (!result.ok) throw new Error("Consent update failed");
        try { localStorage.removeItem("tfw-pending-analytics-revocation"); } catch { /* Optional browser storage. */ }
      } catch { /* Retried after reload; provider listeners must be unloaded now. */ }
      // Unloads provider listeners as well as script elements.
      location.reload();
    } else setConsent(choice);
  }
  if (!config.enabled || !loaded || pathname.startsWith("/unsubscribe")) return null;
  if (consent !== "unset") return <div className="fixed bottom-3 left-3 z-40 max-w-[min(24rem,calc(100vw-1.5rem))] rounded-[20px] border border-border bg-bg-elevated p-1 text-xs shadow-panel">
    <button type="button" className="inline-flex min-h-9 items-center gap-2 rounded-full px-3.5 font-medium text-text-secondary transition-[background-color,color,transform] duration-200 hover:bg-bg-card-hover hover:text-text-primary active:scale-[.97]" onClick={() => choose(consentError || consent === "granted" ? "denied" : "granted")}><ChartLineIcon size={15} aria-hidden />{consentError ? "Retry preference update" : consent === "granted" ? "Disable analytics" : "Allow analytics"}</button>
    {consentError && <p role="alert" className="px-3.5 pb-2.5 pt-1 leading-relaxed text-text-primary">{consentError}</p>}
  </div>;
  return <aside aria-label="Analytics preferences" className="fixed bottom-4 left-4 right-4 z-50 max-w-[34rem] rounded-2xl border border-border bg-bg-elevated p-5 shadow-pop sm:p-6">
    <p className="text-[15px] font-semibold leading-snug tracking-[-.01em] text-text-primary">Allow optional Google Analytics and DataFast measurement?</p>
    <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">Your choice does not affect website access. <a href="/privacy" className="link-underline">Privacy details</a></p>
    <div className="mt-5 flex flex-wrap gap-2.5"><button type="button" className="button-secondary" onClick={() => choose("denied")}>Decline</button><button type="button" className="button-ink" onClick={() => choose("granted")}>Allow analytics</button></div>
  </aside>;
}

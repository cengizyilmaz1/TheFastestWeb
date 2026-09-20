import type { DataFastWeb } from "datafast";
import { ANALYTICS_CONSENT_COOKIE, ANALYTICS_MODE_HEADER, ANALYTICS_VISITOR_HEADER, isAnalyticsPage, isAnalyticsVisitorId, readAnalyticsConsent } from "./consent";

let clientPromise: Promise<DataFastWeb> | undefined;
let clientDay: string | undefined;
const OPT_OUT_KEY = "tfw_analytics_opt_out";
const ATTRIBUTION_KEY = "tfw_cookieless_attribution";
const SESSION_DAY_KEY = "tfw_cookieless_day";
const utcDay = () => new Date().toISOString().slice(0, 10);

export function browserAnalyticsAllowed(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  if (readAnalyticsConsent(document.cookie, {
    gpc: Boolean((navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl), dnt: navigator.doNotTrack,
  }) === "denied") return false;
  try {
    return localStorage.getItem(OPT_OUT_KEY) !== "1" && localStorage.getItem("datafast_ignore") !== "true"
      && localStorage.getItem("datafast_ignore_tracking") !== "true" && localStorage.getItem("tfw-pending-analytics-revocation") !== "1";
  } catch { return false; }
}

/** Remove legacy analytics state without touching session/security cookies.
 * A saved denial is a preference, never converted to an implicit grant. */
export function prepareCookielessAnalytics(domain: string): void {
  const denied = !browserAnalyticsAllowed();
  try {
    if (denied) localStorage.setItem(OPT_OUT_KEY, "1");
    if (sessionStorage.getItem("tfw_cookieless_migrated") !== "1" || denied) {
      clearDataFastStorage(localStorage);
      sessionStorage.setItem("tfw_cookieless_migrated", "1");
    }
    if (sessionStorage.getItem(SESSION_DAY_KEY) !== utcDay() || denied) {
      clearDataFastStorage(sessionStorage);
      sessionStorage.removeItem(ATTRIBUTION_KEY);
      sessionStorage.setItem(SESSION_DAY_KEY, utcDay());
    }
  } catch { /* Blocked storage disables measurement. */ }
  const domains = new Set(["", location.hostname, `.${location.hostname}`, domain, `.${domain}`]);
  for (const part of document.cookie.split(";")) {
    const name = part.trim().split("=")[0];
    // Keep a legacy denial cookie as a fallback if preference storage is blocked.
    if (/^(_ga(?:_|$)|_gid$|_gat(?:_|$)|datafast_)/.test(name)
      || name === ANALYTICS_CONSENT_COOKIE && readAnalyticsConsent(document.cookie) !== "denied") {
      for (const cookieDomain of domains) document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax${cookieDomain ? `; Domain=${cookieDomain}` : ""}`;
    }
  }
}

export function rememberCookielessVisitor(visitorId: string): void {
  try {
    if (!browserAnalyticsAllowed() || !isAnalyticsVisitorId(visitorId)) { sessionStorage.removeItem(ATTRIBUTION_KEY); return; }
    sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify({ visitorId, origin: location.origin, day: utcDay() }));
  } catch { /* Attribution is optional. */ }
}

/** The checkout receives no URL, referrer, identity or persistent cookie ID. */
export function checkoutAnalyticsHeaders(): Record<string, string> {
  if (!browserAnalyticsAllowed() || !isAnalyticsPage(location.pathname, location.search) || location.hash || !isAnalyticsReferrer(document.referrer)) return {};
  try {
    const value = JSON.parse(sessionStorage.getItem(ATTRIBUTION_KEY) ?? "null");
    if (value?.origin === location.origin && value.day === utcDay() && isAnalyticsVisitorId(value.visitorId)) {
      return { [ANALYTICS_MODE_HEADER]: "cookieless", [ANALYTICS_VISITOR_HEADER]: value.visitorId };
    }
  } catch { /* Invalid, missing or blocked storage disables attribution. */ }
  return {};
}

/** Leave the measured document before a private path/query becomes active.
 * No third-party route listener may carry into an account/security document. */
export function guardAnalyticsNavigation(): () => void {
  const push = history.pushState, replace = history.replaceState;
  const restricted = (target: URL) => target.origin === location.origin
    && (!isAnalyticsPage(target.pathname, target.search) || Boolean(target.hash));
  const navigate = (original: History["pushState"]) => (data: unknown, unused: string, url?: string | URL | null) => {
    const target = url ? new URL(url, location.href) : null;
    if (target && target.href !== location.href && restricted(target)) { location.assign(target.href); return; }
    original.call(history, data, unused, url);
  };
  const guardedPush = navigate(push), guardedReplace = navigate(replace);
  history.pushState = guardedPush; history.replaceState = guardedReplace;
  const click = (event: MouseEvent) => {
    const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!(anchor instanceof HTMLAnchorElement) || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0 || anchor.target === "_blank") return;
    if (restricted(new URL(anchor.href))) { event.preventDefault(); event.stopImmediatePropagation(); location.assign(anchor.href); }
  };
  const back = () => { if (restricted(new URL(location.href))) location.reload(); };
  document.addEventListener("click", click, true); window.addEventListener("popstate", back, true);
  return () => {
    if (history.pushState === guardedPush) history.pushState = push;
    if (history.replaceState === guardedReplace) history.replaceState = replace;
    document.removeEventListener("click", click, true); window.removeEventListener("popstate", back, true);
  };
}

/** The SDK reads document.referrer itself. Never initialize on a sensitive referrer. */
export function isAnalyticsReferrer(referrer: string): boolean {
  if (!referrer) return true;
  try {
    const url = new URL(referrer);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.hash
      && isAnalyticsPage(url.pathname, url.search)
      && !/@|%40/i.test(url.pathname);
  } catch { return false; }
}

/** A single cookieless client per public document; no automatic URL, identity or payment capture. */
export function loadDataFastClient(websiteId: string, domain: string): Promise<DataFastWeb> {
  const day = utcDay();
  if (clientPromise && clientDay !== day) {
    // The native cookieless SDK does not expire its in-memory tab session.
    // Reset both memory and storage before a new day's public pageview.
    clientPromise = clientPromise.then(async (client) => { await client.reset(); return client; });
  }
  clientDay = day;
  return clientPromise ??= import("datafast").then(({ initDataFast }) => initDataFast({
    websiteId, domain, autoCapturePageviews: false, allowLocalhost: false, allowIframe: false,
    debug: false, cookieless: true, onCookielessVisitorId: rememberCookielessVisitor,
  })).catch((error: unknown) => { clientPromise = undefined; throw error; });
}

/** Revoke the document's client even when its initializing route has changed. */
export async function stopDataFastClient(): Promise<boolean> {
  const started = Boolean(clientPromise);
  try { await (await clientPromise)?.optOut(); } catch { /* A document reload still unloads the SDK. */ }
  return started;
}

/** SDK queues are persisted separately from cookies. Revocation must remove both. */
export function clearDataFastStorage(storage: Pick<Storage, "length" | "key" | "removeItem">): void {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
  for (const key of keys) if (key?.startsWith("datafast_")) storage.removeItem(key);
}

export const ANALYTICS_CONSENT_COOKIE = "tfw_analytics_v1";
export type AnalyticsConsent = "granted" | "denied" | "unset";
export type PublicAnalyticsConfig = { enabled: boolean; siteOrigin?: string; datafastWebsiteId?: string; datafastDomain?: string };
export type CheckoutAnalytics = { consent: boolean; mode?: "cookieless"; eligible?: boolean; visitorId?: string };
export const ANALYTICS_VISITOR_HEADER = "x-tfw-datafast-visitor";
export const ANALYTICS_MODE_HEADER = "x-tfw-analytics-mode";
export const isAnalyticsVisitorId = (value: unknown): value is string => typeof value === "string"
  && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);

/** A production resource can also serve a preview hostname. Never measure it. */
export function isAnalyticsOrigin(origin: string, siteOrigin: string | undefined): boolean {
  return Boolean(siteOrigin) && origin === siteOrigin;
}

export function cookieValue(cookies: string, name: string): string | undefined {
  const part = cookies.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  try { return part ? decodeURIComponent(part.slice(name.length + 1)) : undefined; } catch { return undefined; }
}
export function readAnalyticsConsent(cookies: string, signals: { gpc?: boolean; dnt?: string | null } = {}): AnalyticsConsent {
  if (signals.gpc || signals.dnt === "1") return "denied";
  const value = cookieValue(cookies, ANALYTICS_CONSENT_COOKIE);
  return value === "granted" || value === "denied" ? value : "unset";
}
/** Restricted routes and query strings can carry signed capabilities or PII. */
export function isAnalyticsPage(pathname: string, search: string): boolean {
  try {
    const decoded = decodeURIComponent(pathname).replace(/\\/g, "/").replace(/\/{2,}/g, "/");
    if (search || /[%?#@\u0000-\u001f]/.test(decoded)) return false;
    const normalized = new URL(decoded, "https://analytics.invalid").pathname;
    return !/^\/(api|admin|dashboard|profile|unsubscribe|auth|login|sign-in)(\/|$)/i.test(normalized);
  } catch { return false; }
}
/** The same-origin authenticated checkout endpoint accepts the current tab's
 * cookieless server ID. A previous cookie opt-in never authorizes this mode. */
export function checkoutAnalyticsConsent(request: Request): CheckoutAnalytics {
  const cookies = request.headers.get("cookie") ?? "";
  const denied = readAnalyticsConsent(cookies, { gpc: request.headers.get("sec-gpc") === "1", dnt: request.headers.get("dnt") }) === "denied";
  const visitorId = request.headers.get(ANALYTICS_VISITOR_HEADER);
  return !denied && request.headers.get(ANALYTICS_MODE_HEADER) === "cookieless" && isAnalyticsVisitorId(visitorId)
    ? { consent: false, mode: "cookieless", eligible: true, visitorId } : { consent: false };
}

/** Existing explicitly consented order snapshots remain readable. */
export function isPaymentAttributionEligible(snapshot: Record<string, unknown>): boolean {
  return isAnalyticsVisitorId(snapshot.analyticsVisitorId) && (snapshot.analyticsConsent === true
    || snapshot.analyticsMode === "cookieless" && snapshot.analyticsEligible === true);
}

export const ANALYTICS_CONSENT_COOKIE = "tfw_analytics_v1";
export type AnalyticsConsent = "granted" | "denied" | "unset";
export type PublicAnalyticsConfig = { enabled: boolean; gaId?: string; datafastWebsiteId?: string; datafastDomain?: string };

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
  return !search && !/^\/(api|admin|dashboard|unsubscribe|auth|login|sign-in)(\/|$)/.test(pathname);
}
export function checkoutAnalyticsConsent(request: Request): { consent: boolean; visitorId?: string } {
  const cookies = request.headers.get("cookie") ?? "";
  const consent = readAnalyticsConsent(cookies, { gpc: request.headers.get("sec-gpc") === "1", dnt: request.headers.get("dnt") }) === "granted";
  const visitorId = cookieValue(cookies, "datafast_visitor_id");
  return { consent, ...(consent && visitorId && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(visitorId) ? { visitorId } : {}) };
}

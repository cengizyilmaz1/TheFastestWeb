import { isIP } from "node:net";
import { trackAICrawlerRequest, type WaitUntilContext } from "@datafast/ai-crawl";
import { getEnv } from "@/config/env";
import { isAnalyticsOrigin, isAnalyticsPage } from "./consent";

/** Next can use an internal request URL after TLS termination; Host is the routed
 * authority. Forwarded host headers never make a preview request canonical. */
export function isCanonicalCrawlerRequest(request: Request, siteOrigin: string): boolean {
  try {
    const canonical = new URL(siteOrigin);
    const host = request.headers.get("host");
    if (host === null) return isAnalyticsOrigin(new URL(request.url).origin, canonical.origin);
    if (!host || /[/\\?#@,\s]/.test(host)) return false;
    return isAnalyticsOrigin(new URL(`${canonical.protocol}//${host}`).origin, canonical.origin);
  } catch { return false; }
}

/** Only an explicitly trusted, overwritten proxy header may supply crawler IPs. */
export function trustedCrawlerIp(headers: Headers, header: string): string | null {
  if (header === "none") return null;
  const value = headers.get(header)?.trim();
  // A list is ambiguous. The proxy must overwrite this header with one client IP.
  if (!value || value.includes(",") || !isIP(value)) return null;
  return value;
}

/** Best effort server-only crawler measurement; never changes the website response. */
export function recordCrawlerRequest(request: Request, context: WaitUntilContext): void {
  const env = getEnv();
  if (!env.DATAFAST_BOT_TRACKING_ENABLED || env.DEPLOYMENT_MODE === "demo" || !env.DATAFAST_WEBSITE_ID) return;
  if (!isCanonicalCrawlerRequest(request, env.SITE_URL)) return;
  const url = new URL(request.url);
  if (!isAnalyticsPage(url.pathname, url.search) || /@|%40/i.test(url.pathname)
    || request.headers.get("sec-gpc") === "1" || request.headers.get("dnt") === "1"
    || request.headers.has("rsc") || request.headers.has("next-router-prefetch")
    || request.headers.get("purpose") === "prefetch") return;
  const userAgent = request.headers.get("user-agent") ?? "";
  if (userAgent.length > 1024) return;
  const publicUrl = new URL(env.SITE_URL);
  publicUrl.pathname = url.pathname;
  const headers = new Headers({ "user-agent": userAgent });
  const destination = request.headers.get("sec-fetch-dest");
  if (destination) headers.set("sec-fetch-dest", destination);
  const ip = trustedCrawlerIp(request.headers, env.DATAFAST_BOT_TRUSTED_IP_HEADER);
  // The SDK otherwise guesses from multiple untrusted proxy headers. Pass only
  // the explicitly selected IP, with no cookies, auth, referrer or query string.
  if (ip) headers.set("x-real-ip", ip);
  const sanitizedRequest = new Request(publicUrl, { method: request.method, headers });
  try {
    trackAICrawlerRequest(sanitizedRequest, context, {
      websiteId: env.DATAFAST_WEBSITE_ID, domain: env.DATAFAST_DOMAIN, publicOrigin: env.SITE_URL,
      authToken: env.DATAFAST_BOT_TOKEN, timeoutMs: 1000, maxUrlLength: 2048, debug: false,
    });
  } catch { /* Analytics must never change the response or log the original request. */ }
}

import { NextRequest, NextResponse, type NextFetchEvent } from "next/server";
import { CORRELATION_HEADER, correlationIdFrom } from "@/lib/http/correlation";
import { recordCrawlerRequest } from "@/infrastructure/analytics/datafast-crawlers";
import { getToken } from "next-auth/jwt";
import { getEnv } from "@/config/env";
import { resolveFounderUsername } from "@/modules/founders/usernames";
import { getFounderPath } from "@/modules/founders/paths";
import { resolveManagedRedirect } from "@/modules/redirects/resolve";
import { logger } from "@/infrastructure/logging/logger";
import { recordRedirectInBackground } from "@/modules/redirects/statistics";

/** Resource handlers perform authorization; the proxy is not a security boundary. */
export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  if (["GET", "HEAD"].includes(request.method)) {
    try {
      const founder = /^\/(founder|founders)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(request.nextUrl.pathname);
      if (founder) {
        const token = await getToken({ req: request, secret: getEnv().AUTH_SECRET, secureCookie: getEnv().SITE_URL.startsWith("https:") });
        const visible = await resolveFounderUsername(founder[2], typeof token?.dbUserId === "string" ? token.dbUserId : undefined);
        if (visible && (founder[1] === "founders" || visible.slug !== founder[2])) {
          if (visible.visibility === "public") recordRedirectInBackground(request, { kind: "founder", founderId: visible.id, sourcePath: request.nextUrl.pathname }, event);
          return NextResponse.redirect(new URL(getFounderPath(visible.slug), getEnv().SITE_URL),
            { status: 301, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
        }
      } else {
        const redirect = await resolveManagedRedirect(request.nextUrl.pathname);
        if (redirect) {
          recordRedirectInBackground(request, { kind: "managed", ruleId: redirect.id }, event);
          return NextResponse.redirect(new URL(redirect.path, getEnv().SITE_URL), { status: redirect.status,
            headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
        }
      }
    } catch { logger.warn({ event: "redirect.lookup_failed", code: "DATABASE_UNAVAILABLE" }); }
  }
  recordCrawlerRequest(request, event);
  const correlationId = correlationIdFrom(request.headers);
  const headers = new Headers(request.headers);
  headers.set(CORRELATION_HEADER, correlationId);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set(CORRELATION_HEADER, correlationId);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  // These directives do not require unsafe exceptions for Next's streamed scripts.
  // Embedded SVG/image routes keep their stricter resource-specific CSP.
  response.headers.set("Content-Security-Policy", "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'");
  if (process.env.NODE_ENV === "production" && process.env.SITE_URL?.startsWith("https://")) {
    response.headers.set("Strict-Transport-Security", "max-age=15552000");
  }
  // Defense in depth for the administrator panel and its API. Authorization
  // stays in the resource handlers; these only stop caching, indexing, referrer
  // leakage and cross-origin embedding of anything those handlers return.
  if (/^\/(api\/)?admin(\/|$)/i.test(request.nextUrl.pathname)) {
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
    response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  }
  if (process.env.DEPLOYMENT_MODE === "demo") {
    const publicHomepage = request.nextUrl.pathname === "/" && !request.nextUrl.search;
    response.headers.set("X-Robots-Tag", publicHomepage ? "noindex, follow, noarchive" : "noindex, nofollow, noarchive");
  }
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"] };

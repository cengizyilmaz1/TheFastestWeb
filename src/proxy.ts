import { NextRequest, NextResponse, type NextFetchEvent } from "next/server";
import { CORRELATION_HEADER, correlationIdFrom } from "@/lib/http/correlation";
import { recordCrawlerRequest } from "@/infrastructure/analytics/datafast-crawlers";

/** Resource handlers perform authorization; the proxy is not a security boundary. */
export default function proxy(request: NextRequest, event: NextFetchEvent) {
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
  if (process.env.DEPLOYMENT_MODE === "demo") {
    const publicHomepage = request.nextUrl.pathname === "/" && !request.nextUrl.search;
    response.headers.set("X-Robots-Tag", publicHomepage ? "noindex, follow, noarchive" : "noindex, nofollow, noarchive");
  }
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"] };

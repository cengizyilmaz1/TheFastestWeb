import { NextRequest, NextResponse } from "next/server";
import { CORRELATION_HEADER, correlationIdFrom } from "@/lib/http/correlation";

/** Resource handlers perform authorization; the proxy is not a security boundary. */
export default function proxy(request: NextRequest) {
  const correlationId = correlationIdFrom(request.headers);
  const headers = new Headers(request.headers);
  headers.set(CORRELATION_HEADER, correlationId);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set(CORRELATION_HEADER, correlationId);
  if (process.env.DEPLOYMENT_MODE === "demo") response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"] };

import { createHmac } from "node:crypto";

/** A negative filter, never proof that an accepted request came from a human. */
export function skipClickObservation(headers: Headers): boolean {
  const agent = (headers.get("user-agent") ?? "").slice(0, 1024);
  return /bot|crawler|spider|headless|lighthouse|preview|slurp|bingpreview|facebookexternalhit|curl\/|wget\/|python-requests/i.test(agent)
    || /prefetch|prerender/i.test(`${headers.get("purpose") ?? ""} ${headers.get("sec-purpose") ?? ""}`);
}

/** Never retain the address, user agent, referrer or an account identity. */
export function clickPseudonym(headers: Headers, secret: string, now = new Date()): string {
  const address = (headers.get("x-forwarded-for")?.split(",")[0] || "unknown").trim().slice(0, 64);
  return createHmac("sha256", secret).update(`outbound\0${now.toISOString().slice(0, 10)}\0${address}`).digest("hex");
}

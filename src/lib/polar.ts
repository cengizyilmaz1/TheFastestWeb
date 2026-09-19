export async function verifyPolarWebhook(
  body: string,
  signature: string
): Promise<boolean> {
  const secret = process.env.POLAR_WEBHOOK_SECRET;
  if (!secret) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return computed === signature;
}

export function getPolarCheckoutUrl(siteId: string): string {
  const polarApiKey = process.env.POLAR_API_KEY;
  if (!polarApiKey) return "#";
  // In production, create a checkout session via Polar API
  return `https://polar.sh/checkout?product=speeddir-pro&metadata[site_id]=${siteId}`;
}

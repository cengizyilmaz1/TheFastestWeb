export type OutboundPlacement = "sidebar" | "product";

/** Attribute this visit to our referring page without changing the destination. */
export function outboundHref(value: string, placement: OutboundPlacement): string | undefined {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return undefined;
    // These three fields describe the current referral. Keep all other query
    // parameters (including affiliate IDs) and the fragment unchanged.
    url.searchParams.set("utm_source", "thefastestweb.site");
    url.searchParams.set("utm_medium", "referral");
    url.searchParams.set("utm_campaign", placement === "sidebar" ? "sidebar_ad" : "product_listing");
    return url.toString();
  } catch { return undefined; }
}

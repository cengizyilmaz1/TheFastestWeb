import { inArray, or } from "drizzle-orm";
import { sites } from "@/db/schema";
import { normalizePublicUrl } from "@/lib/security/public-url";
import type { SiteMetadata } from "./metadata";

export type WebsiteIdentity = {
  sourceUrl: string;
  finalUrl: string;
  canonicalUrl: string | null;
  normalizedUrl: string;
  redirectUrl: string | null;
  keys: string[];
};

/** Metadata must come from the server's pinned, SSRF-safe HTTP fetch. A canonical
 * hint cannot join different origins; only an observed HTTP redirect can do so.
 * In particular, www, schemes and tenant subdomains are never guessed aliases. */
export function websiteIdentity(source: string, metadata?: Pick<SiteMetadata, "finalUrl" | "canonicalUrl">): WebsiteIdentity {
  const sourceUrl = normalizePublicUrl(source);
  const finalUrl = metadata ? normalizePublicUrl(metadata.finalUrl) : sourceUrl;
  let canonicalUrl: string | null = null;
  if (metadata?.canonicalUrl) {
    const hint = normalizePublicUrl(metadata.canonicalUrl);
    if (new URL(hint).origin === new URL(finalUrl).origin) canonicalUrl = hint;
  }
  return {
    sourceUrl, finalUrl, canonicalUrl,
    normalizedUrl: canonicalUrl ?? finalUrl,
    redirectUrl: finalUrl === sourceUrl ? null : finalUrl,
    keys: [...new Set([sourceUrl, finalUrl, ...(canonicalUrl ? [canonicalUrl] : [])])].sort(),
  };
}

/** url retains the submitted source and its performance-proof binding;
 * normalizedUrl indexes the observed identity; redirectUrl retains the final hop.
 * All three fields participate so an alias never loses the source identity. */
export function matchingWebsiteIdentity(keys: string[]) {
  return or(inArray(sites.normalizedUrl, keys), inArray(sites.url, keys), inArray(sites.redirectUrl, keys));
}

/** Imported raw URLs are immutable and can contain tracking/fragment/case
 * differences. Keep their original normalized source key searchable; their
 * strongest observed alias fits the existing redirect field. New listings have
 * a normalized source in url and therefore retain all three identities. */
export function identityFieldsForSource(source: string, identity: WebsiteIdentity) {
  if (source !== identity.sourceUrl) return {
    normalizedUrl: identity.sourceUrl,
    redirectUrl: identity.normalizedUrl === identity.sourceUrl ? null : identity.normalizedUrl,
  };
  return { normalizedUrl: identity.normalizedUrl, redirectUrl: identity.redirectUrl };
}

import { parse, type DefaultTreeAdapterMap } from "parse5";
import { siteConfig } from "@/config/site";
import { safeFetchText } from "@/lib/security/safe-fetch";
import { UnsafeUrlError, parsePublicHttpUrl } from "@/lib/security/public-url";
import { renderPublicHtml } from "./render-html";

export type BadgeStatus = "verified" | "missing" | "temporarily_unreachable" | "invalid_url";
export type BadgeVerification = { verified: boolean; status: BadgeStatus; url?: string };

function isElement(node: DefaultTreeAdapterMap["node"]): node is DefaultTreeAdapterMap["element"] {
  return "tagName" in node;
}

/** Parse real img elements; comments, script strings and suffix lookalikes cannot pass. */
export function hasBadgeImage(html: string, pageUrl: string, slug: string, applicationUrl: string): boolean {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 200) return false;
  const document = parse(html);
  const expected = new URL(`/api/badge/${slug}`, applicationUrl);
  let base = pageUrl;
  let baseFound = false;
  const images: DefaultTreeAdapterMap["element"][] = [];
  // Iterative traversal avoids call-stack exhaustion on attacker-controlled HTML.
  const nodes: DefaultTreeAdapterMap["node"][] = [document];
  while (nodes.length) {
    const node = nodes.pop()!;
    if (isElement(node)) {
      if (node.tagName === "base" && !baseFound) {
        const href = node.attrs.find((attribute) => attribute.name === "href")?.value;
        if (href) {
          baseFound = true;
          try { base = new URL(href, pageUrl).href; } catch { /* Ignore an invalid document base. */ }
        }
      }
      if (node.tagName === "img") images.push(node);
    }
    if ("childNodes" in node) {
      for (let index = node.childNodes.length - 1; index >= 0; index--) nodes.push(node.childNodes[index]);
    }
  }
  return images.some((element) => {
    const src = element.attrs.find((attribute) => attribute.name === "src")?.value;
    if (!src) return false;
    try {
      const badge = new URL(src, base);
      return !badge.username && !badge.password &&
        badge.origin === expected.origin && badge.pathname === expected.pathname &&
        !badge.searchParams.has("preview");
    } catch {
      return false;
    }
  });
}

export function createBadgeVerifier(dependencies: {
  fetchHtml?: typeof safeFetchText;
  renderHtml?: typeof renderPublicHtml;
  applicationUrl?: string;
} = {}) {
  return async (input: string, slug: string): Promise<BadgeVerification> => {
    let url: string;
    try {
      url = parsePublicHttpUrl(input).href;
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 200) throw new UnsafeUrlError();
    } catch {
      return { verified: false, status: "invalid_url" };
    }
    const applicationUrl = dependencies.applicationUrl ?? siteConfig.url;
    try {
      const page = await (dependencies.fetchHtml ?? safeFetchText)(url);
      url = page.url;
      if (hasBadgeImage(page.html, page.url, slug, applicationUrl)) {
        return { verified: true, status: "verified", url };
      }
    } catch (error) {
      return { verified: false, status: error instanceof UnsafeUrlError ? "invalid_url" : "temporarily_unreachable" };
    }
    try {
      const page = await (dependencies.renderHtml ?? renderPublicHtml)(url);
      const verified = hasBadgeImage(page.html, page.url, slug, applicationUrl);
      return { verified, status: verified ? "verified" : "missing", url: page.url };
    } catch {
      // A network/browser failure must NEVER count as a confirmed missing badge.
      // This verifier does not delete or modify sites/history.
      return { verified: false, status: "temporarily_unreachable", url };
    }
  };
}

export const getVerifiedBadge = createBadgeVerifier();

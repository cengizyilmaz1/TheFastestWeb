import { parse, type DefaultTreeAdapterMap } from "parse5";
import { safeFetchText } from "@/lib/security/safe-fetch";
import { normalizePublicUrl } from "@/lib/security/public-url";

export type TechnologyEvidence = { slug: string; evidence: string; confidence: number };
export type SiteMetadata = {
  title: string; description: string; domain: string; finalUrl: string; canonicalUrl: string | null;
  faviconUrl: string | null; ogImageUrl: string | null; technologies: TechnologyEvidence[]; suggestedCategory: string | null;
};
const clean = (value: string, max: number) => value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
function assetUrl(value: string | undefined, base: string): string | null {
  if (!value || value.length > 4096) return null;
  try { return normalizePublicUrl(new URL(value, base).href); } catch { return null; }
}

/** Evidence comes only from actual elements/response headers, never comments,
 * marketing copy or guessed hosting geography. Rule confidence is heuristic. */
export function parseSiteMetadata(html: string, url: string, headers = new Headers()): SiteMetadata {
  const nodes: DefaultTreeAdapterMap["node"][] = [parse(html)];
  let pageTitle = "", siteName = "", ogTitle = "", description = "", ogDescription = "";
  let favicon: string | null = null, appleIcon: string | null = null, ogImage: string | null = null, canonical: string | null = null;
  const detected = new Map<string, TechnologyEvidence>();
  const detect = (slug: string, evidence: string, confidence = 0.9) => {
    if (!detected.has(slug)) detected.set(slug, { slug, evidence, confidence });
  };
  while (nodes.length) {
    const node = nodes.pop()!;
    if ("tagName" in node) {
      const attribute = (name: string) => node.attrs.find((item) => item.name === name)?.value;
      if (node.tagName === "title" && !pageTitle) pageTitle = node.childNodes.filter((child) => child.nodeName === "#text").map((child) => "value" in child ? child.value : "").join("");
      if (node.tagName === "meta") {
        const name = (attribute("property") ?? attribute("name"))?.toLowerCase(), content = attribute("content") ?? "";
        if (name === "description" && !description) description = content;
        if (name === "og:description" && !ogDescription) ogDescription = content;
        if (name === "og:site_name" && !siteName) siteName = content;
        if (name === "og:title" && !ogTitle) ogTitle = content;
        if (name === "og:image" && !ogImage) ogImage = assetUrl(content, url);
        if (name === "generator") {
          for (const [pattern, slug] of [[/^wordpress\b/i, "wordpress"], [/^webflow\b/i, "webflow"], [/^shopify\b/i, "shopify"], [/^nuxt\b/i, "nuxt"]] as const) {
            if (pattern.test(content)) detect(slug, `The page declares ${slug} in its generator metadata.`, 0.95);
          }
        }
      }
      if (node.tagName === "link") {
        const rel = (attribute("rel") ?? "").toLowerCase().split(/\s+/), href = assetUrl(attribute("href"), url);
        if (rel.includes("canonical") && !canonical) canonical = href;
        if (rel.includes("icon") && !favicon) favicon = href;
        if (rel.includes("apple-touch-icon") && !appleIcon) appleIcon = href;
      }
      if (node.tagName === "script") {
        const source = assetUrl(attribute("src"), url);
        if (source) {
          const script = new URL(source);
          if (script.pathname.startsWith("/_next/")) detect("nextjs", "A script is served from the Next.js /_next/ asset path.");
          if (script.pathname.startsWith("/_nuxt/")) detect("nuxt", "A script is served from the Nuxt /_nuxt/ asset path.");
          if (script.pathname.includes("/wp-includes/") || script.pathname.includes("/wp-content/")) detect("wordpress", "A script is served from a WordPress asset path.");
          if (script.hostname === "cdn.shopify.com") detect("shopify", "The page loads the Shopify CDN.");
          if (script.hostname === "cdn.tailwindcss.com") detect("tailwind", "The page loads the Tailwind browser CDN.");
        }
        if (attribute("id") === "__NEXT_DATA__" && attribute("type") === "application/json") detect("nextjs", "The page includes a Next.js data element.");
      }
      if (node.tagName === "html" && attribute("data-wf-site")) detect("webflow", "The document has a Webflow site attribute.");
      if (attribute("data-reactroot") !== undefined) detect("react", "The document includes a React root attribute.");
      if (attribute("data-v-app") !== undefined) detect("vue", "The document includes a Vue application attribute.");
    }
    if ("childNodes" in node) nodes.push(...[...node.childNodes].reverse());
  }
  if (headers.has("cf-ray") && /cloudflare/i.test(headers.get("server") ?? "")) detect("cloudflare", "The response includes Cloudflare edge headers.", 0.95);
  if (headers.has("x-vercel-id")) detect("vercel", "The response includes a Vercel deployment header.", 0.95);
  if (/^next\.js$/i.test(headers.get("x-powered-by") ?? "")) detect("nextjs", "The response declares Next.js.", 0.95);
  const title = clean(siteName || ogTitle || pageTitle, 60), summary = clean(description || ogDescription, 500);
  const text = `${title} ${summary}`.toLowerCase();
  const suggestedCategory = detected.has("shopify") || /\b(shop|store|ecommerce)\b/.test(text) ? "ecommerce" :
    /\b(directory|directories)\b/.test(text) ? "directory" : /\b(agency|agencies)\b/.test(text) ? "agency" :
      /\b(portfolio)\b/.test(text) ? "portfolio" : /\b(blog|weblog)\b/.test(text) ? "blog" :
        /\b(saas|software as a service)\b/.test(text) ? "saas" : /\b(tool|tools)\b/.test(text) ? "tool" : null;
  return { title, description: summary, domain: new URL(url).hostname, finalUrl: url, canonicalUrl: canonical,
    faviconUrl: favicon ?? appleIcon, ogImageUrl: ogImage, technologies: [...detected.values()], suggestedCategory };
}
export async function loadSiteMetadata(url: string) {
  const result = await safeFetchText(url, { maxBytes: 2 * 1024 * 1024, timeoutMs: 12_000 });
  return parseSiteMetadata(result.html, result.url, result.headers);
}

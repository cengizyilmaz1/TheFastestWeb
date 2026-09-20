import { siteConfig } from "@/config/site";
import { siteUrl } from "@/lib/seo/metadata";

export type MarkdownDocument = {
  body: string;
  canonicalPath: string;
  /** Live prices and listings must not remain in a shared response cache. */
  live?: boolean;
};

export function markdownResponse(document: MarkdownDocument, status = 200) {
  return new Response(document.body.trimEnd() + "\n", {
    status,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Language": "en",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": siteConfig.isDemo ? "noindex, nofollow" : "noindex, follow",
      "Cache-Control": status !== 200 || document.live ? "no-store" : "public, max-age=300",
      Link: `<${siteUrl(document.canonicalPath)}>; rel="canonical", <${siteUrl("/llms.txt")}>; rel="describedby"; type="text/markdown"`,
      ...(status === 503 ? { "Retry-After": "60" } : {}),
    },
  });
}

/** Explicit paths keep HTML and Markdown caches separate; query exports are unsupported. */
export function rejectMarkdownQuery(request?: Request) {
  if (!request || !new URL(request.url).search) return null;
  return markdownResponse({ canonicalPath: "/markdown", body: "# Unsupported query\n\nUse a published Markdown URL without query parameters." }, 400);
}

export function markdownUnavailable() {
  return markdownResponse({ canonicalPath: "/markdown", body: "# Content temporarily unavailable\n\nPlease try again shortly. The public HTML pages remain the canonical sources." }, 503);
}

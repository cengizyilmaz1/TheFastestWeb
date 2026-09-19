export const BLOG_CATEGORIES = {
  metrics: "Metrics",
  comparisons: "Comparisons",
  frameworks: "Frameworks",
  guides: "Guides",
} as const;
export type BlogCategory = keyof typeof BLOG_CATEGORIES;

export function getTopicGroup(slug: string): BlogCategory {
  if (slug === "what-are-core-web-vitals" || (slug.startsWith("what-is-") && !slug.includes("pagespeed"))) return "metrics";
  if (slug.includes("-vs-")) return "comparisons";
  if (slug.endsWith("-pagespeed-optimization-guide") || slug.endsWith("-performance-optimization-guide")) return "frameworks";
  return "guides";
}

const TOPICS: [string, string][] = [
  ["astro", "Astro"], ["nextjs", "Next.js"], ["nuxt", "Nuxt"], ["wordpress", "WordPress"],
  ["webflow", "Webflow"], ["shopify", "Shopify"], ["woocommerce", "WooCommerce"], ["wix", "Wix"],
  ["squarespace", "Squarespace"], ["sveltekit", "SvelteKit"], ["django", "Django"], ["laravel", "Laravel"],
  ["lcp", "LCP"], ["fcp", "FCP"], ["cls", "CLS"], ["tbt", "TBT"], ["tti", "TTI"],
  ["core-web-vitals", "Core Web Vitals"], ["speed-index", "Speed Index"], ["seo", "SEO"], ["pagespeed", "PageSpeed"],
];

/** Existing posts have no tag metadata; infer only literal topics in their slugs. */
export function getPostTags(slug: string, supplied: unknown): string[] {
  if (Array.isArray(supplied)) return [...new Set(supplied.filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim()).filter((tag) => /^[\p{L}\p{N}][\p{L}\p{N} .+#-]{0,39}$/u.test(tag)))].slice(0, 8);
  return TOPICS.filter(([topic]) => (`-${slug}-`).includes(`-${topic}-`)).map(([, label]) => label);
}

/** Editorial assets stay local; frontmatter never selects an arbitrary fetch URL. */
export function validCoverPath(value: unknown): value is string {
  return typeof value === "string" && /^\/images\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:png|jpe?g|webp|avif)$/.test(value);
}

export type TableOfContentsEntry = { id: string; text: string; depth: 2 | 3 };
type HeadingNode = { type: string; tagName?: string; value?: string; children?: HeadingNode[]; properties?: Record<string, unknown> };

/** Read the compiled MDX tree, so code fences and inline markup cannot desync the TOC. */
export function headingIds(toc: TableOfContentsEntry[]) {
  return function rehypeHeadingIds() {
    return function transform(tree: HeadingNode) {
      const used = new Set<string>();
      const textOf = (node: HeadingNode): string => node.type === "text" ? node.value ?? "" : (node.children ?? []).map(textOf).join("");
      const walk = (node: HeadingNode) => {
        if (node.type === "element" && (node.tagName === "h2" || node.tagName === "h3")) {
          const text = textOf(node).replace(/\s+/g, " ").trim();
          const base = text.normalize("NFKD").toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "section";
          let id = `article-${base}`, suffix = 2;
          while (used.has(id)) id = `article-${base}-${suffix++}`;
          used.add(id);
          node.properties = { ...node.properties, id };
          toc.push({ id, text: text || "Section", depth: node.tagName === "h2" ? 2 : 3 });
        }
        for (const child of node.children ?? []) walk(child);
      };
      walk(tree);
    };
  };
}

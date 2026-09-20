# Search, answer engines and public discovery

The original public pages are retained. `SITE_URL` supplies the canonical origin for metadata, social cards, structured data, sitemaps and machine-readable references. Changing a hostname does not require editing page source. Static pages, six `/fastest/{category}` collections, three `/leaderboard/{tier}` collections, public website reports and published articles form the indexable surface. Private profiles, authentication, the payment administrator panel and preview utilities remain outside discovery.

## Metadata and identity

`src/lib/seo/metadata.ts` supplies a single title suffix, complete Open Graph/Twitter cards, absolute internal canonicals and explicit robots controls. Child pages do not lose social images through Next.js metadata replacement. Blog pagination has a canonical for each actual page; malformed or duplicate archive parameters are not indexable. Privacy email-preference URLs canonicalize to `/privacy` and use `noindex` plus `no-referrer` so preference tokens are not treated as public content.

The entity graph identifies TheFastestWeb, its publisher and the current operator **Cengiz YILMAZ**, linked to `https://cengizyilmaz.net`. It does not invent historical founding claims, social accounts, addresses, awards or ratings. Public contact comes from `SITE_EMAIL` (the provisional default must be confirmed before public launch). The previous nonfunctional SearchAction was removed because the restored homepage does not implement its advertised query search.

Public content has appropriate WebPage/AboutPage/CollectionPage, ItemList, BreadcrumbList and BlogPosting data. Schema uses actual listed websites and article metadata. Performance scores are not fabricated review ratings. Every JSON-LD script uses `safeJsonLd`, including stored website names and article titles. These fields help describe the visible content; they do not guarantee a special search appearance. [Google structured-data guidance](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data), [organization documentation](https://developers.google.com/search/docs/appearance/structured-data/organization).

## Article and measurement evidence

Explicit frontmatter authors are preserved. Unsigned legacy articles use TheFastestWeb as their editorial publisher, rather than attributing old work to the new operator. Publication dates remain unchanged. Optional `updated` frontmatter is used only for actual editorial changes and supplies the visible update date, article modified metadata and sitemap timestamp. Rendering a page never invents a new modification date. [Google article documentation](https://developers.google.com/search/docs/appearance/structured-data/article).

Website reports distinguish recorded mobile lab measurements from real-user Core Web Vitals. Metadata does not promise daily monitoring or instant results independent of provider configuration. A missing test is not described as a measured zero. Collection markup describes the actual entries shown; profile/account data is never added to the public search corpus.

## Crawling and sitemaps

`/sitemap.xml` remains a runtime index of `/sitemaps/{section}/{page}.xml` documents, capped at 5,000 URLs per document. Sections are `pages`, `sites` and `blog`. Public site queries exclude private, pending, removed and archived records. Database outages return 503 rather than an empty replacement sitemap. Article timestamps come from real content dates; website timestamps come from stored measurements or creation. Removed routes and account/profile identifiers are not included.

Robots advertises the sitemap for a public deployment. Demo mode blocks crawling, emits an empty sitemap index and adds `noindex` response/metadata controls. Do not submit the temporary demo domain to search engines. Canonical URLs and sitemap URLs should agree. [Google canonical guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls), [sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).

The hidden outbound badge/link block was removed from the home page. It added network requests without useful visible content. The separately retained legacy `/links` utility remains noindex and outside the sitemap.

## GEO and AEO

The useful foundation is crawlable, accurate content: direct answers, clear headings, visible authorship, dated measurements, meaningful internal links and structured data matching the page. The About page explains who operates the service, what a lab score describes and how paid placements differ from organic results. Public reports and articles provide the sources a reader can inspect.

`/llms.txt` and `/llms-full.txt` are concise public reference documents. They expose no extra database permissions and are not a ranking switch. Google's June 2026 documentation explicitly says these files do not positively or negatively affect visibility in Google Search. The FAQ rich-result feature was retired in May 2026; no FAQ search appearance is promised. Hidden pricing FAQ markup was removed because it did not match visible questions and answers. [Google documentation updates](https://developers.google.com/search/updates), [Google AI features guidance](https://developers.google.com/search/docs/appearance/ai-features).

Bing similarly describes crawlability, indexing, clear structure and evidence as the foundation for search and AI grounding; neither rankings nor citations are guaranteed. Citation visibility can be measured after ownership verification in Bing Webmaster Tools. [Bing Webmaster Guidelines](https://www.bing.com/webmasters/help/bing-webmaster-guidelines-30fba23a), [Bing AI Performance](https://www.bing.com/webmasters/help/ai-performance-9f8e7d6c).

## Validation and release steps

Local checks cover configured-origin canonicals, title/social metadata, demo and private noindex behavior, actual-date handling, truthful entity data, JSON-LD escaping and sitemap route scope. `scripts/verify-seo.mjs` performs read-only checks against a loopback runtime; the production runtime harness also runs it. Browser smoke retains accessibility, page-error and responsive-layout checks separately.

Before public launch:

1. Confirm the permanent domain and contact address; set `SITE_URL`, `AUTH_URL`, `SITE_EMAIL` and production deployment mode together. Update OAuth callbacks, payment returns, email links and public media origins consistently.
2. Configure `SEARCH_CONSOLE_VERIFICATION` and `BING_VERIFICATION`, then verify the domain in the respective accounts. No verification or search-engine submission has been performed by this local change.
3. Inspect representative home, category, tier, website and article URLs on the final public host. Check HTTP status, canonical, robots and rendered structured data using the search engines' inspection tools.
4. Submit the sitemap and observe actual indexing/citation data. If changing domains, implement redirects for genuine retained counterparts and complete the search engines' domain-move workflows.
5. Confirm the public host/CDN allows intended crawlers while authentication and private routes stay protected. Robots directives are not authorization.

IndexNow remains intentionally inactive. `INDEXNOW_KEY` is reserved and performs no submissions. Enabling it later requires a verified final host, ownership-key serving and a bounded submission flow that rechecks public eligibility and never sends private URLs. [Official IndexNow protocol](https://www.indexnow.org/documentation).

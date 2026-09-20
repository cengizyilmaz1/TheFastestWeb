# Public Markdown and LLM references

The public HTML pages remain the canonical sources. Markdown representations are intended for readers and tools that need the published text without navigation or client-side UI.

## Routes

- `/llms.txt`: a concise Markdown navigation guide with source links and measurement interpretation guidance.
- `/llms-full.txt`: shared public page copy, category descriptions, the journal index, and full published articles. The current corpus fits entirely. Future growth is bounded to 128 articles and 1 MiB; an explicit notice points to the article index if any whole articles cannot fit.
- `/markdown`: the public Markdown library.
- `/markdown/about`, `/markdown/pricing`, `/markdown/advertise`, `/markdown/privacy`, `/markdown/terms`: use the same content modules as their HTML pages.
- `/markdown/blog`: the published article index, including bylines and recorded dates.
- `/markdown/blog/{slug}`: complete repository article content, including fenced code examples, with its author and actual dates.
- `/markdown/categories`: all public category descriptions and comparison guidance.
- `/markdown/fastest/{category}`: the first page of published category results, with recorded scores and test dates. Further leaderboard pages remain available in HTML.

Query variants, arbitrary files, arbitrary URLs, account routes, site-management routes, payment records, and private website exports are unsupported. Unknown destinations return 404; query parameters return 400 before content access. Markdown routes only implement GET (Next.js also supplies HEAD and method handling).

## Discovery and response behavior

Eligible queryless HTML pages advertise `rel="alternate" type="text/markdown"` using the shared metadata helper. The footer links to the library and both references. Markdown responses send `Content-Type: text/markdown; charset=utf-8`, `X-Content-Type-Options: nosniff`, a canonical `Link` header, and a `describedby` link to `/llms.txt`.

Text variants use `X-Robots-Tag: noindex, follow` so search results can consolidate on HTML. Demo responses are `noindex, nofollow`; the deployment proxy may add `noarchive`. Markdown is not added to the sitemap; `/advertise` is included as an HTML page.

Explicit routes keep HTML and Markdown cache keys separate. Static public content can cache for five minutes. Live category results and all non-200 responses use `no-store`; there is no content negotiation that could cause an HTML response to reuse a Markdown cache entry. URLs come from configured `SITE_URL`, never request host headers. Category outages return a generic 503 instead of an empty ranking or database details.

## Content integrity

About and policy content comes from `src/content/about.ts` and `src/content/public-pages.ts`. Article text comes from the same repository `getPost` helper as the blog, without executing MDX or scraping a supplied URL. Original article bylines and actual publication/modification dates are preserved. Deploying a new design does not create a new article modification date. Full references carry measurement limitations and distinguish dated editorial content from current provider documentation.

Country/category descriptions and pricing remain public editorial content. Checkout availability, final taxes and billing amounts must still be checked through the existing payment flow; the references do not expose checkout or subscriber records.

## Search expectations

The format follows the [llms.txt proposal](https://llmstxt.org/) as a navigation and content-access aid. It does not grant crawl permission or override robots controls. Google states that existing SEO fundamentals apply to its AI features and that no special AI text file is required; indexing and inclusion remain unguaranteed. See [Google Search Central: AI features and your website](https://developers.google.com/search/docs/appearance/ai-features).

## Verification

Focused unit checks cover private-path rejection, query rejection before content access, canonical host integrity, HTML/source parity, preserved authors and dates, category field minimization, outage privacy, response caching, demo indexing controls, and full-reference size limits:

```sh
npx vitest run src/modules/seo/markdown.test.ts src/modules/seo/sitemaps.test.ts src/lib/seo/metadata.test.ts
```

For runtime verification, inspect `/llms.txt`, `/llms-full.txt`, `/markdown/about`, a known article and `/markdown/fastest/ai`; confirm `/markdown/admin` returns 404 and `/markdown/about?url=http://localhost` returns 400.

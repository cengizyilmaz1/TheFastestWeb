# Search and public discovery

`SITE_URL` is the canonical origin. Directory filters and empty taxonomy pages are
not indexable; category, technology and country pages use descriptive metadata.
Public reports separate device/method history. Account, dashboard, admin, claim and
unsubscribe routes are excluded. Old account profile URLs redirect only to an
explicitly public founder profile; other accounts remain private. JSON-LD is escaped
before rendering and never claims fabricated reviews, scores or founders.

`/sitemap.xml` is a runtime index of paginated `/sitemaps/{section}/{page}.xml`
documents (5,000 URLs per page). Sections include static pages, public sites,
opt-in founders, populated taxonomies, eligible closed competitions and repository
articles. Database outages return 503 instead of publishing an empty replacement.
Private, removed and archived content is excluded at read time, including old
competition entries. Robots identifies the sitemap. `llms.txt` and `llms-full.txt`
describe the actual method and public sources; they confer no extra access to data.

Demo mode forbids crawling through robots and response headers and emits an empty
sitemap index. Do not submit the temporary demo domain to Search Console or Bing.
For the final domain, configure `SEARCH_CONSOLE_VERIFICATION` and
`BING_VERIFICATION`, verify ownership, inspect representative canonical URLs and
submit the sitemap. Moving domains also requires updating OAuth, mail links,
payment returns and public media configuration together.

IndexNow was evaluated against the [official protocol](https://www.indexnow.org/documentation).
It accepts changed URLs for a verified host; acknowledgement does not guarantee
indexing. It is intentionally inactive for the temporary demo domain. The reserved
`INDEXNOW_KEY` setting currently performs no submission. Once the permanent domain
is approved, add a root ownership-key route and a bounded outbox consumer that
rechecks public eligibility, handles removal notifications, and honors retry/rate
limits. Sitemaps already provide the supported discovery path. Never send private
URLs or bulk-ping the demo to search engines.

Optional `INDIETOOLS_URL` enables a cross-promotion link to the independently
operated product. No account, payment or private analytics data is shared by this
link. Existing sponsorship inventory can also carry an approved placement.

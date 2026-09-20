# Public content refresh — 2026-09-20

The public content pages now share the existing warm dark palette, Outfit headings and Inter body text. The homepage and its navigation keep their existing layout.

## Page scope

- `/about`: measurement explanations, ownership and privacy information.
- `/blog` and `/blog/[slug]`: cover-led archive, reading metadata, preserved article attribution, article contents and anchored headings.
- `/categories` and `/fastest/[category]`: searchable category collection, real listing counts, existing pagination and indexing boundaries.
- `/pricing`: Free and Pro comparison, visible payment FAQ and a separate advertising link. Existing $0, $9 one-time and $19 monthly packages remain in effect. Purchase buttons depend on the payment catalog's actual availability.
- `/advertise`: desktop placement details, published-listing requirements, subscription terms and the existing Dodo checkout flow.
- `/privacy` and `/terms`: readable sections and navigation. Existing policy text is preserved; privacy disclosures now include submitted product country.
- Footer: separate Explore, Build with us and Resources navigation, owner attribution, IndieTools logo and the Markdown/LLM documents.

## Country selection

Both submission interfaces require an ISO country of origin for new publications. The 249 locally served SVG flags and the country search follow the IndieTools implementation. Search supports country names, codes and the Turkey/Türkiye alias. Country state survives the checkout draft round trip.

The existing `sites.country_code` and country reference table are reused. No database migration is needed. Historical records and imports can retain a null country; newly prepared publications reject missing or unsupported countries before consuming their measurements. Flag attribution is in `public/flags/README.md` and `public/flags/LICENSE.txt`.

## Search and machine-readable content

Canonical metadata, Open Graph, breadcrumbs, article dates and public structured data remain aligned with each page. Pricing FAQ markup comes from the same questions and answers displayed on the page. No score or search-ranking guarantee is added. Demo deployments remain excluded from indexing.

`/llms.txt`, `/llms-full.txt` and the `/markdown` library are linked from the footer. The full reference includes all 27 current repository articles and public service copy. Legal HTML and Markdown share `src/content/public-pages.ts`; About uses `src/content/about.ts`. See [MARKDOWN.md](MARKDOWN.md) for the allowlist, cache rules and document limits.

The article `does-page-speed-affect-seo` now distinguishes Google indexing, field metrics and Lighthouse diagnostics with primary-source links. Its original publication date is retained and its actual editorial update date is recorded.

## Validation scope

Validation covers unit tests, isolated database integration tests, desktop and mobile browser navigation, country selection and flag loading, document links, metadata, structured data, checkout availability states, modal keyboard handling and scoped WCAG accessibility checks. Browser payment checks use a mocked catalog and do not initiate transactions. Screenshot and external-provider production operations are outside this content refresh.

Completed on September 20, 2026: 434 unit tests, 263 isolated integration tests, `npm run lint` and the final production build passed. Twenty content-page desktop/mobile views and four country-picker states passed scoped WCAG A/AA scans. Browser checks found no horizontal overflow or page errors; native Markdown navigation and footer logo loading were verified. The local preview remains at `http://localhost:3100`.

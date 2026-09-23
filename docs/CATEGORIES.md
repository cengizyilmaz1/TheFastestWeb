# Website categories

The public IndieTools taxonomy was verified against <https://www.indietools.app/categories> on 2026-09-20. Its 15 categories are AI, Analytics, CMS, Design, Developer tools, Finance, Fitness, Games, Lifestyle, Marketing, Personal life, Productivity, Programming, SEO and Social media. All eight original TheFastestWeb website types remain, for 23 submission choices.

`src/modules/catalog/categories.ts` is the reviewed public vocabulary shared by submission validation, both submission forms and category discovery. Category choices remain explicit; website metadata does not silently assign one.

## Database rollout

Run the existing maintenance migration command with the migration-owner connection before enabling new submissions:

```sh
npm run db:migrate
```

Migration `0008_indietools_categories` inserts the 15 new slugs with stable IDs. It does not alter the legacy PostgreSQL enum, existing category IDs, site records, ownership, payments or measurements. An existing slug is left unchanged, including an operator's inactive state. Its schema fingerprint deliberately matches migration 0007 because this is reference data only. Never rewrite old migrations or run migrations from application startup.

The normalized `site_categories` relationship is authoritative. New category names use `other` only in the legacy enum compatibility column; public listings, category pages and directory responses read the normalized primary slug. Historic sites with no normalized primary assignment retain their original category placement.

## Public routes and SEO

- `/categories` provides all 23 categories and public website counts.
- `/fastest/{slug}` is each category's canonical page. All historic category URLs remain valid. New examples: `/fastest/ai`, `/fastest/developer-tools`, `/fastest/seo`.
- Category results include public active/verified sites only. Private, archived and inactive records do not enter counts or sitemaps.
- Results use stable score ordering, 24 entries per page, canonical page links and numbered structured data that match visible results. Invalid pages and unknown slugs return 404.
- Every page has category-specific visible guidance, description, Open Graph/Twitter metadata, breadcrumb and CollectionPage/ItemList markup.
- Empty collections and query-filter variants are noindex. `/sitemap-categories-1.xml` includes only populated canonical collections. The former `/sitemaps/categories/0.xml` redirects to it. Demo deployments keep all indexing disabled.
- `/submit?category={slug}` preselects a valid category. Saved checkout drafts retain the user's choice.

Updating the IndieTools vocabulary in future requires reviewing its public source, updating the shared catalog and appending another reference-data migration. There is no runtime dependency on IndieTools for submissions.

## Validation

The migration regression uses a fresh loopback test database. It verifies all 23 seeds, the unchanged eight-value enum, repeated execution, preservation of existing site/category assignments and measurement history, and an existing inactive category with an operator-defined ID/name. Submission integration verifies that an AI listing appears as AI in public results and does not enter the legacy Other collection.

Production metadata tests cover populated and paginated canonicals, empty collections, filter variants, unavailable results and demo exclusion. The local browser check covers all 23 category routes, unique descriptions, visible results matching ItemList entries, invalid-page 404s, pagination and 390/1440-pixel layouts. Both the shared selector and the complete signed-in submission form were checked with all 23 choices, category query preselection and selection changes. The signed-in browser check uses a temporary synthetic account and browser-mocked measurements; it creates no public listing or provider request. External Google login and real provider acceptance remain separate checks.

# Release validation — 2026-09-19

The product release is deployed to an isolated Coolify demo at application revision `2e4f1b8b730aabc48852cc711d1164607e214d7d`. This record distinguishes checked application behavior from provider-account and hosting acceptance. The private operations record binds the deployment, image IDs and restore evidence; a source test does not establish that a remote deployment is healthy.

## Interface refresh

The current interface uses a shared light/dark design system across the navigation, footer, home, directory, taxonomy, rankings, site reports, founder profiles, journal, forms, dashboard and administrator pages. The home shows twelve real directory entries before further discovery sections. URL filters, pagination, accessible search, mobile menus and account actions retain their underlying authorization and data contracts. No database migrations or provider configuration changes are part of this interface refresh.

The local preview at `http://localhost:3100` uses the restored dataset. Its 44 public desktop/mobile checks passed with no horizontal overflow, JavaScript errors or automated WCAG A/AA violations. Additional review covered 320px screens, short landscape menus, search keyboard behavior, filter persistence and browser Back navigation. Synthetic production runtime results are recorded separately below.

## Completed source checks

- Production Next.js build and TypeScript: passed with no application credentials supplied at build time.
- ESLint: no errors or warnings. Production dependency audit: no reported advisories at execution time.
- Unit suite after the interface refresh: **317 tests / 43 files** passed.
- Full PostgreSQL/Redis integration suite: **240 tests / 25 files** passed against disposable loopback databases and isolated queue prefixes. The interface refresh additionally passed **32 focused PostgreSQL tests / 2 files** covering public privacy and listings.
- Deployed revision `2e4f1b8`: both [pull-request CI](https://github.com/cengizyilmaz1/TheFastestWeb/actions/runs/35465507091) and [push CI](https://github.com/cengizyilmaz1/TheFastestWeb/actions/runs/35465504287) passed, including full integration/migration checks and isolated production browser validation.
- Migration rehearsal: eight migrations through `0007`; 43 public tables, one view and one sequence. The seven previous SQL/fingerprint files are unchanged. The existing 42 tables and seven migration ledger entries retained their content hashes when adding invitations. Nine migration verification groups cover restore/fresh/upgrade, replay, concurrency, drift rejection and restricted roles.
- Actual original-export restore checks preserve 444 users, 187 websites and 17,595 historical measurements, their IDs/ownership and existing access. No public founders or competition results were fabricated from legacy measurements.

## Production runtime browser checks

`scripts/public-runtime-smoke.ts` creates an isolated `tfw_test_listing_*` database, seeds explicitly synthetic actors and measurements, launches the standalone production server and removes its database/roles after validation. It refuses a non-loopback/non-test control database.

- **52 public checks** across desktop/mobile and light/dark on the refreshed interface: HTTP status, heading structure, horizontal overflow, JavaScript errors and WCAG A/AA axe checks passed. Coverage includes site reports, founder insights, comparison, blog article, weekly/monthly archives and directory/account entry screens.
- **5 authenticated checks** passed: desktop/mobile dashboard and administrator accessibility, plus a real invitation → acceptance → attribution removal flow against the isolated API/database. Browser credentials exist only in memory and never enter artifacts.
- Runtime security checks passed: noindex demo response, robots restriction, HSTS, nosniff, frame protection and anonymous denial on the private collaboration API.
- Bounded local load smoke: 80 read requests, four concurrent clients, **zero failures**, observed p50 123 ms and p95 211 ms. This is a loopback production build with synthetic data, not a public capacity or uptime claim.

Browser reports/screenshots and the load result are written to ignored `test-results/`. CI retains only synthetic browser/load evidence for seven days. Set `SMOKE_LIGHTHOUSE=true` to additionally generate local HTML/JSON mobile and desktop Lighthouse reports; these simulated lab results depend on the host and intentionally noindex demo configuration.

The corrected Lighthouse helper passes the official mobile/desktop configuration as the third Node API argument and rejects mismatched form factor or screen emulation. Earlier reports accidentally used mobile emulation for both labels; their desktop score of 93 remains withdrawn.

Current interface, isolated production runtime, 2026-09-19 at 19:19–19:20 UTC:

| Metric | Mobile | Desktop |
| --- | ---: | ---: |
| Performance | 79 | 100 |
| Accessibility | 100 | 100 |
| Best practices | 96 | 96 |
| SEO | 69 | 69 |
| First contentful paint | 1.53 s | 0.38 s |
| Largest contentful paint | 4.10 s | 0.81 s |
| Total blocking time | 293 ms | 17 ms |
| Cumulative layout shift | 0 | 0 |

Mobile uses 4× simulated CPU slowdown and mobile network throttling; desktop uses Lighthouse's desktop defaults. The mobile headline remains the LCP element, with style/layout and client JavaScript work as optimization opportunities. This is one synthetic loopback run, not a production performance baseline or a controlled comparison with earlier runs.

Best practices loses points only for external favicon 404 responses for the synthetic `example.com` and `example.org` fixtures; the visible monogram fallback remains usable. SEO loses points only for `is-crawlable`, caused by the intentional demo `X-Robots-Tag: noindex, nofollow, noarchive` header and robots exclusion. All other scored SEO audits passed; structured-data validation remains a separate manual audit. Preserve demo indexing protection. Final-domain SEO and deployed-host performance still require acceptance in that environment.

## Hosting and external release gates

The [Coolify demo](https://tfw-demo.54.36.101.109.sslip.io) is pinned to application release `2e4f1b8`, including the interface refresh and managed infrastructure. The project contains three Resources: Web + Jobs (web, worker, scheduler), PostgreSQL and Redis. All five containers and all Resource cards report healthy. The public read-only verification passed all nine checks: HTTPS/security headers, liveness, dependency readiness, demo robots/sitemap restrictions, disabled OAuth, anonymous private API/admin denial and HTTP-to-HTTPS redirect.

PostgreSQL and Redis retain their original persistent volumes and private backend network, publish no host ports and receive only their explicit environment entries. The application services do not receive database administrator passwords. Actual TCP checks confirm the application's restricted database role, private migration ledger and protected append-only history. Resource limits and bounded logs were verified in all five containers. Coolify raw Compose and disabled Dockerfile ARG injection preserve runtime secret separation; see [COOLIFY-COMPOSE.md](COOLIFY-COMPOSE.md).

The native database cutover preserved content hashes for all 44 tables, including the migration ledger. Both the pre-cutover custom dump and the first native scheduled `pg_dumpall` backup were restored successfully in isolated temporary databases. The latter included roles and reproduced all 44 table hashes. Daily native backups retain seven local copies for up to seven days. Offsite recovery remains pending an authorized private destination.

Sandboxed Chromium passed in the actual deployed web and worker containers. A dedicated writable home fixes Crashpad startup; a reviewed container-specific seccomp profile extends Docker's default with only the namespace operations needed by Chromium. Both containers retain UID 1001, all capabilities dropped, no privilege escalation and default AppArmor. Renderer checks verified separate user/network/PID namespaces, zero effective capabilities and Chromium's additional seccomp filter. No sandbox opt-out, privileged container, unconfined profile or host-wide policy change was used. See [CHROMIUM_SANDBOX.md](../runtime/CHROMIUM_SANDBOX.md). This clears the host browser gate; external screenshot/storage accounts and recurring monitoring remain disabled pending their own configuration.

Before accepting a particular remote release, verify its pinned Git revision, private restore/migration integrity, least-privilege runtime role, all service health checks, sandboxed Chromium on that host, HTTPS redirect/TLS, demo indexing restrictions and anonymous admin/API denial. `DEMO_BASE_URL=https://the-demo-host node scripts/verify-demo.mjs` performs the read-only public checks without credentials.

Final-domain OAuth, real PSI/Dodo sandbox/Graph/R2 account tests, old-provider secret revocation, independent monitoring and scheduled encrypted off-host backups remain separate production acceptance conditions. Demo keeps provider delivery, payments, analytics and automatic monitoring disabled. Source tests use no live customer charge or email delivery.

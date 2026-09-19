# Release validation — 2026-09-19

The product release is prepared for an isolated Coolify demo. This record distinguishes checked application behavior from provider-account and hosting acceptance. The deployed commit and hosting evidence are recorded in the pull request and the private operations record; a source test does not establish that a remote deployment is healthy.

## Completed source checks

- Production Next.js build and TypeScript: passed with no application credentials supplied at build time.
- ESLint: no errors or warnings. Production dependency audit: no reported advisories at execution time.
- Unit suite: **311 tests / 41 files** passed.
- Full PostgreSQL/Redis integration suite: **240 tests / 25 files** passed against disposable loopback databases and isolated queue prefixes.
- Migration rehearsal: eight migrations through `0007`; 43 public tables, one view and one sequence. The seven previous SQL/fingerprint files are unchanged. The existing 42 tables and seven migration ledger entries retained their content hashes when adding invitations. Nine migration verification groups cover restore/fresh/upgrade, replay, concurrency, drift rejection and restricted roles.
- Actual original-export restore checks preserve 444 users, 187 websites and 17,595 historical measurements, their IDs/ownership and existing access. No public founders or competition results were fabricated from legacy measurements.

## Production runtime browser checks

`scripts/public-runtime-smoke.ts` creates an isolated `tfw_test_listing_*` database, seeds explicitly synthetic actors and measurements, launches the standalone production server and removes its database/roles after validation. It refuses a non-loopback/non-test control database.

- **54 public checks** across desktop/mobile and light/dark: HTTP status, heading structure, horizontal overflow, JavaScript errors and WCAG A/AA axe checks passed. Coverage includes site reports, founder insights, comparison, blog article, weekly/monthly archives and directory/account entry screens.
- **5 authenticated checks** passed: desktop/mobile dashboard and administrator accessibility, plus a real invitation → acceptance → attribution removal flow against the isolated API/database. Browser credentials exist only in memory and never enter artifacts.
- Runtime security checks passed: noindex demo response, robots restriction, HSTS, nosniff, frame protection and anonymous denial on the private collaboration API.
- Bounded local load smoke: 80 read requests, four concurrent clients, **zero failures**, observed p50 102 ms and p95 159 ms. This is a loopback production build with synthetic data, not a public capacity or uptime claim.

Browser reports/screenshots and the load result are written to ignored `test-results/`. CI retains only synthetic browser/load evidence for seven days. Set `SMOKE_LIGHTHOUSE=true` to additionally generate local HTML/JSON mobile and desktop Lighthouse reports; these simulated lab results depend on the host and intentionally noindex demo configuration.

The initial Lighthouse desktop label was invalid: the helper passed a CLI-only `preset` flag to the Node API, so both reports actually used mobile emulation. The previously reported desktop score of 93 is withdrawn. The latest pre-fix scores, 65 and 76, are also two mobile runs, not a mobile/desktop comparison. The corrected helper passes Lighthouse's official mobile/desktop configuration as the third Node API argument and rejects a result whose form factor or screen emulation differs from the requested configuration.

Those two pre-fix mobile runs reported LCP 4.39/3.87 seconds, total blocking time 855/432 ms, accessibility and best practices 100, and CLS zero. Their dominant measured limitation is client main-thread work: 2.63/1.72 seconds overall, including 1.29/0.76 seconds of JavaScript execution. The LCP element is the text headline. Root-document response took 78/32 ms; it was not the dominant bottleneck. Reported opportunities include approximately 29 KiB of unused framework JavaScript and a logo image delivered larger than its displayed size (approximately 45 KiB potential savings). These are optimization findings, not proof of a broken page or a controlled performance regression. The same-source runs vary materially; host scheduling, simulated throttling and repeat-run effects prevent attributing the score difference solely to a code change.

SEO 69 has exactly one failed audit: `is-crawlable`, caused by the intentional demo `X-Robots-Tag: noindex, nofollow, noarchive` header and robots exclusion. All other scored SEO audits passed; structured-data validation is a separate manual audit. Do not remove demo indexing protection to improve a lab score. A correctly configured mobile/desktop run on the deployed host remains necessary before claiming a production performance baseline or final-domain SEO acceptance.

## Hosting and external release gates

The demo PostgreSQL and Redis containers are healthy, have dedicated persistent volumes, publish no host ports and receive only their explicit environment entries. Coolify raw Compose and disabled Dockerfile ARG injection preserve runtime secret separation; see [COOLIFY-COMPOSE.md](COOLIFY-COMPOSE.md).

Before accepting a particular remote release, verify its pinned Git revision, private restore/migration integrity, least-privilege runtime role, all service health checks, sandboxed Chromium on that host, HTTPS redirect/TLS, demo indexing restrictions and anonymous admin/API denial. `DEMO_BASE_URL=https://the-demo-host node scripts/verify-demo.mjs` performs the read-only public checks without credentials.

Final-domain OAuth, real PSI/Dodo sandbox/Graph/R2 account tests, old-provider secret revocation, independent monitoring and scheduled encrypted off-host backups remain separate production acceptance conditions. Demo keeps provider delivery, payments, analytics and automatic monitoring disabled. Source tests use no live customer charge or email delivery.

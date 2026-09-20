# Architecture

Next.js 16 App Router serves public discovery pages, the owner dashboard, administration and HTTP APIs. React 19 uses the shared design system across directory, founder, competition, comparison and journal views. PostgreSQL 18 is the source of truth through Drizzle and a bounded lazy postgres.js pool per process. Redis/BullMQ transports durable work; it is not the authority for ownership, scores, payments or job completion.

The current implementation includes the provider and product modules below. Feature gates and real-account release checks remain distinct from source completeness: an adapter can be implemented while its provider is deliberately unavailable in a demo. The runtime schema is established by eight reviewed additive migrations through `0007_founder_invitations`.

```text
src/app                       Public/private pages, metadata and route handlers
src/components                Shared accessible UI and design-system components
src/modules/auth              Google identity synchronization preserving UUIDs
src/modules/sites             Public discovery/profiles, lifecycle and listing writes
src/modules/submissions       Queued preparation and server-verified submission proofs
src/modules/claims            Ownership verification and review boundaries
src/modules/founders          Opt-in profiles, social links, invite/accept/remove attribution
src/modules/performance       Device/method-standardized PSI measurements and budgets
src/modules/rankings           UTC competitions, deterministic snapshots and archives
src/modules/awards, badges     Eligibility, achievements, verification and share assets
src/modules/compare            Public-only, same-device/method comparisons
src/modules/payments           Dodo ledger, checkout, scoped entitlements and ad reservations
src/modules/notifications      In-app events, category preferences and queued Graph delivery
src/modules/analytics          Typed internal events and eligible revenue attribution
src/modules/admin             Explicit roles, audited preview/confirm operations and reports
src/modules/dashboard         Owner-scoped read models
src/modules/catalog, seo       Product taxonomy, public discovery and indexability policy
src/modules/screenshots       Authenticated central-service adapter and listing history
src/modules/jobs              Durable outbox, fenced leases, handlers and scheduled generation
src/modules/security          Shared request and quota validation
src/lib/security              URL policy and bounded DNS-pinned HTTP(S) fetch
src/lib/blog*, content/blog    Repository-owned MDX, metadata and heading/TOC pipeline
src/infrastructure            Provider transports, browser egress, queues, logs and health
src/bin                       Worker, scheduler, queue operator and admin bootstrap entrypoints
src/config                    Typed role-aware runtime environment and public site config
src/db                        Schema, lazy pool and additive SQL migrations
services/screenshot           Independent API/worker with its own durable capture ledger
scripts/db                    Guarded migration, restore preparation and database validation
scripts/verify-*, tests        Browser/runtime checks and unit/integration coverage
runtime                       Next HTTP drain, standalone assembly, Redis and Coolify wrappers
```

## Identity and writes

Google OAuth uses stable next-auth 4.24.15 with PKCE/state, verified Google email and JWT sessions. The internal user UUID is carried in the JWT. Sign-in serializes normalized email lookup/update; it does not replace ownership IDs. Auth v5 beta cookies are not retained, so users sign in again after secret rotation.

The proxy attaches a validated correlation ID. It is not authorization middleware. Each protected resource authenticates and checks ownership independently. JSON mutations require the configured origin and bounded schema-validated bodies. Production secrets validate on startup; build needs none.

A queued submission preparation measures the URL and returns safe editable metadata. A mobile PSI result creates a server-only proof containing owner, normalized URL, strategy, job UUID, timestamps, result and methodology. Submission accepts the proof ID, not client metrics. One transaction serializes owner/URL checks, consumes the matching unexpired proof and writes site/history. Failure rolls back proof consumption. Effective Pro checks combine preserved legacy access with active durable grants; immutable checkout scope prevents a deleted site from turning a site-scoped purchase into account-wide access.

Historical canonical duplicates remain separate records. New writes use a transaction-level URL advisory lock plus lookup to prevent new duplicates without merging history.

Public founder identity is an explicit profile, separate from private account identity. Site ownership and founder attribution are separate relationships. An owner can invite a public founder; only the invited profile owner can accept an unexpired invitation. Acceptance rechecks both owners under locks, and removal requires ownership or self-detachment. An attribution grants no account or site administration access. Private profiles and stale private-site invitations are masked in other users' responses. See [FOUNDER-COLLABORATIONS.md](FOUNDER-COLLABORATIONS.md).

## Boundaries and limits

The scheduler process always dispatches the PostgreSQL outbox and retries to BullMQ. With `SCHEDULER_ENABLED=false`, it runs in `dispatch-only` mode and creates no scheduled monitoring/maintenance jobs. With the flag true, it additionally materializes scheduled work. Stopping dispatch requires stopping the process; disabling this flag is not a queue pause. Separate workers claim fenced leases and atomically save results plus completion. A site/day/device key deduplicates performance work. Redis can be rebuilt from nonterminal PostgreSQL records; expired leases are reconciled. The authenticated cron compatibility route returns 202 after enqueueing only. See [queue contracts](QUEUES.md).

Public speed tests have shared anonymous and global quotas; authenticated requests also have per-user limits. Redis atomically enforces request windows without storing raw IPs. Every actual PSI request, including a backup-key retry, also reserves a durable PostgreSQL daily budget. Web and workers share that budget and a Redis minute limit. Unavailable dependencies fail closed before requesting a measurement.

Browser sessions use a DNS-pinned loopback proxy, request/traffic/time limits and sandboxed Linux Chrome. Submitted URLs cannot directly reach private network destinations or bypass policy through redirects, DNS rebinding or browser subresources. Badge failures do not delete or unlist data. The separate screenshot/media service in `services/screenshot` has its own authenticated clients, durable jobs, quotas and private/public R2 storage. Private captures do not acquire public URLs implicitly; public promotion and historical screenshot visibility require explicit application policy.

Next standalone tracing does not automatically include a custom server. The preparation script explicitly copies the runtime entrypoint and required Next compiled dependencies; the production Docker smoke test validates that artifact. Run the documented Docker entrypoint for the shutdown contract.

Web, worker and scheduler validate configuration at startup, expose uncached liveness/readiness and close resources on shutdown. Readiness checks migrated schema, minimum grants, unsafe database privileges, Redis availability, bounded memory, noeviction and AOF health. Background readiness also reflects worker/dispatch-loop state. It does not certify external provider permissions or delivery.

The supplied Coolify deployment uses raw Compose and a proxy overlay, with explicit service environments. Build wrappers never load runtime secrets; start wrappers never trigger a build. Only web is exposed through ingress. Database, Redis and background health ports remain private. See [COOLIFY-COMPOSE.md](COOLIFY-COMPOSE.md) and [DEPLOYMENT.md](DEPLOYMENT.md).

## Providers and financial state

Legacy checkout/ad-checkout/Polar webhook routes and Resend delivery are removed. Existing user Pro flags, site tiers, payments and ad ownership are preserved. Dodo checkout uses a server-owned product catalog and immutable order snapshot; raw-body signature verification, durable webhook events, a payment ledger and transactional entitlement updates prevent client-controlled grants. Duplicate or out-of-order events cannot blindly reapply access. Ambiguous checkout or financial outcomes require reconciliation rather than an automatic repeat purchase.

Ad reservations use durable inventory holds. A still-payable checkout is not released merely because a timer expires; release requires definitive provider outcome or explicit cancellation evidence and an audited operation. Paid creative approval establishes its publication window. Active owner-bound featured/sponsorship placements are labeled paid and never influence competition rankings. See [PAYMENTS.md](PAYMENTS.md), [ADS.md](ADS.md) and [ADMIN.md](ADMIN.md).

Welcome, publication, claims, monitoring, competition, badge and payment events persist in-app notifications in their domain transaction. Enabled Graph delivery creates an outbox job; HTTP requests never send mail synchronously. Disabled email creates no future delivery backlog. Templates and category preferences are in `src/modules/notifications`.

Graph uses app-only Microsoft 365 credentials and scoped mailbox access. Provider acceptance is not confirmed delivery; an uncertain send is recorded for reconciliation instead of risking duplicate email. Signed unsubscribe links and category preferences apply independently of the in-app notification record.

DataFast uses native cookieless tracking with configured provider identifiers; Google Analytics is not loaded. Private application paths and arbitrary query values are excluded, and GPC/DNT plus prior opt-outs are honored. DataFast revenue processing requires a confirmed payment and an eligible current-tab checkout snapshot (or legacy explicit consent); provider traffic hints are not verified human/bot classifications. Separate typed, deduplicated internal domain events record product actions without client-controlled event insertion or raw personal data. Neither analytics stream controls entitlement or ranking.

`PAYMENTS_ENABLED`, `EMAIL_ENABLED`, `STORAGE_ENABLED`, `SCREENSHOTS_ENABLED` and `ANALYTICS_ENABLED` default false. Missing enabled-provider configuration fails startup. Demo mode rejects payments, email, analytics and scheduled generation and applies indexing guards. Local transport tests do not substitute for new-owner account credentials, OAuth callback configuration, provider sandbox tests or a production cutover. See [PROVIDERS.md](PROVIDERS.md) and [RUNBOOK.md](RUNBOOK.md).

## Public measurements, competition and content

Real history queries replace the fabricated seed endpoint. Legacy methods remain intact. New measurements use two samples per device under `psi-v2-two-sample`; ranking-v1 compares compatible device/method records and freezes completed UTC periods. Missing deprecated TTI stays NULL / “Unavailable”.

Weekly/monthly snapshots, awards and archived rankings are derived from recorded eligible measurements. Paid access does not buy ranking position. Site/founder pages honor publication and ownership visibility, and expose actual method-specific metrics, history and finalized ranks. Comparison pages independently enforce public visibility even for a signed-in owner, use a canonical ordered slug pair and never calculate deltas across different devices or methodologies. Thin comparisons and query variants remain noindex.

The journal remains repository-owned MDX with categories, literal topic tags, preserved author attribution, local covers, compiled-heading TOC, related posts and browser sharing. Metadata, safe structured data, dynamic sitemap and canonical rules use the central site origin. Demo indexing guards override discovery surfaces. See [METHODOLOGY.md](METHODOLOGY.md), [AWARDS-AND-BADGES.md](AWARDS-AND-BADGES.md), [COMPARE-AND-JOURNAL.md](COMPARE-AND-JOURNAL.md) and [SEO.md](SEO.md).

## Verification boundaries

Unit tests cover pure policy and transport behavior. PostgreSQL/Redis integration tests create isolated synthetic databases, roles and queue prefixes against guarded loopback fixtures. `scripts/public-runtime-smoke.ts` starts the built standalone artifact, verifies response headers and readiness, and exercises public/private accessibility, founder collaboration and bounded load using synthetic actors; Lighthouse is optional. Provider calls are disabled in this fixture. The current release/CI results, account tests and operational acceptance are separate evidence, not implied by this architecture description. See the [README validation commands](../README.md#validation).

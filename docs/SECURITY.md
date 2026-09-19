# Security foundation

## Closed application paths

- Direct arbitrary metadata fetches now validate schemes/credentials/ports/public IPv4 and IPv6, resolve every DNS record, pin the connection address and revalidate each redirect. Body sizes, request duration and redirect count are bounded.
- Chromium retains its sandbox and uses the same egress policy for HTTP, HTTPS CONNECT and subresources. Loopback, private, metadata, mixed-address DNS and rebinding tests are included. Unsupported browser startup fails safely.
- JSON-LD escapes script-breaking characters; SVG text is XML-escaped and receives a restrictive CSP. Preview badges are labeled as samples.
- Submission bodies reject client score, ownership, tier and badge-verification fields. Only an authenticated server-generated result can be consumed, once, for the same normalized URL and mobile strategy.
- Google callback requires verified email. Existing UUIDs/ownership remain authoritative.
- Cron credentials are required and constant-time compared. A missing secret never opens the endpoint. Retests are serialized, bounded and store real measurements only.
- Polar routes are retired. Dodo webhooks verify the raw-body signature, persist a sanitized event and transactional outbox, and grant access idempotently. Exact provider price/currency/interval checks precede checkout. Ambiguous checkout creation retains its order and ad hold for reconciliation.
- Private listings require ownership for profile/history; badge and directory discovery require public listings.
- HTTP JSON error messages never contain raw database/provider exceptions. Correlation IDs and redaction are tested.
- Dangerous maintenance/deletion scripts and synthetic production seed/history generators were removed.

## Trust boundaries

Only the Coolify proxy may reach the web container. It must overwrite forwarded headers, terminate HTTPS and enforce request limits. `AUTH_TRUST_HOST=true` is an operator acknowledgement of that network boundary; it is not authentication. Origin checks use the configured public origin, not a forwarded host.

The app DB role must not own tables, have superuser/BYPASSRLS/role-creation capabilities, or access the migration ledger. Legacy RLS without policies is replaced by explicit application authorization and least-privilege grants. Migrations use a separate owner. See DATABASE.md.

Atomic Redis request windows are shared across replicas; actors are hashed. Public anonymous speed tests share a quota, and every primary/backup PSI request also reserves a durable PostgreSQL UTC daily budget. Both dependency failures deny provider work. New ad-click records retain a daily HMAC pseudonym, not raw IP/user-agent/referrer. Historical private analytics data is retained for later reviewed privacy migration.

Background job payloads in Redis contain only job/correlation UUIDs. PostgreSQL lease tokens and a unique measurement/job reference prevent stale workers from committing duplicate history. Manual retest/status routes enforce current ownership; the operator CLI is private to host/container access. Failed provider text is reduced to safe error codes. Cancellation fences results but cannot undo an already transmitted upstream request.

The PSI service is external: a successful HTTP response without valid Lighthouse metrics is a failure, never an invented 0. Current measurements require two complete samples per device. Legacy samples remain explicitly versioned and cannot enter current competitions. Device strategies and methodologies never mix in history or rankings.

Founder profiles are opt-in. Public directory/profile/sitemap/award responses exclude account identifiers, emails and raw provider payloads. Private, removed or archived sites disappear from public competition reads without rewriting immutable historical snapshots. Ownership proofs are hashed, expire and never silently transfer an already-owned site. Admin mutations bind a short-lived signed preview to the actor, action and current record and commit with a single-use audit entry.

Cross-account founder attribution requires a seven-day invitation from the current site owner and acceptance by the invited profile's account. Acceptance rechecks ownership, profile visibility and expiry in one transaction; it never transfers site ownership. Owners may remove links and founders may detach themselves. Replaying an accepted invitation cannot restore a removed link. Management views mask another account's private profile name and URL; no automatic invitation email is sent. See [FOUNDER-COLLABORATIONS.md](FOUNDER-COLLABORATIONS.md).

Graph delivery uses scoped application credentials and distinguishes accepted from delivered. Uncertain outcomes are not blindly resent. R2 uses separate private/public buckets and authenticated private reads. Screenshots render in a separate sandboxed service, validate redirects/subresources and retain private captures until explicit public approval. Analytics scripts require consent and remain excluded from private routes; GPC/DNT deny collection.

## Secrets and accounts

All supplied legacy secrets must be rotated/revoked at their providers before launch: database roles, Auth session secret, Google OAuth/PSI, email, avatar and former payment credentials. Existing sessions intentionally expire with the new Auth secret. Do not paste values into issues, commits, logs or build args.

`.env.example` contains names/examples only. Configure new runtime values in Coolify. The repository ignores environment files, SQL exports, bundles, dumps, archives and audit artifacts. No provider keys are exposed as NEXT_PUBLIC variables.

The repository cannot revoke provider keys, change OAuth ownership or verify real email/payment delivery without those service accounts. These are explicit release gates, not completed checks.

## Regression and deployment

Run lint, typecheck, unit and PostgreSQL integration tests, audit, and the Linux production build. SSRF regressions include loopback proxy refusal; listing tests include mismatched/reused/expired results and concurrent writes. Test browser isolation on the actual Coolify host; never resolve a sandbox failure by adding `--no-sandbox`.

The private restore rehearsal is documented separately and never runs through HTTP. The reviewed release has eight migrations through `0007`; migrations `0000`–`0006` and their catalog fingerprints remain unchanged from the infrastructure checkpoint. The `0007` rehearsal preserved all 42 pre-existing public tables and seven prior migration entries, producing 43 public tables without creating invitation data. No production migration, provider mail, payment mutation or destructive customer-data operation is part of the test suite.

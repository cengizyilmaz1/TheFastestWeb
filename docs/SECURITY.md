# Security foundation

## Closed application paths

- Direct arbitrary metadata fetches now validate schemes/credentials/ports/public IPv4 and IPv6, resolve every DNS record, pin the connection address and revalidate each redirect. Body sizes, request duration and redirect count are bounded.
- Chromium retains its sandbox and uses the same egress policy for HTTP, HTTPS CONNECT and subresources. Loopback, private, metadata, mixed-address DNS and rebinding tests are included. Unsupported browser startup fails safely.
- JSON-LD escapes script-breaking characters; SVG text is XML-escaped and receives a restrictive CSP. Preview badges are labeled as samples.
- Submission bodies reject client score, ownership, tier and badge-verification fields. Only an authenticated server-generated result can be consumed, once, for the same normalized URL and mobile strategy.
- Google callback requires verified email. Existing UUIDs/ownership remain authoritative.
- Cron credentials are required and constant-time compared. A missing secret never opens the endpoint. Retests are serialized, bounded and store real measurements only.
- Unsafe payment webhook handling is suspended until an idempotent verified ledger exists.
- Private listings require ownership for profile/history; badge and directory discovery require public listings.
- HTTP JSON error messages never contain raw database/provider exceptions. Correlation IDs and redaction are tested.
- Dangerous maintenance/deletion scripts and synthetic production seed/history generators were removed.

## Trust boundaries

Only the Coolify proxy may reach the web container. It must overwrite forwarded headers, terminate HTTPS and enforce request limits. `AUTH_TRUST_HOST=true` is an operator acknowledgement of that network boundary; it is not authentication. Origin checks use the configured public origin, not a forwarded host.

The app DB role must not own tables, have superuser/BYPASSRLS/role-creation capabilities, or access the migration ledger. Legacy RLS without policies is replaced by explicit application authorization and least-privilege grants. Migrations use a separate owner. See DATABASE.md.

Bounded PostgreSQL quotas are temporary until Redis/BullMQ. Public anonymous speed tests share a quota; global quotas protect upstream cost even when forwarded addresses can be changed. New ad-click records retain a daily HMAC pseudonym, not raw IP/user-agent/referrer. Historical private analytics data is retained for later reviewed privacy migration.

The PSI service is external: a successful HTTP response without valid Lighthouse metrics is a failure, never an invented 0. M1 records one sample; it does not claim statistical stability.

## Secrets and accounts

All supplied legacy secrets must be rotated/revoked at their providers before launch: database roles, Auth session secret, Google OAuth/PSI, email, avatar and former payment credentials. Existing sessions intentionally expire with the new Auth secret. Do not paste values into issues, commits, logs or build args.

`.env.example` contains names/examples only. Configure new runtime values in Coolify. The repository ignores environment files, SQL exports, bundles, dumps, archives and audit artifacts. No provider keys are exposed as NEXT_PUBLIC variables.

The repository cannot revoke provider keys, change OAuth ownership or verify real email/payment delivery without those service accounts. These are explicit release gates, not completed checks.

## Regression and deployment

Run lint, typecheck, unit and PostgreSQL integration tests, audit, and the Linux production build. SSRF regressions include loopback proxy refusal; listing tests include mismatched/reused/expired results and concurrent writes. Test browser isolation on the actual Coolify host; never resolve a sandbox failure by adding `--no-sandbox`.

The private restore rehearsal is documented separately and never runs through HTTP. No production migration, provider mail, payment mutation or destructive customer-data operation is part of the test suite.

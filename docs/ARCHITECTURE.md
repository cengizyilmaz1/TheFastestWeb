# Architecture — M2

Next.js 16 App Router provides server-rendered pages and route handlers. React 19 renders the existing UI. PostgreSQL 18 is the source of truth through a single bounded postgres.js pool and Drizzle ORM.

```text
src/app                 HTTP routes and server-rendered pages
src/components          Existing UI, updated only for safety/correctness in M1
src/modules/auth        Google user synchronization preserving UUIDs
src/modules/sites       Validated submission, metadata, transactional listing creation
src/modules/security    Shared request validation and Redis quota adapter
src/modules/jobs        Durable outbox, leases, retesting and provider budgets
src/modules/billing     Explicitly unavailable writes until secure replacement
src/lib/security        URL policy, DNS-pinned bounded HTTP(S) fetch
src/infrastructure      Browser / egress proxy, logging, Redis/BullMQ and health
src/bin                 Independent worker, scheduler and operator entrypoints
src/config              Typed runtime environment, public site config, lifecycle
src/db                  Schema, one lazy pool, reviewed SQL baseline
scripts/db              Guarded migration, private restore preparation, integration tests
runtime                 Explicit Next HTTP start/drain and standalone preparation
```

## Identity and writes

Google OAuth uses stable next-auth 4.24.15 with PKCE/state, verified Google email and JWT sessions. The internal user UUID is carried in the JWT. Sign-in serializes normalized email lookup/update; it does not replace ownership IDs. Auth v5 beta cookies are not retained, so users sign in again after secret rotation.

The proxy attaches a validated correlation ID. It is not authorization middleware. Each protected resource authenticates and checks ownership independently. JSON mutations require the configured origin and bounded schema-validated bodies. Production secrets validate on startup; build needs none.

A mobile PSI measurement creates a server-only proof containing owner, normalized URL, strategy, job UUID, timestamps, result and methodology. Submission accepts the proof ID, not metrics. One transaction serializes owner/URL checks, consumes the matching unexpired proof and writes site/history. Failure rolls back proof consumption. Existing Pro entitlement is read from the database.

Historical canonical duplicates remain separate records. New writes use a transaction-level URL advisory lock plus lookup to prevent new duplicates without merging history.

## Boundaries and limits

The scheduler materializes daily jobs and dispatches the PostgreSQL outbox to BullMQ. Separate workers claim fenced leases and atomically save measurements plus completion. A site/day/mobile key deduplicates manual and daily retests. Redis can be rebuilt from nonterminal PostgreSQL records; expired leases are reconciled. The authenticated cron compatibility route now returns202 after enqueueing only. See [queue contracts](QUEUES.md).

Public speed tests have shared anonymous and global quotas; authenticated requests also have per-user limits. Redis atomically enforces request windows without storing raw IPs. Every actual PSI request, including a backup-key retry, also reserves a durable PostgreSQL daily budget. Web and workers share that budget and a Redis minute limit. Unavailable dependencies fail closed before requesting a measurement.

Browser sessions use a DNS-pinned loopback proxy, request/traffic/time limits and sandboxed Linux Chrome. Badge failures do not delete or unlist data. The shared screenshot/media service is not implemented here.

Next standalone tracing does not automatically include a custom server. The preparation script explicitly copies the runtime entrypoint and required Next compiled dependencies; the production Docker smoke test validates that artifact. Run the documented Docker entrypoint for the shutdown contract.

## Provider transition

All legacy checkout/ad-checkout/Polar webhook requests return a structured 503. Existing user Pro flags, site tiers, payments and ad ownership are preserved. No unverified or duplicate payment event is acknowledged as processed. New ledger/entitlements and Dodo sandbox integration are M3/M5.

Legacy email is disabled by default. Login/submission/retest no longer send synchronous welcome/trend emails. Microsoft Graph and queued delivery are planned; disabled delivery is not reported as successful.

Real history queries replace the fabricated seed endpoint. Old measurements retain `legacy-unspecified`; new proofs record a single PSI sample and the Lighthouse version. Missing deprecated TTI stays NULL / “Unavailable”. Multi-sample rankings are not claimed.

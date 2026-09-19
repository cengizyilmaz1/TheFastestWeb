# Website preparation and publication

The submission page has three steps: submit a URL, review editable details and measurements, then publish. A URL does not create a public listing by itself. Google authentication links the preparation and its measurement proofs to the account.

## Durable preparation

`POST /api/submissions` validates the origin, authenticates the account, applies per-account and global Redis quotas, and inserts a `submission.prepare` job into the PostgreSQL outbox. Repeated requests for the same account and normalized URL reuse an active or recently completed preparation for fifteen minutes. The performance worker processes it through the existing leased job ledger. The page polls the owner-only status endpoint; there is no simulated percentage or invented measurement.

Preparation performs the following bounded work:

1. Check for an existing normalized URL. The owner receives a dashboard action; another user receives a claim action only for an active public listing. A private or archived duplicate does not expose its name, identifier or owner.
2. Read public HTML through the pinned-DNS, redirect-validating HTTP client. Parse title, description, declared canonical, favicon and Open Graph image with a DOM parser. The canonical is a hint and never silently changes the submitted identity. HTTP/HTTPS and `www` variants remain distinct unless a separately verified lifecycle operation changes them.
3. Suggest catalog technologies from actual markup, asset URLs, generator metadata or response headers. Marketing prose and HTML comments do not constitute evidence. The numerical confidence is a rule-based heuristic, not a probability. Technology selection remains editable; country is never inferred from hosting or IP geolocation.
4. Run two real PageSpeed lab samples for mobile and two for desktop through the shared provider and quotas. Each complete strategy creates a one-hour, account/URL/strategy/methodology-bound proof. A completed strategy survives a retry of the other strategy. A partial sample batch never becomes a result.
5. When screenshot integration is enabled, request an authenticated private preview from the central service. Its UUID receipt is persisted and reused. Preview failure is optional and does not prevent publishing a listing with valid measurements; no temporary preview URL is publicized.

Metadata failure permits manual entry with an explicit warning. Unsafe private destinations remain blocked. Worker lease fencing prevents a stale worker from committing proofs or preparation results after ownership is lost. Preparation is bounded to a twenty-four-hour recovery horizon; individual provider deadlines and shared quotas still apply.

## Publication boundary

`POST /api/submit` requires a completed preparation UUID and both server-issued mobile/desktop proof UUIDs. Client-provided scores, tiers and owner IDs are rejected. The transaction rechecks the authenticated owner, account allowance, canonical URL and slug conflicts, active category/technology IDs, country code and ownership of any founder profile. It consumes both unexpired proofs, creates the listing, taxonomy/social/founder links and both measurement history rows atomically. Invalid catalog choices or conflicts roll the entire operation back, leaving proofs reusable.

The primary category retains compatibility with the historical category field. Technology links are marked detected only when the chosen catalog slug appears in the stored server evidence; manually selected technologies are labelled manual. Social links and optional favicon URLs pass the same public URL syntax policy. Existing measurement history is preserved with its original methodology; new submissions use `psi-v2-two-sample` and two samples per device.

Free public listings require a verified badge and retain the one-site allowance. Private and additional listings accept either preserved legacy Pro status or a currently active account-wide Pro entitlement. The transaction rechecks the grant under a row lock. Expired, revoked, future or site-only grants do not authorize new private/additional listings. Dodo scope is anchored to the immutable checkout snapshot and source ledger; a deleted site's nullable foreign key cannot broaden a purchase into account access. Temporary access does not overwrite the historical `users.is_pro` or `sites.tier` fields. Badge exemption is evaluated from current entitlements by the badge service.

Public publication also inserts an initial screenshot outbox job when capture is enabled. The separate screenshot handler checks current listing visibility and URL again before storing a public media record. The private preview remains a separate authenticated object.

## Standalone speed test

`/test` preserves the public, globally rate-limited measurement endpoint. It requests the selected device, displays the arithmetic mean of two actual samples and distinguishes lab results from visitor field data. Missing provider metrics display “Unavailable”; an incomplete response or failed request cannot leave a previous score visible. Choosing “Add website” opens the URL-first preparation flow so publication always obtains both required account-bound proofs.

## Verification

The automated integration suite uses a disposable PostgreSQL 18 database and least-privilege application role. Provider responses are explicitly synthetic test fixtures and no PageSpeed, storage or payment provider calls are made. Run with the documented isolated integration database/Redis configuration:

```sh
npx vitest run --config vitest.integration.config.mts tests/integration/submission.test.ts tests/integration/listing.test.ts
npx vitest run src/modules/sites/metadata.test.ts src/modules/sites/input.test.ts
```

Coverage includes concurrent preparation deduplication, owner-only status, partial strategy recovery, atomic taxonomy/founder/social publication, both measurement histories, rollback without proof consumption, private duplicate privacy, authoritative score and account checks, concurrent URL/slug conflicts, and payment access expiry/scope. Browser contract checks against the local preview used a synthetic signed-in account and intercepted provider endpoints: desktop and mobile review/publication, request proof binding, both standalone device choices, provider error/incomplete response handling, and no horizontal overflow. Both review and result states passed WCAG A/AA AXE checks at desktop and mobile sizes. These browser fixtures demonstrate the interface contract; live OAuth/provider credentials and an enabled worker/scheduler remain deployment verification requirements.

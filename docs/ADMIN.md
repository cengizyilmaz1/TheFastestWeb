# Payments administration

`/admin` is a focused payment and advertisement panel. It requires a full administrator before rendering either content or metadata and is excluded from indexing. Anonymous visitors, ordinary accounts and moderators receive not found. The account menu exposes its link only to full administrators. Roles live in `admin_roles`; neither an email address nor an environment allowlist confers privileges. Every report/action rechecks the current database grant, and a revoked role cannot confirm an earlier preview.

The first administrator must first have a normal account. Run the private jobs-container command with its UUID repeated as explicit confirmation:

```sh
node dist/jobs/admin-bootstrap.cjs --user ACCOUNT_UUID --confirm-user ACCOUNT_UUID --reason 'Initial owner-approved administrator assignment'
```

Bootstrap succeeds only when no administrator exists and writes an audit record in the same transaction. It never creates an account or prints its email. Later role changes require a separately authorized database/operator action; no anonymous enrollment endpoint exists.

The current panel shows the two original packages, Dodo environment/configuration status, product bindings and synchronization results. It offers explicit preview/confirmation for creating, verifying or binding products, or updating the permitted details of an app-created product. The packages remain $9 once for lifetime account Pro and $19/month for a sidebar advertisement. Configuration secrets stay in the server environment. Read the complete [Dodo catalog and payment procedure](DODO-PAYMENTS.md) before configuring the merchant account.

The advertisement section configures the five positions on each sidebar and reviews paid creative. Reports use bounded pages and load-more controls. Enabling occupied or reserved capacity is rejected. Approval shows the creative, destination and placement, requires an explicit review checkbox, and rechecks payment, ownership and the valid paid period on the server. An active reservation with pending or inactive creative can be reviewed for recovery; an already published advertisement is excluded from duplicate approval.

All panel mutations require a reason and preview. A five-minute HMAC confirmation binds the actor, exact action and current state; the catalog preview also binds the Dodo environment. Local advertisement changes atomically record before/after evidence and reject replayed confirmations. Remote catalog changes first commit a pending journal entry, then record the provider outcome; an ambiguous creation cannot be repeated automatically. No bulk delete or financial-status override is exposed.

The backend retains broader administrative reports and actions through `/api/admin/report` and `/api/admin/actions`; these are not additional sections in the current UI. The API still supports its role-restricted directory, ownership, measurement, queue, audit and operational functions. Moderators have only the narrower directory/ownership/measurement permissions defined by the backend. Sensitive bodies, recipient addresses, raw job payloads, claim tokens, checkout URLs and provider secrets are excluded from report projections. Unpaid-hold release remains an API capability requiring provider cancellation evidence; it cannot release a confirmed paid placement.

The original public UI has been restored. `/dashboard` and the separate founder pages are not present. Submission and purchase flows use `/submit` and `/pricing`; `/profile/[userId]` publishes only public founder profile information. The signed-in owner can also open an unpublished account through My Profile: the page clearly marks it private, exposes only that owner's account fields, uses generic noindex metadata and does not create public attribution. Other visitors still receive 404 for that unpublished profile. Pricing preserves the original offers, displays compatible active catalog pricing and disables unavailable purchases. A redirect or success query parameter does not grant access.

Leaderboard and site-report photos come from the public founder avatar field and render in initial HTML. Failed photos fall back to initials, including failures before hydration. An audited restoration can copy previously published attribution from the original migration snapshot into explicit public founder records; it must match still-public site ownership and preserve every existing founder visibility choice. Current private account names and photos are never used as a public fallback.

Existing authenticated account, founder-collaboration and notification APIs remain available under their original authorization rules. Their former dashboard controls were not restored. Do not infer a present UI from an API's availability or from historical milestone documentation.

PostgreSQL integration tests cover unauthorized role spoofing, single first-admin bootstrap, non-mutating previews, atomic audit, replay prevention, actor/action binding, stale previews, revoked privileges and moderator restrictions. Provider uncertainty, catalog synchronization and monthly advertisement reconciliation are covered separately; see [Dodo Payments](DODO-PAYMENTS.md) and [Provider operations](PROVIDERS.md). Local tests do not establish live merchant readiness.


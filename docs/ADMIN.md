# Administration and account workspace

`/admin` is authenticated, role-protected and excluded from indexing. Roles live in `admin_roles`; neither an email address nor an environment allowlist confers privileges. Every report/action rechecks the current database grant. A revoked role cannot confirm an earlier preview. Moderators can inspect directory/ownership/measurement reports, change site lifecycle/monitoring and reject pending claims. Financial, catalog, queue and audit operations require an administrator.

The first administrator must first have a normal account. Run the private jobs-container command with its UUID repeated as explicit confirmation:

```sh
node dist/jobs/admin-bootstrap.cjs --user ACCOUNT_UUID --confirm-user ACCOUNT_UUID --reason 'Initial owner-approved administrator assignment'
```

Bootstrap succeeds only when no administrator exists and writes an audit record in the same transaction. It never creates an account or prints its email. Later role changes require a separately authorized database/operator action; no anonymous enrollment endpoint exists.

The panel provides 23 bounded report sections, including sites, users, founders, catalog, countries, queues, failures, performance, awards, claims, checkout orders, payment history, ads, email state, domain analytics, dependency health and audit. Lists use indexed native-key cursors (50 rows per page); analytics reports daily event counts for the last thirty days and separates unverified ad interactions. Sensitive bodies, recipients, raw job payloads, claim tokens, checkout URLs and secrets are excluded. Dependency views do not contact optional providers.

All implemented mutations require a reason and preview. A five-minute HMAC confirmation binds the actor, exact action and current database state. Confirmation checks state again under row locks, rejects replays using a serialized preview nonce, and atomically writes before/after evidence and the action. No bulk delete or financial-status override is exposed.

Supported controls: site activate/suspend/archive, monitoring pause/resume, pending claim rejection, ownership transfer after a fresh verified claim, retry/requeue a failed or cancelled job, cancel an unfinished job, create/update/deactivate server catalog products, configure ad inventory, approve paid creative and reconcile unpaid holds. Pending claims cannot bypass domain verification. In-flight provider requests cannot be cancelled through the panel; wait for their outcome. Uncertain email deliveries cannot be made retryable with an operator click. Payment review only records an audit observation; it does not mutate money, create a checkout or contact Dodo.

Catalog changes preserve old order snapshots. Active products require a provider ID; checkout independently validates current provider price/currency/frequency. Sidebar ad products require one-time fixed duration and an owned site. Configure physical inventory separately; capacity is reserved atomically before checkout. Paid creative approval and unpaid hold release require their own preview, reason and audit. A hold release additionally requires explicit provider cancellation evidence; it cannot release a confirmed paid placement. Do not invent migration product prices or delete financial history to undo an action.

The authenticated `/dashboard` queries only the current user's records. It includes paginated owned sites, durable retest status, finalized rankings/awards, notifications and read state, ownership claim status, current grants, checkout/payment history, retained screenshots, optional email preferences and founder profile editing/linking. Demo mode has an honest sign-in-unavailable state and does not synthesize private account data. `/pricing` reads the server product catalog and hides unavailable purchases instead of displaying historical hardcoded prices.

The founder collaboration section lets an owner invite an existing public founder by slug. The recipient explicitly accepts or declines from their dashboard; pending invitations can be cancelled, an owner can remove attribution and a founder can withdraw their own link. Invitations expire after seven days and do not grant ownership or account access. Removal has a separate confirmation and a consumed invitation cannot recreate a removed link. Private profile names remain hidden from other accounts, and no invitation email is sent automatically. The section exposes recent bounded invitation lists and only authorized associations.

PostgreSQL integration tests cover unauthorized role spoofing, single first-admin bootstrap, non-mutating previews, atomic audit, replay prevention, actor/action binding, stale previews, revoked privileges and moderator restrictions. Provider uncertainty and financial idempotency are tested separately; see [Provider operations](PROVIDERS.md).


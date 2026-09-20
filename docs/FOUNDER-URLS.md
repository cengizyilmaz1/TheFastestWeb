# Founder URLs and redirects

Canonical profile paths are `/founder/{username}`. Names are persistent, unique across current and historical usernames, and editable by their account owner. Updating a username does not change publication visibility. New sign-ins receive a private identity from a supplied display name (or `member` with a collision suffix); account email addresses are never a naming source. A previously unpublished account can initialize its private identity through its own legacy My Profile link.

Public founder pages have an indexable canonical URL and participate in paginated sitemap and Markdown discovery. Private profiles have generic noindex metadata and are available only to their signed-in owner. Old `/profile/{UUID}`, `/founders/{username}` and username aliases return HTTP **301**, directly to the latest canonical username, only after checking the same visibility boundary. Redirect responses use private/no-store caching. A private or nonexistent profile returns 404 to other viewers.

`/admin/redirects` manages independent, exact public-path redirects. Founder, profile, account, authentication, API and admin paths are protected. The editor cannot expose a private identity or override the canonical founder resolver. External URLs, encoded paths, fragments, query strings, chains and loops are rejected. Historical founder aliases are displayed read-only; owners change their username on My Profile.

## Schema and deployment

Migration `0009_founder_urls_redirects` is additive: `founder_slug_aliases` reserves all existing usernames and `redirect_rules` stores versioned administrator rules. Existing founder visibility, names, avatars, site relationships and UUIDs remain unchanged. Run the guarded migration runner before starting code that queries these tables. Apply the `scripts/db/provision.sql` grants phase afterward: the runtime role requires SELECT/INSERT/UPDATE/DELETE on both new tables and its existing SELECT/INSERT on `audit_logs`. Migration `0010_outbound_clicks`, if shipped in the same release, follows 0009 normally.

Migration 0009 deliberately does not rename previously published `legacy-{UUID}` records. The separate operator below requires a reviewed plan; a database backup must already exist under the normal release procedure. Both commands run in a trusted maintenance environment with migration credentials provided through `MIGRATION_DATABASE_URL`, never as a command-line credential. Plan files contain public names and identifiers and should be stored in an operator-only directory outside Git; POSIX files are created with mode 0600, and Windows requires the parent directory's protected ACL.

```sh
npx tsx scripts/db/backfill-founder-usernames.ts --database thefastestweb --actor ADMIN_ACCOUNT_UUID --plan /private/founder-usernames.json
```

This creates a new plan file without altering the database and prints only its digest and affected count. Inspect the planned public names and destinations, then apply the exact digest:

```sh
npx tsx scripts/db/backfill-founder-usernames.ts --database thefastestweb --actor ADMIN_ACCOUNT_UUID --plan /private/founder-usernames.json --confirm-digest REVIEWED_SHA256
```

The operator changes only public founders whose current username matches `legacy-{UUID}`. It derives readable names from their existing public name, assigns deterministic collision suffixes, reserves both old and new names, and writes one audit entry per changed founder attributed to the explicitly supplied, currently authorized administrator. The administrator role is locked and rechecked during apply, so revocation invalidates a pending plan. Private and custom-named profiles remain unchanged. Email-shaped public names use a generic username rather than deriving one from the address. Namespace and table locks, an exact database guard and a digest of the complete current namespace reject wrong targets, stale plans and partial application. Repeating an applied plan is rejected; a fresh dry run then reports zero remaining changes. The reviewed plan also records the original usernames for recovery analysis.

After release, verify anonymous public UUID/old-slug requests return 301 to a readable canonical page; authenticated private owners reach their profile while other accounts receive 404. Exercise a username change and confirm both old aliases resolve directly to the newest username. Verify the administrator editor's preview/confirm, stale-write rejection and disabled-rule behavior. Tests cover privacy, namespace collisions, historical-name takeover, concurrent mutations, audit/idempotency, role revocation, redirect validation and the maintenance operator's stale-plan guard.

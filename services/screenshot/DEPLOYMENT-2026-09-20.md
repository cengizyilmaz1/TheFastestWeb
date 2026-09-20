# Shared screenshot verification — 2026-09-20

## Server state

Coolify project **Shared Screenshots**, production environment, contains:

| Resource | UUID | Verified state |
| --- | --- | --- |
| Shared Screenshot Renderer | `s7lqdcebyugx1fkezughxhxy` | Gateway and isolated renderer healthy; moved from IndieTools |
| Screenshots PostgreSQL | `tu1weukuhvtaxcijit1clrf5` | PostgreSQL 18.6; dedicated ledger; restricted runtime role |
| Screenshots Redis | `s4rdhu55a9um2cuyiul7a365` | Redis 8.10.1; authenticated, AOF, noeviction |
| Shared Screenshot API and Processor | `21pk99xwl8dybauyw5sbzrzd` | Both ready; browser-free remote processor |

No screenshot, PostgreSQL or Redis host ports are published. The renderer has
only its existing backend/egress networks after reconciliation. Only the
processor joins the renderer control network, at `172.31.241.5`; the API joins
TheFastestWeb's existing private backend under `shared-screenshot-api`.

Dedicated client tokens and database credentials were generated server-side.
The renderer has neither R2 nor database credentials. The application receives
only its central client token, service URL and public media origin.
IndieTools retains its existing URL/token and web image. TheFastestWeb's running
web and worker were recreated with the same image IDs and screenshot runtime
settings; their health checks, seccomp, limits, mounts and networks were verified
unchanged. Scheduler and application databases were not changed by this cutover.
Coolify stores these settings as runtime-only variables for future releases.

## Actual provider checks

- IndieTools legacy credential: owned-site capture HTTP 200, JPEG 1440×900.
- Invalid renderer credential: 401; metadata/private address: 422.
- TheFastestWeb central credential: capture ready; unauthorized API: 401;
  private address rejected before queueing: 400.
- Sharp output downloaded from R2: WebP 1440×900, 73,664 bytes, SHA-256 matches
  the stored receipt. Public URL returned 200.
- JPEG exists in the private bucket, is absent from the public bucket (404),
  has no public URL, and its authenticated image endpoint rejects missing
  credentials (401).
- Both live TheFastestWeb web and worker read the same ready receipt through
  their configured service URL. Demo public readiness returned 200.
- Renderer socket probes could not reach the ledger database, host SSH or
  metadata address. The original browser egress guard remains in use.

The canary used the owned `www.indietools.app` site through the TheFastestWeb
tenant. A direct same-host sslip demo capture was blocked by host containment;
the firewall was not relaxed. No existing listings were bulk-captured.

New media remains in existing public/private R2 buckets, under the separate
`thefastestweb/sites/screenshots/desktop/...` namespace. Existing IndieTools
objects and publication paths were not moved. Canary objects are managed by
the central retention ledger, with a seven-day canary retention.

## Application release boundary

The 23-category vocabulary, category SEO pages, public screenshot display and
Datafast npm integration are implemented and tested in the local working tree.
They have **not** been published as a new remote application image in this
cutover. Category migration 0008 was backed up, applied and verified locally;
the remote application database still needs it with the application release.

Local port 3100 runs in demo mode. Its screenshot requests use a private SSH
tunnel; no R2 credentials are needed by the local web application. Desktop and
mobile browser tests verified the actual WebP image and that an expired image
is hidden. Synthetic local records were removed after testing.

Datafast remains disabled in demo mode. Live visitor/crawler/payment acceptance
requires the dedicated TheFastestWeb website ID/domain, payment API key and
optional bot token. IndieTools analytics identifiers were not reused.

Validation completed: 419 unit tests, all 263 integration cases (the final
privacy-contract corrections were rerun in their seven-case suite), nine
migration checks, ESLint, production Next build and worker bundle build.
The browser checks covered all 23 category routes and the authenticated Submit
form at 390/1440px. Its PageSpeed response was mocked in the browser; no real
Google OAuth or PageSpeed acceptance is claimed by that form check.

## Operational evidence and rollback

Private server-side state, original resource definitions, image IDs, client
settings and canary receipts are retained in a restricted operator directory.
They contain credentials and must never be copied into this repository.
Renderer source archive SHA-256:
`0c4bccfd9e9325cf5730712fb0759afc4e7fc8c786387e285fd86f8e7603ceda`.
Central source archive SHA-256:
`9328d9789993f9a5a7e6dbb7693611b02132fb13c50c840cc029eba053d5fe84`.
These identify reviewed workspace archives; they are not Git commit IDs.

Disable TheFastestWeb's screenshot flag before rolling back the central
service. Restore the private baseline application environment with its pinned
images, or the recorded prior renderer image if needed. Do not drop databases,
remove existing R2 objects or rotate the IndieTools legacy credential as part
of an application rollback. Scheduled backups and off-host restore policy
require a separate operational configuration; no backup schedule is claimed
by this deployment record.

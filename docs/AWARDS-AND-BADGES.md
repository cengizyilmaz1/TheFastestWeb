# Evidence-based awards and badge checks

Awards and embed verification are separate: an earned competition achievement does not prove that a site contains an embed, and a valid embed does not create a performance award.

## Award evidence

`evaluateSiteAwards` accepts a site UUID and reads the evidence itself. It considers public, active, unarchived sites and only the standardized `psi-v2-two-sample` lab methodology with at least two samples. No request accepts a client-supplied score or winner flag.

- **90+/100:** an actual complete batch reaches that threshold; one milestone per strategy.
- **Weekly/monthly winner and top ten:** a closed `ranking-v1` overall snapshot provides the position.
- **Most improved, newcomer, country/category/technology winner:** a closed snapshot supplies #1 in that explicit partition.
- **Three weekly wins:** three consecutive seven-day weekly periods, same strategy, each with an overall #1 snapshot.
- **Seven days at 90+:** the latest qualifying batch on each of seven consecutive UTC days is at least 90. Missing days break the streak; multiple tests on one day do not become multiple days.

Each record has a unique event key, references its achievement definition and stores measurement/snapshot IDs plus strategy/period evidence. A per-site transaction lock and unique event keys prevent concurrent duplicate awards. Historical batch scores and closed snapshots are not rewritten. A repeated evaluation produces no duplicate awards or notifications. Definition rows describe available rules; they are not evidence that any site earned an award.

Public award lists recheck listing visibility and use a stable award timestamp/UUID cursor. Private/archived sites return no current public award list. Earned history remains in the database. Optional badge notifications respect the user's badge preference; disabled email creates no later-send backlog. Notification creation joins the award transaction.

## Award embeds and share images

`GET /api/awards/{awardId}/embed.svg` renders a compact badge; `GET /api/awards/{awardId}/share.png` renders a 1200×630 PNG for social/OpenGraph use. Both recheck the public, active, unarchived site on every request and send `no-store`. Text-only SVG templates escape bounded database text through the shared XML helper, use no external resources, and take the score/device/period from recorded award evidence. Sharp rasterizes only that generated SVG; arbitrary user SVG is never accepted. No storage provider is needed for either GET.

An authenticated owner can explicitly publish the PNG via `POST /api/awards/{awardId}/promote` with `{ "visibility": "public" }`. The same-origin and rate-limit checks precede upload; the owner/site row stays locked against visibility changes during the upload. When storage is enabled, a public R2 bucket receives `thefastestweb/awards/{awardId}/{sha256}.png`; repeated identical content uses the same key. When disabled, the response returns the dynamic PNG URL. Public R2 promotion creates a durable public copy: hiding a site later removes dynamic access but does not erase previously published copies; deletion from R2 and downstream caches is a separate operator action. Automatic/public GET requests never promote media.

## Badge status and grace

`verifySiteBadge` defaults to **dry-run**. It returns the previous/proposed status and performs no site mutation or notification. Scheduled checks first save a completed preview job; a later scheduler tick may queue the explicit status-only application job. Failed previews do not block other sites.

Legacy Pro flags and valid account/site Pro entitlements exempt badge checks without rewriting `requires_badge`. The service checks exemption before external work and again inside the update transaction; scheduler selection uses the same scope predicate. A revoked or expired entitlement does not preserve a false permanent exemption.

A verified embed sets `verified` and clears grace. A confirmed missing embed starts a seven-day grace period; another confirmed missing result after that existing deadline sets `failed`. A DNS, HTTP or browser failure sets `temporarily_unreachable` and preserves any existing grace deadline. An invalid URL is a failed verification, never permission to remove the site. Initial unchecked sites remain `missing` until observed.

These checks **never delete history, unlist/archive a site, pause monitoring, or revoke paid/legacy access**. Grace expiry changes only badge status. Recovery returns to verified. Warning notifications are optional, honor badge preferences, and deduplicate by site/status/day. A cancelled or replaced worker lease cannot apply a late badge response. URL changes during checking discard the stale observation.

## Scheduling

The scheduler saves a daily `ranking.finalize` outbox row, which closes the immediately previous ISO week and calendar month using the immutable ranking transaction. Snapshot sites receive idempotent award jobs. Completed performance measurements enqueue award evaluation in the same measurement transaction. A bounded daily catch-up pass also covers existing eligible sites and badge previews/applications. BullMQ remains delivery only; PostgreSQL owns state, deduplication and leases.

The application implements the `rankings` and `badges` queues with `ranking.finalize`, `site.awards.evaluate` and `site.badge.verify`. External payment/email/analytics providers remain independently gated by configuration. Provider `Retry-After` values are honored up to 24 hours; screenshot polling releases its lease and does not consume a failure attempt.

## Verification

Real PostgreSQL tests cover legacy exclusion, concurrent threshold awards, notification opt-out, private projections, complete and broken streaks, closed-period evidence, cursor pagination, dry-run immutability, missing versus unreachable behavior, recovery, preview-before-application scheduling and cancellation fencing. All HTTP/browser/provider activity is mocked in these tests.

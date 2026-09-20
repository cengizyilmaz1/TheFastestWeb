# Shared screenshot deployment

The shared resource is independent of either website. It reuses the existing
IndieTools Playwright renderer and its gateway/network/firewall boundary. Moving
the Coolify project/resource does not require renaming Docker networks or
breaking IndieTools' internal `http://screenshot-worker:4173` URL.

```text
IndieTools web ────────────── legacy bearer ────┐
  └ existing review + Sharp + R2               │
                                              ▼
TheFastestWeb → central API → processor → private gateway → isolated renderer
                   │            │                              │
                   ├ PG/Redis   └ Sharp → private JPEG          └ public internet
                   │                    → public WebP
                   └ durable quotas, receipts, tenant ownership
```

The browser never joins a database, Redis, application or Coolify proxy network
and receives no R2/database credentials. The central processor has no browser.
Only it needs access to the renderer's private control network. Do not attach the
central API, database or Redis to that network merely for convenience.

## Credentials and limits

There are three separate credentials:

1. IndieTools' existing `SCREENSHOT_WORKER_TOKEN` stays unchanged. Its `/capture`
   requests continue using `Authorization: Bearer <legacy-token>`.
2. A new renderer credential belongs only to the central processor. The renderer
   gets `SCREENSHOT_WORKER_CLIENTS_JSON`, an array with `id=thefastestweb`,
   `tokenHash=SHA256(raw-token)`, `requestsPerMinute=10`, `maxConcurrent=1`.
   Generate the raw token as 32 random bytes encoded in lowercase hex. The
   central processor gets `SCREENSHOT_RENDERER_TOKEN=thefastestweb.<raw-token>`
   and `SCREENSHOT_RENDERER_URL=http://screenshot-worker:4173`.
3. A different central API credential belongs to TheFastestWeb. The central
   service gets `SCREENSHOT_CLIENTS_JSON`, with `id=thefastestweb`,
   `namespace=thefastestweb`, `tokenHash=SHA256(other-raw-token)`,
   `requestsPerMinute=10`, `requestsPerDay=250`, `allowPublic=true`.
   TheFastestWeb gets only that raw token as `SCREENSHOT_SERVICE_TOKEN`, plus
   `SCREENSHOT_CLIENT_ID=thefastestweb` and the internal central API origin as
   `SCREENSHOT_SERVICE_URL`.

Do not reuse these tokens, store plaintext in source, or expose them in browser
configuration. The renderer's small per-process rate/concurrency guard prevents
one consumer from filling its browser queue. It is not a billing counter and
resets on renderer restart. Central API daily quotas persist in PostgreSQL.
The unchanged IndieTools credential is bounded to 30 requests/minute and two
active requests. New clients default to 10/minute and one active request; both
clients still share the renderer's global two-browser ceiling.

## R2 layout and ownership

New TheFastestWeb captures use these prefixes in separate public/private buckets:

```text
thefastestweb/sites/screenshots/desktop/<capture-id>/<lease-id>/<sha256>.jpg
thefastestweb/sites/screenshots/desktop/<capture-id>/<lease-id>/<sha256>.webp
```

The JPEG goes only to `R2_PRIVATE_BUCKET`; the WebP goes to `R2_BUCKET` for a
published listing or stays private for a private capture. Only the WebP gets a
public URL. Sharp fully decodes the JPEG with a 16-million-pixel bound, strips
metadata, and encodes WebP at quality 82. Image dimensions and actual decoded
format must match the renderer response.

IndieTools retains its existing reviewed `products/<slug>/screenshots/...` and
private media paths. Do not move, list-and-delete, or rewrite those objects as
part of this cutover. Central retention deletes only keys recorded by its own
capture ledger. Prefixes are service-enforced namespaces; they are not separate
Cloudflare IAM policies. Use bucket-scoped credentials and dedicated screenshot
buckets where available. If intentionally sharing existing buckets, retain
their domains/policies and never grant wider account access just for this work.

The public media origin must use HTTPS and match TheFastestWeb's
`R2_PUBLIC_BASE_URL`; this allows the app to validate every returned image URL.
The private bucket must not have a public domain or public development URL.

## Deployment order

1. Inventory the current Coolify service, container image IDs, gateway and
   renderer network attachments, host firewall units and existing environment
   key names. Keep secret values out of logs. Move resource/project ownership
   while preserving service UUID, networks and persistent settings where the
   Coolify version permits it.
2. Build the renderer with the additional client allowlist support. Keep its
   existing Playwright version and isolated networking. Deploy only the
   renderer resource, with its legacy credential retained and new client hash
   added. The IndieTools web image does not change.
3. Provision dedicated central PostgreSQL and Redis resources. Apply
   `0001_capture_ledger.sql` as migration owner, revoke public schema `CREATE`,
   and grant a distinct runtime role only `CONNECT`, schema `USAGE` and DML on
   the four tables. Keep migration credentials out of the running containers.
   Redis needs authentication, AOF persistence and `noeviction`.
4. Build the API and `remote-worker` Docker targets. Deploy with the settings in
   [README](README.md). Attach only the processor to the existing renderer
   control network using a free address (the verified deployment uses `.5`);
   preserve gateway `172.31.241.3`,
   legacy web `172.31.241.2`, backend and egress addresses. Do not recreate
   networks while they have existing users. Coolify may attach its proxy at
   `.4`; inspect actual attachments before reserving an address. Keep automatic
   deploy disabled until post-deploy network reconciliation is in place.
5. Verify API and processor `/health/ready`, legacy and new credential capture,
   invalid credentials, private-IP/metadata refusal, and no browser access to
   application/database networks. Run one explicitly owned public-site canary
   through central capture: ready metadata must contain a private JPEG and
   namespaced public WebP. Verify the public URL's content type, bytes and
   dimensions. Do not bulk-capture existing sites as a deployment check.
6. Set TheFastestWeb screenshot service origin/token and media origin, then
   enable `SCREENSHOTS_ENABLED=true` only after the canary passes. Retain
   previous environment and image references for rollback.

## Rollback and verification record

If central capture fails, disable TheFastestWeb's screenshot flag first. Existing
public pages must remain usable. Restore only the prior renderer image and its
recorded environment if necessary; IndieTools' URL/token is unchanged throughout.
Do not roll back databases destructively or remove R2 assets.

Unit and isolated PostgreSQL/Redis tests validate credentials, client quotas,
ownership, WebP conversion, bucket visibility and durable recovery without real
R2 writes. Record actual server image digests, resource IDs and canary results in
the operator deployment report; source documentation alone is not proof that the
live resource was moved or activated.

## Coolify managed networks

Coolify 4.3.23 adds a per-resource network even when
`connect_to_docker_network=false`, and may attach its proxy to screenshot
networks. This is independent of the explicitly declared renderer networks.
Do not assume the raw Compose file is the final container network topology.

The deployment installs the scoped
[`managed-network-guard.py`](infra/managed-network-guard.py) as a root-owned
systemd oneshot with a 15-second timer. It removes only the renderer's extra
per-resource network and the proxy's screenshot-network attachments. It never
disconnects the application's web/proxy network. Docker errors fail the unit
instead of being reported as successful reconciliation.

Before any renderer restart, a host firewall must also block private, reserved,
metadata and host destinations from the renderer's temporary managed subnet.
The installed managed-subnet rules use an atomic `iptables-restore` transaction
and do not exempt established private flows. This contains that temporary
attachment while the timer reconciles it; the timer alone is not a security
boundary. Existing renderer backend/egress firewall rules remain required.
Recheck subnet addresses and rules after a network recreation or host migration.

For a configuration-only application cutover, pin the actual running image
IDs and preserve health checks, seccomp policy, labels, mounts and networks.
Change the five screenshot settings at runtime only, then recreate worker
before web with `--no-deps --no-build --pull never`. A container restart alone
does not apply environment changes. Preserve a private rollback definition;
never publish its environment or use it as a build context.

See [the verified deployment record](DEPLOYMENT-2026-09-20.md) for the actual
resource state and the separate local application release status.

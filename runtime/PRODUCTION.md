# Production routing and release evidence

The managed stack keeps PostgreSQL and Redis in their existing independent Coolify Resources. Production routing is an opt-in third Compose file; it does not add containers, publish ports, inject build secrets or alter those resources.

Use these public runtime values together:

```dotenv
DEPLOYMENT_MODE=production
TFW_PUBLIC_HOST=thefastestweb.site
SITE_URL=https://thefastestweb.site
AUTH_URL=https://thefastestweb.site
TFW_PREVIEW_HOST=tfw-demo.54.36.101.109.sslip.io
```

Retain all existing private network, seccomp, database and provider values. Enable provider flags only after their account checks pass. The application must separately suppress preview-host indexing and analytics; the overlay adds an independent `X-Robots-Tag: noindex, follow, noarchive` response header. `TFW_PREVIEW_HOST` is passed only to web, never to worker or scheduler. The preview uses the same application and database; it is not an isolated sandbox.

The build command remains unchanged and reads no runtime `.env`:

```sh
sh runtime/coolify-managed-build.sh RESOURCE_UUID
```

Opt in through the Coolify custom start command:

```sh
sh runtime/coolify-managed-start.sh RESOURCE_UUID production
```

This merges `compose.managed.yaml`, `compose.coolify.yaml`, then `compose.production.yaml`. Omitting the second argument preserves the previous demo routing with the first two files. The start wrapper uses `--no-build`; deploy the reviewed images before invoking it.

The apex serves the application over HTTPS. Its HTTP route redirects to HTTPS. Both `http://www.thefastestweb.site/...` and `https://www.thefastestweb.site/...` return a permanent 301 to the same path and query on `https://thefastestweb.site`. The preview remains on its own HTTPS host. All three HTTPS hosts use the existing `letsencrypt` resolver. Apex and www certificate issuance requires their DNS to reach this server; a prepared router does not prove certificate issuance before the DNS cutover. Check A and AAAA records together. The overlay's dollar escaping follows [Traefik RedirectRegex](https://doc.traefik.io/traefik/reference/routing-configuration/http/middlewares/redirectregex/).

## Bind source revision to running images

Image provenance is recorded through the pinned deployment and immutable Docker image IDs. No arbitrary revision build argument is accepted: a label containing a caller-supplied SHA would not prove the source used by the build, and an artifact checkout may omit `.git`.

1. Commit and push the reviewed source. Verify the local HEAD and GitHub branch resolve to the same full SHA, then pin Coolify's `git_commit_sha` to that SHA. Keep automatic deployment off during the cutover.
2. Record the Coolify deployment ID, its resolved full commit and successful build. Verify the checkout HEAD if `.git` is available. For an archive upload, record and verify the archive SHA-256 produced from that exact committed revision; never include `.env` or private operator files.
3. Record each running container's immutable image ID after deployment:

   ```sh
   docker inspect --format '{{.Image}}' RESOURCE_UUID-web-1
   docker inspect --format '{{.Image}}' RESOURCE_UUID-worker-1
   docker inspect --format '{{.Image}}' RESOURCE_UUID-scheduler-1
   ```

4. Match those image IDs to the images from that successful build and retain the mapping with the deployment evidence. Locally built images may have no registry `RepoDigests`; their `sha256:` image IDs still identify the exact immutable image configuration and layers. A mutable image tag alone is insufficient evidence.
5. Verify web/worker/scheduler readiness and record the observed canonical redirect, preview noindex header and production HTTPS response. Only then report that local Git, GitHub, the selected deployment source and running images match.

Keep rollback image IDs and runtime snapshots privately. Do not recreate databases, delete volumes or replace historical records to change routing.

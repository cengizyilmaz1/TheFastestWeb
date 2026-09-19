# Coolify raw Compose deployment

Two supported manifests share the routing overlay `compose.coolify.yaml`. Use `compose.managed.yaml` when PostgreSQL and Redis are independent Coolify Resources; retain `compose.yaml` for the complete five-service stack. The application resource UUID remains the stable Compose project name and external proxy network. Neither path publishes database/cache ports on the host.

## Independent PostgreSQL and Redis Resources

Create the native resources stopped, in the same project/environment and on a destination that uses the private backend network. Pin compatible database images. For an existing installation, preserve its exact PostgreSQL and Redis volumes, credentials, PostgreSQL data-directory layout and Redis persistence configuration. In the inspected Coolify 4.3.23, the storage API can PATCH the generated default storage's `name` and `mount_path` to reuse an existing named volume. Creating an additional storage prefixes its name and does not accomplish this. There is no supported adoption of an existing running container: the new resource runs a new container named after its resource UUID.

Before switching, verify backups, pause application writers and stop the original data containers. Never run both database processes against the same volume. Preserve the old Compose configuration, private runtime environment and immutable image IDs for rollback; do not use volume deletion, `down -v` or orphan cleanup. Coolify 4.3.23 removes old containers carrying the application's label before deployment, including stopped data containers, so rollback must be able to recreate them from the retained configuration and volumes. Disable their restart policies during cutover. New resource creation does not rotate passwords inside an existing PostgreSQL data directory. Keep the application database role least-privileged; PostgreSQL administrator credentials stay with the database resource.

Configure the application with `docker_compose_location=/compose.managed.yaml` and the common raw-mode settings below. Required network settings:

- `TFW_COOLIFY_NETWORK`: supplied by the wrappers from the application resource UUID; this is the external Traefik network.
- `TFW_BACKEND_NETWORK`: the existing private Docker network registered as the native resources' destination. The managed manifest declares it external and cannot create or remove it.
- `DATABASE_URL` and `REDIS_URL`: authenticated runtime connection strings using the new native resource hostnames on that network. Do not leave old Compose service-name aliases in them.
- `TFW_PUBLIC_HOST`, `SITE_URL` and `AUTH_URL`: the matching public host and HTTPS origin.

The application no longer receives or requires `POSTGRES_ADMIN_PASSWORD` or a separate `REDIS_PASSWORD`. Its authenticated `REDIS_URL` remains a runtime secret. Keep native database administration secrets separate from application credentials.

Custom build/start commands:

```sh
sh runtime/coolify-managed-build.sh RESOURCE_UUID
sh runtime/coolify-managed-start.sh RESOURCE_UUID
```

The build accepts optional `web`, `worker` or `scheduler` selectors, reads no runtime `.env` (`--env-file /dev/null`) and supplies inert parser inputs. The start command consumes the Coolify runtime `.env` without shell-sourcing it, refuses builds, and starts only the three application processes. It does not start, stop, delete or redeploy the separate database resources. Database health must be established before starting the application; process readiness checks both dependencies continuously. `SCHEDULER_ENABLED=false` retains durable-job dispatch while recurring scheduled tasks remain disabled.

Managed process limits are web 1 GiB / 2 CPUs / 512 PIDs, worker 2 GiB / 2 CPUs / 512 PIDs, scheduler 384 MiB / 0.5 CPU / 128 PIDs. Container JSON logs rotate at 10 MB with three retained files. Existing health checks and 30-second web / 160-second background shutdown grace periods remain. Web and worker drop all capabilities, prohibit privilege escalation, and use the reviewed Chromium seccomp profile at the artifact-absolute path exported by the wrappers. Chromium's own sandbox remains enabled; neither privileged containers nor an unconfined seccomp profile is required. The checked-in profile targets amd64; see the [sandbox verification and restrictions](../runtime/CHROMIUM_SANDBOX.md) before changing architecture or host policy.

The inspected Coolify proxy automatically joins networks used by managed containers, including private backend networks. A dedicated backend prevents membership by unrelated application containers, but does not exclude Coolify's proxy. Keep database ports unpublished and authenticated; do not describe this as isolation from the host's management plane.

Native PostgreSQL Resources support scheduled logical backups. Configure a valid schedule and retention, trigger a backup, check its completed execution, and verify restoration. Local backup files alone do not provide offsite recovery; configure an authorized private S3-compatible destination separately. Preserve Redis AOF, `appendfsync everysec`, bounded `maxmemory` and `noeviction`; verify authenticated PONG and application readiness after cutover.

## Five-service stack and common raw-mode settings

Configure these supported application settings through Coolify:

- `build_pack=dockercompose`, `docker_compose_location=/compose.yaml` for the five-service stack, or `/compose.managed.yaml` for independent database Resources.
- `is_raw_compose_deployment_enabled=true`.
- `inject_build_args_to_dockerfile=false`.
- Keep all real credentials runtime-only. Set `TFW_PUBLIC_HOST` to the public hostname without a scheme, slash or port; align `SITE_URL` and `AUTH_URL` with its HTTPS origin.
- Pin `git_commit_sha` to the reviewed release. Keep automatic deployment disabled during migration.

The normal parser in the inspected Coolify 4.3.23 adds the entire application `.env` to every service. Raw mode preserves each service's explicit environment, so web and workers do not inherit the PostgreSQL administrator password. It also avoids automatic changes to the reviewed Dockerfile. A separate per-service loop in this Coolify version repeatedly rewrote the shared multi-stage Dockerfile until a shell argument exceeded the OS limit; disabling ARG injection skips that routine.

For initial infrastructure only, set the following custom commands, replacing the non-secret resource UUID argument:

```sh
sh runtime/coolify-build.sh RESOURCE_UUID redis
sh runtime/coolify-start.sh RESOURCE_UUID infra
```

Wait for PostgreSQL and Redis readiness. Provision roles, restore the reviewed private backup into the empty managed database, run the matching migration image, verify historical integrity and grant runtime permissions before enabling application writers. Follow [MIGRATION.md](MIGRATION.md).

For the complete application after those checks:

```sh
sh runtime/coolify-build.sh RESOURCE_UUID
sh runtime/coolify-start.sh RESOURCE_UUID app
```

The build wrapper reads no runtime `.env`. It supplies explicit inert values solely because Compose interpolates all services' required variables during a build, even when only Redis is selected. Those values are neither application defaults nor build arguments, and they cannot replace the runtime environment. The start wrapper reads the actual Coolify-generated runtime file without shell-sourcing it, uses explicit artifact-relative paths, and refuses automatic builds. This avoids a raw/custom-start path mismatch where Coolify otherwise injects a host `.env` path into its builder container. Short wrapper commands also stay within Coolify's 255-character custom-command storage limit.

The overlay routes only web port 3000 through Traefik. HTTP redirects to HTTPS; the HTTPS router uses the existing `letsencrypt` certificate resolver. The inspected proxy exposes `http`/`https` entrypoints and connects to the resource UUID network. Verify those names if deploying to a different server. PostgreSQL, Redis, worker and scheduler explicitly disable Traefik discovery. These are standard [Traefik Docker routing labels](https://doc.traefik.io/traefik/master/reference/routing-configuration/other-providers/docker/).

Check actual container environment **key names** after deployment: PostgreSQL should receive its database initialization settings, Redis its password/memory settings, and web/worker/scheduler their explicit manifest entries. Never print environment values or copy the runtime file into a source repository/build context. Confirm no `env_file` appeared in the effective service configuration, backend networking remains private (the all-in-one manifest creates an internal network; managed mode reuses the verified external network), existing data volumes are unchanged and the app connects with its least-privilege role before accepting traffic.

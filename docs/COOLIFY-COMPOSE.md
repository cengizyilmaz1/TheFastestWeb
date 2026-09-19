# Coolify raw Compose deployment

Use the repository's `compose.yaml` with `compose.coolify.yaml` through the checked-in wrappers. The application resource UUID is the stable Compose project name and external proxy network. PostgreSQL/Redis volumes keep that project prefix across deployments. No database/cache port is published on the host.

Configure these supported application settings through Coolify:

- `build_pack=dockercompose`, `docker_compose_location=/compose.yaml`.
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

Check actual container environment **key names** after deployment: PostgreSQL should receive its database initialization settings, Redis its password/memory settings, and web/worker/scheduler their explicit manifest entries. Never print environment values or copy the runtime file into a source repository/build context. Confirm no `env_file` appeared in the effective service configuration, backend networking remains internal, managed volumes are unchanged and the app connects with `tfw_app` before accepting traffic.

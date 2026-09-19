#!/bin/sh
set -eu

project=${1:?Pass the Coolify application resource UUID}
shift
case "$project" in ''|*[!a-z0-9]*) echo 'Invalid Coolify resource UUID' >&2; exit 1 ;; esac
[ "${#project}" -ge 12 ] && [ "${#project}" -le 63 ] || exit 1
for service in "$@"; do
  case "$service" in web|worker|scheduler) ;; *) echo 'Unknown managed build service' >&2; exit 1 ;; esac
done

repository=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
# Parser inputs only. No runtime .env, database administrator credentials or
# Redis password is read or required to build the application images.
export AUTH_SECRET=build-only DATABASE_URL=postgresql://build-only REDIS_URL=redis://build-only
export TFW_PUBLIC_HOST=build.example.invalid TFW_COOLIFY_NETWORK="$project"
export TFW_BACKEND_NETWORK="${project}_backend"
export TFW_CHROMIUM_SECCOMP_PROFILE="$repository/runtime/chromium-seccomp.json"
exec docker compose --env-file /dev/null --project-directory "$repository" -p "$project" \
  -f "$repository/compose.managed.yaml" -f "$repository/compose.coolify.yaml" build "$@"

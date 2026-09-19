#!/bin/sh
set -eu

project=${1:?Pass the Coolify application resource UUID}
shift
case "$project" in ''|*[!a-z0-9]*) echo 'Invalid Coolify resource UUID' >&2; exit 1 ;; esac
[ "${#project}" -ge 12 ] && [ "${#project}" -le 63 ] || exit 1
for service in "$@"; do
  case "$service" in redis|web|worker|scheduler) ;; *) echo 'Unknown build service' >&2; exit 1 ;; esac
done

repository=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
# Compose parses required runtime substitutions even for `build redis`. These
# inert values are only parser inputs; no runtime .env or secret is read here.
export POSTGRES_ADMIN_PASSWORD=build-only REDIS_PASSWORD=build-only AUTH_SECRET=build-only
export DATABASE_URL=postgresql://build-only REDIS_URL=redis://build-only
export TFW_PUBLIC_HOST=build.example.invalid TFW_COOLIFY_NETWORK="$project"
exec docker compose --env-file /dev/null --project-directory "$repository" -p "$project" \
  -f "$repository/compose.yaml" -f "$repository/compose.coolify.yaml" build "$@"

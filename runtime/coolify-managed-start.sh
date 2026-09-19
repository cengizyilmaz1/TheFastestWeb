#!/bin/sh
set -eu

project=${1:?Pass the Coolify application resource UUID}
[ "$#" -eq 1 ] || exit 1
case "$project" in ''|*[!a-z0-9]*) echo 'Invalid Coolify resource UUID' >&2; exit 1 ;; esac
[ "${#project}" -ge 12 ] && [ "${#project}" -le 63 ] || exit 1
repository=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
[ -f "$repository/.env" ] || { echo 'Coolify runtime environment file is missing' >&2; exit 1; }
export TFW_COOLIFY_NETWORK="$project"
export TFW_CHROMIUM_SECCOMP_PROFILE="$repository/runtime/chromium-seccomp.json"
[ -f "$TFW_CHROMIUM_SECCOMP_PROFILE" ] || { echo 'Chromium seccomp profile is missing' >&2; exit 1; }
# The managed database resources and their external backend network must already
# be ready. This command does not alter managed database lifecycles. Coolify can
# remove old application-labelled containers before invoking this wrapper; keep
# their configuration, image IDs and volumes for recreate-based rollback.
exec docker compose --env-file "$repository/.env" --project-directory "$repository" -p "$project" \
  -f "$repository/compose.managed.yaml" -f "$repository/compose.coolify.yaml" up -d --no-build web worker scheduler

#!/bin/sh
set -eu

project=${1:?Pass the Coolify application resource UUID}
mode=${2:?Choose infra or app}
[ "$#" -eq 2 ] || exit 1
case "$project" in ''|*[!a-z0-9]*) echo 'Invalid Coolify resource UUID' >&2; exit 1 ;; esac
[ "${#project}" -ge 12 ] && [ "${#project}" -le 63 ] || exit 1
case "$mode" in infra|app) ;; *) echo 'Choose infra or app' >&2; exit 1 ;; esac
repository=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
[ -f "$repository/.env" ] || { echo 'Coolify runtime environment file is missing' >&2; exit 1; }
export TFW_COOLIFY_NETWORK="$project"
if [ "$mode" = infra ]; then
  # No web container or public router is started during private DB preparation.
  export TFW_PUBLIC_HOST=unrouted.example.invalid
  set -- postgres redis
else
  set -- postgres redis web worker scheduler
fi
exec docker compose --env-file "$repository/.env" --project-directory "$repository" -p "$project" \
  -f "$repository/compose.yaml" -f "$repository/compose.coolify.yaml" up -d --no-build "$@"

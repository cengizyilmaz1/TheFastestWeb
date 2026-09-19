#!/bin/sh
set -eu

# Keep the password out of argv and Redis startup output. Hex is URL/config safe.
case "${REDIS_PASSWORD:-}" in
  ''|*[!a-fA-F0-9]*) echo 'Redis requires a hexadecimal REDIS_PASSWORD.' >&2; exit 1 ;;
esac
if [ "${#REDIS_PASSWORD}" -lt 64 ]; then
  echo 'REDIS_PASSWORD must contain at least 64 hexadecimal characters.' >&2
  exit 1
fi
redis_memory="${REDIS_MAXMEMORY_MB:-256}"
case "$redis_memory" in
  ''|*[!0-9]*) echo 'REDIS_MAXMEMORY_MB must be an integer.' >&2; exit 1 ;;
esac
if [ "$redis_memory" -lt 32 ] || [ "$redis_memory" -gt 8192 ]; then
  echo 'REDIS_MAXMEMORY_MB must be between 32 and 8192.' >&2
  exit 1
fi

umask 077
redis_config="$(mktemp /tmp/tfw-redis.XXXXXX)"
cat > "$redis_config" <<EOF
bind 0.0.0.0
protected-mode yes
port 6379
requirepass "$REDIS_PASSWORD"
dir /data
appendonly yes
appendfsync everysec
no-appendfsync-on-rewrite no
maxmemory ${redis_memory}mb
maxmemory-policy noeviction
save ""
EOF
chown redis:redis "$redis_config"
exec /usr/local/bin/docker-entrypoint.sh redis-server "$redis_config"

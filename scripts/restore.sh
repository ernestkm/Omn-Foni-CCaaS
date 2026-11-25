#!/usr/bin/env bash
set -euo pipefail

dump="${1:-}"
if [[ -z "$dump" ]]; then
  echo "usage: CONFIRM_RESTORE=1 scripts/restore.sh <dump-file>" >&2
  exit 1
fi
if [[ "${CONFIRM_RESTORE:-}" != "1" ]]; then
  echo "restore: refused; set CONFIRM_RESTORE=1 to confirm" >&2
  exit 1
fi
if [[ ! -f "$dump" ]]; then
  echo "restore: dump file not found: $dump" >&2
  exit 1
fi
url="${ADMIN_DATABASE_URL:-${DATABASE_URL:-}}"
if [[ -z "$url" ]]; then
  echo "restore: set ADMIN_DATABASE_URL or DATABASE_URL" >&2
  exit 1
fi

echo "restore: running pg_restore --clean --if-exists with $dump"
pg_restore --clean --if-exists --exit-on-error --dbname="$url" "$dump"
echo "restore: complete ($dump)"

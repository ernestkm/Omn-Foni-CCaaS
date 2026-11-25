#!/usr/bin/env bash
set -euo pipefail

url="${ADMIN_DATABASE_URL:-${DATABASE_URL:-}}"
if [[ -z "$url" ]]; then
  echo "backup: set ADMIN_DATABASE_URL or DATABASE_URL" >&2
  exit 1
fi

dir="${BACKUP_DIR:-./backups}"
mkdir -p "$dir"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="$dir/backup-$stamp.dump"
tmp="$out.partial"
trap 'rm -f "$tmp"' EXIT

pg_dump --format=custom --file="$tmp" "$url"
if [[ ! -s "$tmp" ]]; then
  echo "backup: pg_dump produced an empty file; aborting" >&2
  exit 1
fi
mv "$tmp" "$out"
trap - EXIT

echo "backup: wrote $out"

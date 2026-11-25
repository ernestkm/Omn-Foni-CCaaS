#!/bin/sh
set -eu
umask 077

: "${KEYCLOAK_ADMIN_USERNAME:?KEYCLOAK_ADMIN_USERNAME is required}"
: "${KEYCLOAK_ADMIN_PASSWORD:?KEYCLOAK_ADMIN_PASSWORD is required}"
: "${AGENT_PASSWORD:?AGENT_PASSWORD is required}"
: "${ADMIN_PASSWORD:?ADMIN_PASSWORD is required}"
: "${PUBLIC_BASE_URL:?PUBLIC_BASE_URL is required}"

require_safe() {
  label=$1
  value=$2
  case "$value" in
    ''|*[!A-Za-z0-9_.-]*)
      echo "$label must be non-empty and match [A-Za-z0-9_.-]" >&2
      exit 1
      ;;
  esac
}

require_safe KEYCLOAK_ADMIN_USERNAME "$KEYCLOAK_ADMIN_USERNAME"
require_safe KEYCLOAK_ADMIN_PASSWORD "$KEYCLOAK_ADMIN_PASSWORD"
require_safe AGENT_PASSWORD "$AGENT_PASSWORD"
require_safe ADMIN_PASSWORD "$ADMIN_PASSWORD"

case "$PUBLIC_BASE_URL" in
  http://*|https://*) ;;
  *) echo "PUBLIC_BASE_URL must start with http:// or https://" >&2; exit 1 ;;
esac
case "$PUBLIC_BASE_URL" in
  */) echo "PUBLIC_BASE_URL must not end with /" >&2; exit 1 ;;
esac

export KC_BOOTSTRAP_ADMIN_USERNAME="$KEYCLOAK_ADMIN_USERNAME"
export KC_BOOTSTRAP_ADMIN_PASSWORD="$KEYCLOAK_ADMIN_PASSWORD"

template=${REALM_TEMPLATE:-/opt/keycloak/bin/realm-prod.json.template}
output=${REALM_OUTPUT:-/opt/keycloak/data/import/realm-prod.json}

test -f "$template" || { echo "realm template not found: $template" >&2; exit 1; }
mkdir -p "$(dirname "$output")"

sed_escape() {
  printf '%s' "$1" | sed 's/[\\&|]/\\&/g'
}

admin_user=$(sed_escape "$KEYCLOAK_ADMIN_USERNAME")
admin_pass=$(sed_escape "$KEYCLOAK_ADMIN_PASSWORD")
agent_pass=$(sed_escape "$AGENT_PASSWORD")
realm_admin_pass=$(sed_escape "$ADMIN_PASSWORD")
base_url=$(sed_escape "$PUBLIC_BASE_URL")

sed \
  -e "s|__KEYCLOAK_ADMIN_USERNAME__|$admin_user|g" \
  -e "s|__KEYCLOAK_ADMIN_PASSWORD__|$admin_pass|g" \
  -e "s|__AGENT_PASSWORD__|$agent_pass|g" \
  -e "s|__ADMIN_PASSWORD__|$realm_admin_pass|g" \
  -e "s|__PUBLIC_BASE_URL__|$base_url|g" \
  "$template" > "$output"

for placeholder in \
  __KEYCLOAK_ADMIN_USERNAME__ \
  __KEYCLOAK_ADMIN_PASSWORD__ \
  __AGENT_PASSWORD__ \
  __ADMIN_PASSWORD__ \
  __PUBLIC_BASE_URL__
do
  if grep -Fq "$placeholder" "$output"; then
    echo "unrendered placeholder in $output: $placeholder" >&2
    exit 1
  fi
done

exec /opt/keycloak/bin/kc.sh "$@"

#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/thecistus-homepage.env}"
EXPECTED_ENV_OWNER_GROUP="${EXPECTED_ENV_OWNER_GROUP:-root:www-data}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_FILE="${SERVICE_FILE:-$SCRIPT_DIR/thecistus-homepage.service}"
REQUIRED_KEYS=(
  PORT
  HOST
  APP_DATA_DIR
  ADMIN_EMAIL
  SMTP_HOST
  SMTP_PORT
  SMTP_SECURE
  SMTP_USER
  SMTP_PASS
  SMTP_FROM
  CSRF_ALLOWED_ORIGINS
)

if [ -L "$ENV_FILE" ]; then
  echo "[env-check] environment file must not be a symlink: $ENV_FILE" >&2
  exit 1
fi

if [ ! -r "$ENV_FILE" ]; then
  echo "[env-check] missing or unreadable environment file: $ENV_FILE" >&2
  exit 1
fi

mode="$(stat -c '%a' "$ENV_FILE" 2>/dev/null || stat -f '%Lp' "$ENV_FILE")"
case "$mode" in
  600|640|400|440) ;;
  *)
    echo "[env-check] unsafe permissions for $ENV_FILE: $mode" >&2
    exit 1
    ;;
esac

if [ "$ENV_FILE" = "/etc/thecistus-homepage.env" ]; then
  owner_group="$(stat -c '%U:%G' "$ENV_FILE" 2>/dev/null || stat -f '%Su:%Sg' "$ENV_FILE")"
  if [ "$owner_group" != "$EXPECTED_ENV_OWNER_GROUP" ]; then
    echo "[env-check] unexpected owner/group for $ENV_FILE: $owner_group" >&2
    exit 1
  fi

  if [ ! -r "$SERVICE_FILE" ]; then
    echo "[env-check] missing service file for EnvironmentFile check: $SERVICE_FILE" >&2
    exit 1
  fi

  if ! grep -Fxq "EnvironmentFile=/etc/thecistus-homepage.env" "$SERVICE_FILE"; then
    echo "[env-check] systemd unit must require /etc/thecistus-homepage.env" >&2
    exit 1
  fi
fi

for key in "${REQUIRED_KEYS[@]}"; do
  matches="$(grep -E "^[[:space:]]*${key}=" "$ENV_FILE" || true)"
  count="$(printf '%s\n' "$matches" | sed '/^$/d' | wc -l | tr -d ' ')"
  if [ "${count:-0}" -lt 1 ]; then
    echo "[env-check] missing key: $key" >&2
    exit 1
  fi
  if [ "$count" -gt 1 ]; then
    echo "[env-check] duplicate key: $key" >&2
    exit 1
  fi
  value="$(printf '%s\n' "$matches" | sed -E "s/^[[:space:]]*${key}=//; s/^[[:space:]]+//; s/[[:space:]]+$//")"
  if [ -z "$value" ] || [ "$value" = "''" ] || [ "$value" = '""' ]; then
    echo "[env-check] empty value for key: $key" >&2
    exit 1
  fi
done

if ! grep -Eq '^[[:space:]]*HOST=127\.0\.0\.1[[:space:]]*$' "$ENV_FILE"; then
  echo "[env-check] HOST should be 127.0.0.1" >&2
  exit 1
fi

if ! grep -Eq '^[[:space:]]*PORT=4173[[:space:]]*$' "$ENV_FILE"; then
  echo "[env-check] PORT should be 4173" >&2
  exit 1
fi

if grep -Eq '^[[:space:]]*APP_DATA_DIR=/var/www($|/)' "$ENV_FILE"; then
  echo "[env-check] APP_DATA_DIR must not point inside the web root" >&2
  exit 1
fi

if ! grep -Eq '^[[:space:]]*APP_DATA_DIR=/var/lib/thecistus[[:space:]]*$' "$ENV_FILE"; then
  echo "[env-check] APP_DATA_DIR should be /var/lib/thecistus" >&2
  exit 1
fi

app_data_dir="$(grep -E '^[[:space:]]*APP_DATA_DIR=' "$ENV_FILE" | sed -E 's/^[[:space:]]*APP_DATA_DIR=//; s/^[[:space:]]+//; s/[[:space:]]+$//')"
for key in CONTENT_PATH COMMENTS_PATH AUTH_PATH; do
  matches="$(grep -E "^[[:space:]]*${key}=" "$ENV_FILE" || true)"
  count="$(printf '%s\n' "$matches" | sed '/^$/d' | wc -l | tr -d ' ')"
  if [ "${count:-0}" -eq 0 ]; then
    continue
  fi
  if [ "$count" -gt 1 ]; then
    echo "[env-check] duplicate key: $key" >&2
    exit 1
  fi
  value="$(printf '%s\n' "$matches" | sed -E "s/^[[:space:]]*${key}=//; s/^[[:space:]]+//; s/[[:space:]]+$//")"
  if [ -z "$value" ] || [ "$value" = "''" ] || [ "$value" = '""' ]; then
    echo "[env-check] empty value for key: $key" >&2
    exit 1
  fi
  if [[ "$value" != "$app_data_dir"/* ]]; then
    echo "[env-check] $key must be inside APP_DATA_DIR" >&2
    exit 1
  fi
  if [[ "$value" == /var/www || "$value" == /var/www/* ]]; then
    echo "[env-check] $key must not point inside the web root" >&2
    exit 1
  fi
done

echo "[env-check] ok: required keys, permissions, ownership policy, and safe path are present; values were not printed"

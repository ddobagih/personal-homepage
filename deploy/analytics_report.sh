#!/usr/bin/env bash
set -euo pipefail

LOG_FILE="${1:-/var/log/nginx/thecistus.analytics.log}"

if [[ ! -f "$LOG_FILE" ]]; then
  echo "analytics log not found: $LOG_FILE" >&2
  exit 1
fi

echo "== Top Pages =="
awk -F 'page=' '/name=page_view/ {split($2,a,"&"); print a[1]}' "$LOG_FILE" | sort | uniq -c | sort -nr
echo
echo "== Top Events =="
awk -F 'name=' '/type=event/ {split($2,a,"&"); print a[1]}' "$LOG_FILE" | sort | uniq -c | sort -nr

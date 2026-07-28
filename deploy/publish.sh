#!/usr/bin/env bash
set -euo pipefail

if [ "${ALLOW_LEGACY_STATIC_PUBLISH:-0}" != "1" ]; then
  echo "legacy static publish is disabled; use deploy/publish_node_app.sh for the Node app" >&2
  echo "set ALLOW_LEGACY_STATIC_PUBLISH=1 only after operator confirmation" >&2
  exit 2
fi

DEST="${1:-/var/www/thecistus.com/current}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

mkdir -p "$DEST"

rsync -av --delete \
  "$ROOT_DIR/index.html" \
  "$ROOT_DIR/site.html" \
  "$ROOT_DIR/robots.txt" \
  "$ROOT_DIR/sitemap.xml" \
  "$ROOT_DIR/assets" \
  "$DEST/"

echo "published legacy static files to $DEST"

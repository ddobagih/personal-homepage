#!/usr/bin/env bash
set -euo pipefail

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

echo "published to $DEST"

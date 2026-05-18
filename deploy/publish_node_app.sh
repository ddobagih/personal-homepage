#!/usr/bin/env bash
set -euo pipefail

DEST="${1:-/var/www/thecistus.com/current}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

mkdir -p "$DEST"
mkdir -p "$DEST/data"

rsync -av --delete \
  "$ROOT_DIR/index.html" \
  "$ROOT_DIR/site.html" \
  "$ROOT_DIR/robots.txt" \
  "$ROOT_DIR/sitemap.xml" \
  "$ROOT_DIR/server.js" \
  "$ROOT_DIR/package.json" \
  "$ROOT_DIR/package-lock.json" \
  "$ROOT_DIR/assets" \
  "$ROOT_DIR/deploy" \
  "$ROOT_DIR/scripts" \
  "$DEST/"

rsync -av \
  "$ROOT_DIR/data/default-content.json" \
  "$ROOT_DIR/data/admin-auth.json" \
  "$DEST/data/"

echo "node app published to $DEST"
echo "next:"
echo "  cd $DEST && npm ci --omit=dev"
echo "  ensure APP_DATA_DIR points to external runtime storage"
echo "  sudo systemctl restart thecistus-homepage"

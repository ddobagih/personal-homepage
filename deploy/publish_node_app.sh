#!/usr/bin/env bash
set -euo pipefail

DEST="${1:-/var/www/thecistus.com/current}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DRY_RUN="${DRY_RUN:-0}"

if [ "$DRY_RUN" = "1" ]; then
  if [ ! -d "$DEST" ]; then
    echo "dry-run destination must already exist so this script does not create directories: $DEST" >&2
    exit 2
  fi
else
  mkdir -p "$DEST"
fi

DEST_ABS="$(cd "$DEST" && pwd -P)"
ROOT_ABS="$(cd "$ROOT_DIR" && pwd -P)"

if [ "$DEST_ABS" = "/" ] || [ "$DEST_ABS" = "$ROOT_ABS" ] || [[ "$DEST_ABS" == "$ROOT_ABS"/* ]]; then
  echo "refusing to publish into an unsafe destination: $DEST_ABS" >&2
  exit 2
fi

if [ "$DRY_RUN" != "1" ]; then
  mkdir -p "$DEST_ABS/data"
elif [ ! -d "$DEST_ABS/data" ]; then
  echo "dry-run destination data directory must already exist so this script does not create directories: $DEST_ABS/data" >&2
  exit 2
fi

staging_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$staging_dir"
}
trap cleanup EXIT
mkdir -p "$staging_dir/data"

rsync -a \
  "$ROOT_DIR/index.html" \
  "$ROOT_DIR/site.html" \
  "$ROOT_DIR/robots.txt" \
  "$ROOT_DIR/sitemap.xml" \
  "$ROOT_DIR/server.js" \
  "$ROOT_DIR/content-store.js" \
  "$ROOT_DIR/package.json" \
  "$ROOT_DIR/package-lock.json" \
  "$ROOT_DIR/assets" \
  "$staging_dir/"

rsync -a \
  "$ROOT_DIR/data/default-content.json" \
  "$ROOT_DIR/data/admin-auth.json" \
  "$staging_dir/data/"

rsync_flags=(-av --delete)
if [ "$DRY_RUN" = "1" ]; then
  rsync_flags+=(--dry-run --itemize-changes)
  echo "dry-run: showing changes for $DEST_ABS"
fi

rsync "${rsync_flags[@]}" "$staging_dir/" "$DEST_ABS/"

if [ "$DRY_RUN" = "1" ]; then
  echo "dry-run complete; no destination files changed and no destination directories created"
else
  echo "node app published to $DEST_ABS"
fi

echo "next:"
echo "  before publishing, run from the source checkout: npm run preflight"
echo "  cd $DEST_ABS && npm ci --omit=dev"
echo "  put secrets in /etc/thecistus-homepage.env, not under $DEST_ABS"
echo "  ensure APP_DATA_DIR points to external runtime storage"
echo "  after operator confirmation: sudo systemctl restart thecistus-homepage"

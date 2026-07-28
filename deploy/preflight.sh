#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "[preflight] syntax check"
node --check server.js
node --check content-store.js
node --check assets/js/core.js
node --check assets/js/cosmos.js
node --check assets/site.js
bash -n deploy/*.sh

echo "[preflight] html parse smoke test"
python3 - <<'PY'
from html.parser import HTMLParser
from pathlib import Path
for name in ("index.html", "site.html"):
    parser = HTMLParser()
    parser.feed(Path(name).read_text(encoding="utf-8"))
PY

echo "[preflight] tests"
test_count="$(find test -name '*.test.js' -type f | wc -l | tr -d ' ')"
if [ "${test_count:-0}" -lt 1 ]; then
  echo "[preflight] no test files found" >&2
  exit 1
fi
npm test -- --test-reporter=spec

echo "[preflight] publish artifact dry-run"
tmp_dest="$(mktemp -d)"
trap 'rm -rf "$tmp_dest"' EXIT
bash deploy/publish_node_app.sh "$tmp_dest" >/dev/null
test -f "$tmp_dest/server.js"
test -f "$tmp_dest/content-store.js"
test -f "$tmp_dest/package.json"
test -f "$tmp_dest/package-lock.json"
test -d "$tmp_dest/assets"
test ! -e "$tmp_dest/deploy"
test ! -e "$tmp_dest/scripts"
test ! -e "$tmp_dest/test"
test ! -e "$tmp_dest/.env"
test ! -e "$tmp_dest/data/content.json"
test ! -e "$tmp_dest/data/comments.json"
test ! -e "$tmp_dest/homepage-critical-feedback.html"
test ! -e "$tmp_dest/daylog"

if [ "${RUN_NPM_AUDIT:-1}" = "1" ]; then
  echo "[preflight] dependency audit"
  npm audit --omit=dev
else
  echo "[preflight] dependency audit skipped (RUN_NPM_AUDIT=0)"
fi

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[preflight] whitespace check"
  git diff --check
fi

echo "[preflight] ok"

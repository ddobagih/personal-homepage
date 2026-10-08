#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:4173}"
CONNECT_TIMEOUT="${CONNECT_TIMEOUT:-3}"
MAX_TIME="${MAX_TIME:-10}"
PRIVATE_PATHS=(
  "/.env"
  "/server.js"
  "/content-store.js"
  "/editor-draft-store.js"
  "/notion-store.js"
  "/notion-content.js"
  "/admin-src/"
  "/data/notion-documents.json"
  "/data/notion-uploads/"
  "/data/notion-backups/"
  "/data/editor-drafts.json"
  "/package.json"
  "/package-lock.json"
  "/deploy/"
  "/scripts/"
  "/test/"
  "/data/admin-auth.json"
  "/homepage-critical-feedback.html"
  "/daylog/"
)
TMP_FILES=()

cleanup() {
  if [ "${#TMP_FILES[@]}" -gt 0 ]; then
    rm -f "${TMP_FILES[@]}"
  fi
}
trap cleanup EXIT

url_for() {
  local path="$1"
  printf '%s%s' "${BASE_URL%/}" "$path"
}

status_code() {
  local url="$1"
  curl -sS --connect-timeout "$CONNECT_TIMEOUT" --max-time "$MAX_TIME" -o /dev/null -w '%{http_code}' "$url"
}

expect_status() {
  local path="$1"
  local expected="$2"
  local actual
  if ! actual="$(status_code "$(url_for "$path")")"; then
    echo "[smoke] ${path}: request failed" >&2
    exit 1
  fi
  if [ "$actual" != "$expected" ]; then
    echo "[smoke] ${path}: expected ${expected}, got ${actual}" >&2
    exit 1
  fi
}

fetch_json() {
  local path="$1"
  local expected="$2"
  local output_file="$3"
  local actual
  if ! actual="$(curl -sS --connect-timeout "$CONNECT_TIMEOUT" --max-time "$MAX_TIME" -o "$output_file" -w '%{http_code}' "$(url_for "$path")")"; then
    echo "[smoke] ${path}: request failed" >&2
    exit 1
  fi
  if [ "$actual" != "$expected" ]; then
    echo "[smoke] ${path}: expected ${expected}, got ${actual}" >&2
    exit 1
  fi
}

expect_not_2xx() {
  local path="$1"
  local actual
  if ! actual="$(status_code "$(url_for "$path")")"; then
    echo "[smoke] ${path}: request failed" >&2
    exit 1
  fi
  if [[ "$actual" =~ ^2[0-9][0-9]$ ]]; then
    echo "[smoke] ${path}: expected non-2xx, got ${actual}" >&2
    exit 1
  fi
}

content_body="$(mktemp)"
TMP_FILES+=("$content_body")

expect_status "/healthz" "200"
fetch_json "/api/content" "200" "$content_body"
node - "$content_body" <<'NODE'
const fs = require("node:fs");
const file = process.argv[2];
let payload;
try {
  payload = JSON.parse(fs.readFileSync(file, "utf8"));
} catch {
  console.error("[smoke] /api/content: invalid JSON response");
  process.exit(1);
}
const forbidden = new Set(["status", "previousStatus", "deletedAt"]);
function walk(value, trail = []) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) walk(item, trail);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.has(key) && !(key === "status" && trail.length === 1 && trail[0] === "site")) {
      console.error(`[smoke] /api/content exposes admin metadata key: ${key}`);
      process.exit(1);
    }
    walk(child, [...trail, key]);
  }
}
walk(payload?.content);
NODE
expect_status "/api/admin/content" "401"
expect_status "/api/admin/editor-drafts?key=study:new" "401"

for path in "${PRIVATE_PATHS[@]}"; do
  expect_not_2xx "$path"
done

echo "[smoke] ok: ${BASE_URL} health/content/admin/private-path checks passed; response bodies were not printed"

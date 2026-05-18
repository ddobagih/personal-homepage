#!/usr/bin/env bash
set -euo pipefail

SITE_ROOT="/var/www/thecistus.com/current"
REPO_DIR="${1:-$PWD}"
CONFIG_SRC="$REPO_DIR/deploy/nginx.thecistus.com.conf"
CONFIG_DST="/etc/nginx/sites-available/thecistus.com"

if [[ ! -f "$CONFIG_SRC" ]]; then
  echo "nginx config not found: $CONFIG_SRC" >&2
  exit 1
fi

sudo apt-get update
sudo apt-get install -y nginx

sudo mkdir -p "$SITE_ROOT"
sudo cp "$CONFIG_SRC" "$CONFIG_DST"
sudo ln -sfn "$CONFIG_DST" /etc/nginx/sites-enabled/thecistus.com
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx

echo "nginx installed."
echo "site root: $SITE_ROOT"
echo "next: copy site files into $SITE_ROOT and optionally run certbot --nginx -d thecistus.com -d www.thecistus.com"

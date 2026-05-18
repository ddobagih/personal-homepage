#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${1:-$PWD}"
APP_DIR="/var/www/thecistus.com/current"
DATA_DIR="/var/lib/thecistus"
NGINX_SRC="$REPO_DIR/deploy/nginx.thecistus.com.node.conf"
NGINX_DST="/etc/nginx/sites-available/thecistus.com"
SERVICE_SRC="$REPO_DIR/deploy/thecistus-homepage.service"
SERVICE_DST="/etc/systemd/system/thecistus-homepage.service"

if [[ ! -f "$NGINX_SRC" ]]; then
  echo "missing nginx config: $NGINX_SRC" >&2
  exit 1
fi

if [[ ! -f "$SERVICE_SRC" ]]; then
  echo "missing systemd service: $SERVICE_SRC" >&2
  exit 1
fi

sudo apt-get update
sudo apt-get install -y nginx nodejs npm rsync

sudo mkdir -p "$APP_DIR"
sudo mkdir -p "$DATA_DIR"
sudo chown -R www-data:www-data /var/www/thecistus.com
sudo chown -R www-data:www-data "$DATA_DIR"

sudo cp "$NGINX_SRC" "$NGINX_DST"
sudo ln -sfn "$NGINX_DST" /etc/nginx/sites-enabled/thecistus.com
sudo rm -f /etc/nginx/sites-enabled/default

sudo cp "$SERVICE_SRC" "$SERVICE_DST"

sudo nginx -t
sudo systemctl daemon-reload
sudo systemctl enable nginx
sudo systemctl enable thecistus-homepage
sudo systemctl restart nginx

if [[ -f "$APP_DIR/server.js" ]]; then
  sudo systemctl restart thecistus-homepage
else
  echo "app not deployed yet: $APP_DIR/server.js not found"
  echo "deploy the app first, then run: sudo systemctl restart thecistus-homepage"
fi

echo "node stack installed."
echo "app dir: $APP_DIR"
echo "data dir: $DATA_DIR"
echo "nginx config: $NGINX_DST"
echo "service: $SERVICE_DST"

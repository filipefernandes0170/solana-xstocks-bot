#!/usr/bin/env bash
# Par (solana-xstocks-bot) — one-time setup and updates on a Google Cloud machine (Debian 12 / Ubuntu).
# Run from the cloned repo:   sudo bash deploy/setup.sh
# Safe to run again: it updates the code, rebuilds and restarts, and keeps your .env and database.
set -euo pipefail

APP=/opt/par-bot
SVC=par-bot
SRC="$(cd "$(dirname "$0")/.." && pwd)"

if [ "$(id -u)" -ne 0 ]; then echo "Please run with sudo:  sudo bash deploy/setup.sh"; exit 1; fi
trap 'echo; echo "!! Setup stopped with an error (line $LINENO). Nothing was started. Send a screenshot of the last lines above."' ERR

echo "==> 1/7 Checking Node.js and tools"
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  echo "    Installing Node.js 22…"
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
# rsync copies the code; build tools are only used if the SQLite module has no ready-made binary
if ! command -v rsync >/dev/null 2>&1 || ! dpkg -s build-essential >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y rsync build-essential python3
fi
echo "    Node $(node -v)"

echo "==> 2/7 Making sure there is swap memory (helps the 1 GB machine build)"
if [ -z "$(swapon --show --noheadings)" ]; then
  fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> 3/7 Creating the 'parbot' user and $APP"
id parbot >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin parbot
mkdir -p "$APP/data"
# Copy the code. Never touch .env, the database (data/), node_modules or the build output.
rsync -a --no-owner --no-group --delete --exclude ".git" --exclude ".env" --exclude "data/" --exclude "node_modules/" --exclude "dist/" "$SRC/" "$APP/"
FIRST=0
if [ ! -f "$APP/.env" ]; then
  cp "$APP/.env.example" "$APP/.env"
  sed -i "s#^DATABASE_PATH=.*#DATABASE_PATH=$APP/data/bot.db#" "$APP/.env"
  FIRST=1
fi
chmod 600 "$APP/.env"

echo "==> 4/7 Installing packages (this can take a few minutes on a small machine)"
cd "$APP"
npm install --no-audit --no-fund --loglevel=error

echo "==> 5/7 Building"
rm -rf "$APP/dist"
npm run build --silent
npm prune --omit=dev --no-audit --no-fund --loglevel=error
chown -R parbot:parbot "$APP"

echo "==> 6/7 Installing the service (starts on boot, restarts if it crashes)"
cp "$APP/deploy/par-bot.service" /etc/systemd/system/$SVC.service
sed -i "s#/usr/bin/node#$(command -v node)#" /etc/systemd/system/$SVC.service
systemctl daemon-reload
systemctl enable $SVC >/dev/null

echo "==> 7/7 Starting"
if [ "$FIRST" = "1" ] || ! grep -q '^TELEGRAM_BOT_TOKEN=[0-9]\+:' "$APP/.env"; then
  echo
  echo "Almost done. Put your bot token (and any keys) in the settings file, then start the bot:"
  echo "    sudo nano $APP/.env"
  echo "    sudo systemctl restart $SVC"
  echo "    sudo journalctl -u $SVC -f        (live log, Ctrl+C to exit)"
else
  systemctl restart $SVC
  sleep 4
  systemctl --no-pager --lines=10 status $SVC || true
  echo
  echo "Running. Live log:  sudo journalctl -u $SVC -f"
fi

#!/usr/bin/env bash
# Par — server watchdog. Runs every 5 minutes as root (par-bot-watchdog.timer, installed by setup.sh).
#
# The bot writes data/heartbeat (unix seconds) after every desk round, about once a minute. If the service has been
# running for 10 minutes and the heartbeat is 10 minutes old, the bot is stuck: restart it. If the service is not
# running at all, only say so (a stop may be on purpose; a crash already restarts by itself). A missing heartbeat
# file never causes a restart, so a bot that cannot write it is not restarted in a loop.
# Messages go to ALERT_CHAT_ID from the bot's .env, at most one an hour; without it they only go to the system log.
set -uo pipefail

APP=/opt/par-bot
SVC=par-bot
BEAT="$APP/data/heartbeat"
STAMP=/var/lib/par-bot-watchdog/last-alert
LIMIT=600
now=$(date +%s)
mkdir -p "$(dirname "$STAMP")"

# One value from the .env file, without its surrounding quotes. The last line wins, as it does for the bot (dotenv).
env_value() {
  sed -n "s/^$1=//p" "$APP/.env" 2>/dev/null | tail -n 1 | tr -d '\r' | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

alert() {
  echo "par-bot-watchdog: $1"
  local last token chat
  last=$(cat "$STAMP" 2>/dev/null || echo 0)
  case "$last" in '' | *[!0-9]*) last=0 ;; esac
  [ $((now - last)) -lt 3600 ] && return 0
  token=$(env_value TELEGRAM_BOT_TOKEN)
  chat=$(env_value ALERT_CHAT_ID)
  if [ -z "$token" ] || [ -z "$chat" ]; then return 0; fi
  echo "$now" > "$STAMP"
  # The token goes in through stdin, never on the command line, so other accounts on this machine cannot see it.
  printf 'url = "https://api.telegram.org/bot%s/sendMessage"\n' "$token" |
    curl -s -m 15 -o /dev/null --config - --data-urlencode "chat_id=$chat" --data-urlencode "text=$1" || true
}

if ! systemctl is-active --quiet "$SVC"; then
  alert "⚠️ Par: the bot is not running on the server. A crash restarts it by itself, so it may have been stopped on purpose. Check with: sudo systemctl status $SVC"
  exit 0
fi

[ -f "$BEAT" ] || exit 0
beat=$(cat "$BEAT" 2>/dev/null || echo 0)
case "$beat" in '' | *[!0-9]*) exit 0 ;; esac
started=$(date -d "$(systemctl show -p ActiveEnterTimestamp --value "$SVC")" +%s 2>/dev/null || echo "$now")

if [ $((now - started)) -ge "$LIMIT" ] && [ $((now - beat)) -ge "$LIMIT" ]; then
  systemctl restart "$SVC"
  alert "⚠️ Par: the bot stopped working for 10 minutes, so the server restarted it. If this repeats, check the log: sudo journalctl -u $SVC -n 100"
fi
exit 0

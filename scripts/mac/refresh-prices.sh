#!/bin/bash
# Keeps DMart prices fresh by fetching them from this Mac.
#
# DMart blocks GitHub's servers, so the daily Action can't fetch prices itself.
# launchd runs this every hour (see install.sh). When data/catalog.json on main
# is more than MAX_AGE_HOURS old, it fetches new prices and pushes them. The
# Action then builds each morning's shop from the freshest catalog on main.
#
# It runs in its own clone under ~/Library/Application Support/kitna-hua, never
# in your working copy, so it can't trip over your branches or edits.
#
#   KITNA_FORCE=1 scripts/mac/refresh-prices.sh     fetch now, whatever the age
#   touch ~/Library/Application\ Support/kitna-hua/force-refresh
#                                                   same, on the job's next run

MAX_AGE_HOURS=12
ALERT_AGE_HOURS=36 # show a notification if prices get this stale and fetching keeps failing
STATE_DIR="$HOME/Library/Application Support/kitna-hua"
FORCE_FLAG="$STATE_DIR/force-refresh"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S %Z')  $*"; }

catalog_age_hours() {
  node -e 'const c = require("./data/catalog.json"); console.log(Math.floor((Date.now() - Date.parse(c.fetchedAt)) / 36e5))'
}

alert_if_stale() {
  local age marker="$STATE_DIR/last-alert"
  age=$(catalog_age_hours)
  [ "$age" -ge "$ALERT_AGE_HOURS" ] || return 0
  # at most one notification a day
  if [ -f "$marker" ] && [ $(($(date +%s) - $(stat -f %m "$marker"))) -lt 86400 ]; then return 0; fi
  touch "$marker"
  osascript -e "display notification \"DMart prices are ${age}h old and fetching keeps failing. Details in ~/Library/Logs/kitna-hua.log\" with title \"Kitna Hua?\"" >/dev/null 2>&1
}

# Everything lives in main() so bash has read the whole file before the
# `git reset` below replaces it with the latest version from GitHub.
main() {
  cd "$(dirname "$0")/../.." || exit 1

  local force="${KITNA_FORCE:-}"
  if [ -f "$FORCE_FLAG" ]; then
    force=1
    rm -f "$FORCE_FLAG"
  fi

  if [ -z "$force" ] && [ "$(catalog_age_hours)" -lt "$MAX_AGE_HOURS" ]; then
    log "prices are $(catalog_age_hours)h old; nothing to do"
    return 0
  fi

  # This clone belongs to the job, so it always starts from exactly what's on GitHub.
  if ! git fetch -q origin || ! git reset -q --hard origin/main; then
    log "couldn't reach GitHub; will try again next hour"
    return 1
  fi
  if [ -z "$force" ] && [ "$(catalog_age_hours)" -lt "$MAX_AGE_HOURS" ]; then
    log "GitHub already has fresh prices"
    return 0
  fi

  log "fetching DMart prices (catalog is $(catalog_age_hours)h old)"
  if ! node scripts/fetch-catalog.mjs; then
    log "fetch failed; will try again next hour"
    alert_if_stale
    return 1
  fi

  git add data/catalog.json
  git commit -q -m "Prices for $(TZ=Asia/Kolkata date +%F)"
  local attempt
  for attempt in 1 2 3; do
    if git push -q origin HEAD:main; then
      log "pushed fresh prices"
      return 0
    fi
    git pull -q --rebase origin main # the Action may have just pushed a shop
  done
  log "push failed; will try again next hour"
  return 1
}

main "$@"
exit $?

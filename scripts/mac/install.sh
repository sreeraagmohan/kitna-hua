#!/bin/bash
# Sets up (or removes) the hourly launchd job that keeps DMart prices fresh.
# See refresh-prices.sh for what the job does. Safe to re-run.
#
#   scripts/mac/install.sh              install, or update after changing this file
#   scripts/mac/install.sh --uninstall  remove the job
set -euo pipefail

LABEL="io.github.sreeraagmohan.kitna-hua.prices"
STATE_DIR="$HOME/Library/Application Support/kitna-hua"
CLONE="$STATE_DIR/repo"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/kitna-hua.log"
DOMAIN="gui/$(id -u)"

launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true

if [ "${1:-}" = "--uninstall" ]; then
  rm -f "$PLIST"
  echo "Removed the job. Its repo copy ($CLONE) and log ($LOG) are still there; delete them if you like."
  exit 0
fi

# The job works in its own clone: launchd jobs can't read ~/Documents without
# extra macOS permissions, and it shouldn't touch your working copy anyway.
REMOTE="$(git -C "$(dirname "$0")" remote get-url origin)"
mkdir -p "$STATE_DIR" "$(dirname "$PLIST")" "$(dirname "$LOG")"
if [ -d "$CLONE/.git" ]; then
  git -C "$CLONE" fetch -q origin
  git -C "$CLONE" reset -q --hard origin/main
else
  git clone -q "$REMOTE" "$CLONE"
fi

# Every hour at :07. Unlike StartInterval, a calendar slot missed while the
# Mac was asleep runs as soon as it wakes.
cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$CLONE/scripts/mac/refresh-prices.sh</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Minute</key>
    <integer>7</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>$LOG</string>
  <key>StandardErrorPath</key>
  <string>$LOG</string>
  <key>ProcessType</key>
  <string>Background</string>
  <key>LowPriorityIO</key>
  <true/>
</dict>
</plist>
EOF

launchctl bootstrap "$DOMAIN" "$PLIST"
echo "Installed $LABEL"
echo "  checks hourly at :07 and refreshes prices once they're over 12 hours old"
echo "  repo copy: $CLONE"
echo "  log:       $LOG"

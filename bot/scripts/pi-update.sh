#!/usr/bin/env bash
# Rebuilds and restarts the bot when a new commit on main changes bot/.
# Commits that only touch the site are fast-forwarded past without a restart.
#
# One-time setup on the Pi (a sparse, blobless clone, so the Pi only ever
# downloads the files under bot/ plus a handful of small root files):
#
#   git clone --filter=blob:none --sparse https://github.com/parkourreborn/wasans.git ~/wasans
#   git -C ~/wasans sparse-checkout set bot
#   cp <old wasans-bot checkout>/.env ~/wasans/bot/.env
#
# then run it every minute from cron (crontab -e):
#
#   * * * * * REPO_DIR=$HOME/wasans $HOME/wasans/bot/scripts/pi-update.sh >> $HOME/wasans-bot-update.log 2>&1

set -euo pipefail

REPO_DIR="${REPO_DIR:-$HOME/wasans}"
BRANCH="${BRANCH:-main}"

# A build on the Pi can outlast the one-minute cron interval; skip this run
# rather than start a second build on top of it.
exec 9>"${TMPDIR:-/tmp}/wasans-bot-update.lock"
flock -n 9 || exit 0

cd "$REPO_DIR"
git fetch --quiet origin "$BRANCH"

if [ "$(git rev-parse HEAD)" = "$(git rev-parse "origin/$BRANCH")" ]; then
    exit 0
fi

if git diff --quiet HEAD "origin/$BRANCH" -- bot/; then
    git merge --quiet --ff-only "origin/$BRANCH"
    exit 0
fi

echo "$(date -Is) bot/ changed, updating to $(git rev-parse --short "origin/$BRANCH")"
git merge --quiet --ff-only "origin/$BRANCH"

# Builds the new image while the old container keeps running, then swaps it
# in, so the bot is only down for the restart itself.
cd bot
docker compose up -d --build --remove-orphans
docker image prune -f >/dev/null

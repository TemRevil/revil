#!/usr/bin/env bash
# Runs ON the Hostinger server when the release that activate.sh put live fails its smoke
# test: the newest backup (the site that was live before) goes back in place, and the
# failed release is kept under .codex-deploy/failed for a look (the newest three).
# Needs DEPLOY_ROOT and RELEASE_SHA (the failed release).
set -euo pipefail
trap '' HUP PIPE

: "${DEPLOY_ROOT:?DEPLOY_ROOT is not set}"
: "${RELEASE_SHA:?RELEASE_SHA is not set}"

BASE="$DEPLOY_ROOT/.codex-deploy"
LIVE="$DEPLOY_ROOT/public_html"
BACKUPS="$BASE/backups"
FAILED="$BASE/failed"

log() { echo "$@" 2>/dev/null || true; }

if [ "$(cat "$BASE/current" 2>/dev/null || true)" != "$RELEASE_SHA" ]; then
  log "Release $RELEASE_SHA is not the live one; nothing to roll back."
  exit 1
fi

LATEST=$(find "$BACKUPS" -mindepth 1 -maxdepth 1 -type d -regextype posix-extended -regex '.*/[0-9]{14}' | sort | tail -n 1)
if [ -z "$LATEST" ] || [ ! -d "$LATEST/public_html" ]; then
  log "No backup to roll back to; the failed release stays live."
  exit 1
fi

mkdir -p "$FAILED"
PARKED="$FAILED/$(date +%Y%m%d%H%M%S)-$RELEASE_SHA"
mv "$LIVE" "$PARKED"
if ! mv "$LATEST/public_html" "$LIVE"; then
  mv "$PARKED" "$LIVE"
  log "Could not restore the backup; the failed release stays live."
  exit 1
fi
rmdir "$LATEST" 2>/dev/null || true
echo "rolled-back-from-$RELEASE_SHA" > "$BASE/current"
log "Rolled back: the previous site is live again."

find "$FAILED" -mindepth 1 -maxdepth 1 -type d | sort | head -n -3 | while IFS= read -r old; do rm -rf "$old"; done

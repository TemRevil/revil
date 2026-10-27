#!/usr/bin/env bash
# Runs ON the Hostinger server: deploy-hostinger.yml uploads it next to the release
# archive and starts it over SSH with DEPLOY_ROOT and RELEASE_SHA set.
#
# Unpacks the release beside the live site, then swaps it in with two renames back to
# back (the only gap the site has), and puts the old site back if the second rename
# fails. The old site is kept as a backup; only the newest KEEP_BACKUPS are kept.
#
# Safe to run again: when the archive is gone and this release is already live, it
# stops. It ignores a dropped connection (SIGHUP), so a swap that has started finishes.
set -euo pipefail
trap '' HUP PIPE

: "${DEPLOY_ROOT:?DEPLOY_ROOT is not set}"
: "${RELEASE_SHA:?RELEASE_SHA is not set}"
KEEP_BACKUPS=${KEEP_BACKUPS:-5}

BASE="$DEPLOY_ROOT/.codex-deploy"
LIVE="$DEPLOY_ROOT/public_html"
ARCHIVE="$BASE/incoming/release.tgz"
STAGE="$BASE/releases/$RELEASE_SHA"
BACKUPS="$BASE/backups"

# Logging never fails the script, even when nobody is reading any more.
log() { echo "$@" 2>/dev/null || true; }

if [ ! -f "$ARCHIVE" ]; then
  if [ "$(cat "$BASE/current" 2>/dev/null || true)" = "$RELEASE_SHA" ]; then
    log "Release $RELEASE_SHA is already live."
    exit 0
  fi
  log "No release archive at $ARCHIVE."
  exit 1
fi

rm -rf "$STAGE"
mkdir -p "$STAGE" "$BACKUPS"
tar -xzf "$ARCHIVE" -C "$STAGE"
if [ ! -f "$STAGE/index.html" ]; then
  log "The release has no index.html; the live site is untouched."
  rm -rf "$STAGE"
  exit 1
fi

# Domain verification files live only on the server.
if [ -d "$LIVE/.well-known" ]; then
  mkdir -p "$STAGE/.well-known"
  cp -a "$LIVE/.well-known/." "$STAGE/.well-known/"
fi

BACKUP="$BACKUPS/$(date +%Y%m%d%H%M%S)"
mkdir -p "$BACKUP"

# The swap. Nothing between the two renames, so the site is away for microseconds.
if [ -e "$LIVE" ]; then
  mv "$LIVE" "$BACKUP/public_html"
  if ! mv "$STAGE" "$LIVE"; then
    mv "$BACKUP/public_html" "$LIVE"
    rmdir "$BACKUP" 2>/dev/null || true
    log "Could not move the release into place; the previous site is back."
    exit 1
  fi
else
  rmdir "$BACKUP"
  mv "$STAGE" "$LIVE"
fi

echo "$RELEASE_SHA" > "$BASE/current"
rm -f "$ARCHIVE"
log "Release $RELEASE_SHA is live."

# Keep the newest backups only. Names are timestamps, so a name sort is a time sort.
find "$BACKUPS" -mindepth 1 -maxdepth 1 -type d -regextype posix-extended -regex '.*/[0-9]{14}' \
  | sort | head -n "-$KEEP_BACKUPS" | while IFS= read -r old; do
    rm -rf "$old"
    log "Removed old backup $(basename "$old")."
  done
# Unpacked releases left by failed runs.
find "$BASE/releases" -mindepth 1 -maxdepth 1 -type d -exec rm -rf {} +

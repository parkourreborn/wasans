#!/usr/bin/env bash
# One-time backfill: generates a JPEG poster frame for every existing
# submission video in R2 (scores/{uuid}.mp4 -> scores/{uuid}-preview.jpg),
# so score-video-preview.tsx can show an <img> instead of loading the whole
# video just to paint one frame. New submissions get their preview
# generated client-side at upload time instead (see submissions/new).
#
# Requires: `wrangler` (already a project devDependency) authenticated via
# `wrangler login`, and `ffmpeg` installed locally.
#
# Usage: run from the repo root:
#   bash scripts/backfill-thumbnails.sh

set -euo pipefail

BUCKET="wasans"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "Fetching submission uuids from D1..."
npx wrangler d1 execute wasans --remote --json \
  --command="SELECT uuid FROM submissions ORDER BY date DESC" \
  > "$TMP_DIR/submissions.json"

UUIDS=$(node -e "
  const data = require('$TMP_DIR/submissions.json');
  const rows = data[0]?.results || [];
  for (const row of rows) console.log(row.uuid);
")

TOTAL=$(echo "$UUIDS" | grep -c . || true)
COUNT=0
GENERATED=0
SKIPPED=0

echo "Found $TOTAL submissions. Generating missing preview thumbnails..."

for uuid in $UUIDS; do
  COUNT=$((COUNT + 1))
  VIDEO_PATH="$TMP_DIR/$uuid.mp4"
  PREVIEW_PATH="$TMP_DIR/$uuid-preview.jpg"

  echo "[$COUNT/$TOTAL] $uuid"

  # Skip if a preview already exists in R2.
  if npx wrangler r2 object get "$BUCKET/scores/$uuid-preview.jpg" --file="$PREVIEW_PATH" --remote >/dev/null 2>&1; then
    echo "  already has a preview, skipping"
    SKIPPED=$((SKIPPED + 1))
    rm -f "$PREVIEW_PATH"
    continue
  fi

  if ! npx wrangler r2 object get "$BUCKET/scores/$uuid.mp4" --file="$VIDEO_PATH" --remote >/dev/null 2>&1; then
    echo "  no video found, skipping"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  if ! ffmpeg -y -loglevel error -ss 00:00:01 -i "$VIDEO_PATH" -frames:v 1 -q:v 3 "$PREVIEW_PATH" 2>/dev/null; then
    # Video shorter than 1s — grab the first frame instead.
    ffmpeg -y -loglevel error -i "$VIDEO_PATH" -frames:v 1 -q:v 3 "$PREVIEW_PATH" || {
      echo "  ffmpeg failed, skipping"
      SKIPPED=$((SKIPPED + 1))
      rm -f "$VIDEO_PATH"
      continue
    }
  fi

  npx wrangler r2 object put "$BUCKET/scores/$uuid-preview.jpg" --file="$PREVIEW_PATH" --content-type=image/jpeg --remote >/dev/null

  GENERATED=$((GENERATED + 1))
  rm -f "$VIDEO_PATH" "$PREVIEW_PATH"
done

echo ""
echo "Done. Generated: $GENERATED, skipped: $SKIPPED, total: $TOTAL"

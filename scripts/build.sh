#!/usr/bin/env bash
# Downright — build store-ready zips for Chromium (Chrome + Edge) and Firefox.
# Output: dist/downright-<version>-chromium.zip, dist/downright-<version>-firefox.zip
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
VERSION="$(python3 -c "import json;print(json.load(open('$ROOT/src/manifest.json'))['version'])")"

rm -rf "$DIST"
mkdir -p "$DIST/chromium" "$DIST/firefox"

# Chromium build: src/ as-is.
cp -R "$ROOT/src/." "$DIST/chromium/"

# Firefox build: same code, Firefox manifest (event page, gecko id).
cp -R "$ROOT/src/." "$DIST/firefox/"
cp "$ROOT/firefox/manifest.json" "$DIST/firefox/manifest.json"

# Never ship junk.
find "$DIST" -name '.DS_Store' -delete

( cd "$DIST/chromium" && zip -rq -X "../downright-$VERSION-chromium.zip" . )
( cd "$DIST/firefox"  && zip -rq -X "../downright-$VERSION-firefox.zip" . )

echo "built:"
ls -la "$DIST"/*.zip

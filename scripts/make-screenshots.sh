#!/usr/bin/env bash
# Downright — render store screenshots from the scene pages with headless
# Chrome. Output: store-assets/screenshot-*.png (1280×800) and
# store-assets/promo-tile-440x280.png.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/store-assets"

find_chrome() {
  if [ -n "${CHROME_BIN:-}" ] && [ -x "${CHROME_BIN}" ]; then echo "${CHROME_BIN}"; return; fi
  for c in \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "$(command -v google-chrome || true)" \
    "$(command -v chromium-browser || true)"; do
    if [ -n "$c" ] && [ -x "$c" ]; then echo "$c"; return; fi
  done
  echo ""
}

CHROME="$(find_chrome)"
if [ -z "$CHROME" ]; then
  echo "error: no Chrome binary found (set CHROME_BIN)" >&2
  exit 2
fi

shot() { # file.html out.png WxH
  local page="$1" out="$2" size="$3"
  # --virtual-time-budget lets the promo-tile scenes finish loading their
  # Google Fonts before the screenshot fires; render offline and the type
  # falls back to system fonts.
  "$CHROME" --headless=new --disable-gpu --no-sandbox --no-first-run \
    --hide-scrollbars --force-device-scale-factor=1 \
    --virtual-time-budget=10000 \
    --window-size="${size/x/,}" --screenshot="$out" \
    "file://$ROOT/store-assets/scenes/$page" 2>/dev/null
  echo "  $out"
}

echo "rendering store screenshots:"
shot scene-1-hero.html           "$OUT/screenshot-1-hero.png"        1280x800
shot scene-2-tables.html         "$OUT/screenshot-2-tables.png"      1280x800
shot scene-3-fidelity.html       "$OUT/screenshot-3-fidelity.png"    1280x800
shot scene-4-private.html        "$OUT/screenshot-4-private.png"     1280x800
shot scene-promo-tile.html       "$OUT/promo-tile-440x280.png"       440x280
shot scene-promo-tile-dark.html  "$OUT/promo-tile-440x280-dark.png"  440x280
echo "done"

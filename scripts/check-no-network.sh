#!/usr/bin/env bash
# Downright — verify the "no network requests, ever" promise mechanically.
# Fails if any shipped source contains a network-capable API call, or if the
# manifest requests host permissions. Run by CI on every push.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FAIL=0

# Literal substrings. Cheap, and they catch the obvious.
PATTERNS=(
  'fetch('
  'XMLHttpRequest'
  'sendBeacon'
  'WebSocket('
  'EventSource('
  'RTCPeerConnection'
  'serviceWorker'
  'importScripts("http'
  "importScripts('http"
)

for p in "${PATTERNS[@]}"; do
  if grep -rn --include='*.js' --include='*.html' -F "$p" "$ROOT/src" "$ROOT/firefox" 2>/dev/null; then
    echo "✗ network-capable API found: $p" >&2
    FAIL=1
  fi
done

# Regex patterns, for the ways a request sneaks in without the word "fetch":
# a constructed Image or media element, a dynamic import, a beacon, a popup.
# Absolute URL literals — the ones waiting to be assigned to a .src — get
# their own pass below, because two narrow shapes of them are legitimate.
REGEXES=(
  'fetch[[:space:]]*\('
  'new[[:space:]]+(Image|Audio|EventSource|WebSocket|XMLHttpRequest|RTCPeerConnection)'
  '(^|[^A-Za-z_.$])import[[:space:]]*\('
  'navigator\.(sendBeacon|serviceWorker|connection)'
  'window\.open[[:space:]]*\('
)

for p in "${REGEXES[@]}"; do
  if grep -rnE --include='*.js' "$p" "$ROOT/src" "$ROOT/firefox" 2>/dev/null; then
    echo "✗ network-capable construct found: $p" >&2
    FAIL=1
  fi
done

# Absolute URLs in string literals get their own pass, because exactly two
# kinds of them are inert and everything else is not:
#
#   1. The SVG namespace. A parser identifier, never fetched. Allowed on
#      that one declaration line in common/toast.js and nowhere else.
#   2. RFC 2606 reserved example.org / example.com URLs inside the settings
#      page previews. They are sample text drawn into a preview pane; the
#      constructs that could load them are all caught above.
#
# Both allowances are pinned to a file and a shape, so a real URL cannot
# ride in behind them.
ALLOW_SVG_NS="^[^:]*src/common/toast\.js:[0-9]+:  const SVG_NS = 'http://www\.w3\.org/2000/svg';$"
ALLOW_SAMPLE="^[^:]*src/options/[^:]*\.js:[0-9]+:[^\"'\`]*['\"\`]https://example\.(org|com)/[^\"'\`]*['\"\`],?$"

if grep -rnE --include='*.js' '["'"'"'`](https?:)?//' "$ROOT/src" "$ROOT/firefox" 2>/dev/null |
   grep -vE "$ALLOW_SVG_NS" | grep -vE "$ALLOW_SAMPLE"; then
  echo "✗ absolute URL literal found in shipped code" >&2
  FAIL=1
fi

# Extension pages legitimately carry <link rel=stylesheet>, <img src>, and
# <script src> — but every one of them must be a package-relative path, never
# an absolute or protocol-relative URL pointing off-device. The one allowed
# exception is the repository link in the options page, which is a link the
# user clicks, not a resource the page loads.
if grep -rnE --include='*.html' '(src|href|action)=["'"'"']?(https?:)?//' "$ROOT/src" "$ROOT/firefox" 2>/dev/null |
   grep -vE 'href="https://github\.com/jayasankarmr/Downright"'; then
  echo "✗ extension page references an off-device URL" >&2
  FAIL=1
fi

# And nothing may preload, prefetch, or warm a connection to anywhere.
if grep -rnE --include='*.html' 'rel=["'"'"']?(preconnect|prefetch|preload|dns-prefetch)' \
     "$ROOT/src" "$ROOT/firefox" 2>/dev/null; then
  echo "✗ extension page declares a network preload hint" >&2
  FAIL=1
fi

for m in "$ROOT/src/manifest.json" "$ROOT/firefox/manifest.json"; do
  if python3 - "$m" <<'EOF'
import json, sys
man = json.load(open(sys.argv[1]))
bad = man.get("host_permissions") or []
bad += [p for p in man.get("permissions", []) if "://" in p or p == "<all_urls>"]
if bad:
    print(f"host permissions present in {sys.argv[1]}: {bad}")
    sys.exit(1)
EOF
  then :; else
    echo "✗ manifest requests host permissions" >&2
    FAIL=1
  fi
done

if [ "$FAIL" -eq 0 ]; then
  echo "✓ no network-capable APIs, no host permissions"
fi
exit "$FAIL"

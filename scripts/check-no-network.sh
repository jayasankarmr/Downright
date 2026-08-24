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
# a constructed Image or media element, a dynamic import, a beacon, a popup,
# or any absolute URL sitting in a string literal waiting to be assigned to
# a .src. Comments and regex literals do not use quoted "http…", so this
# stays quiet on prose about URLs.
REGEXES=(
  'fetch[[:space:]]*\('
  'new[[:space:]]+(Image|Audio|EventSource|WebSocket|XMLHttpRequest|RTCPeerConnection)'
  '(^|[^A-Za-z_.$])import[[:space:]]*\('
  'navigator\.(sendBeacon|serviceWorker|connection)'
  'window\.open[[:space:]]*\('
  '["'"'"'`](https?:)?//'
)

for p in "${REGEXES[@]}"; do
  if grep -rnE --include='*.js' "$p" "$ROOT/src" "$ROOT/firefox" 2>/dev/null; then
    echo "✗ network-capable construct found: $p" >&2
    FAIL=1
  fi
done

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

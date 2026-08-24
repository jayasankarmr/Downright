#!/usr/bin/env bash
# Downright — verify the "no network requests, ever" promise mechanically.
# Fails if any shipped source contains a network-capable API call, or if the
# manifest requests host permissions. Run by CI on every push.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FAIL=0

PATTERNS=(
  'fetch('
  'XMLHttpRequest'
  'sendBeacon'
  'WebSocket('
  'EventSource('
  'RTCPeerConnection'
  'importScripts("http'
  "importScripts('http"
)

for p in "${PATTERNS[@]}"; do
  if grep -rn --include='*.js' --include='*.html' -F "$p" "$ROOT/src" "$ROOT/firefox" 2>/dev/null; then
    echo "✗ network-capable API found: $p" >&2
    FAIL=1
  fi
done

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

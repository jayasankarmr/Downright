#!/usr/bin/env bash
# Downright — run the conversion test suite in headless Chrome.
# Serves the repo over localhost:8631 (the fixtures fetch their expected
# files), loads tests/harness.html, and parses the results JSON the page
# writes into the DOM. Exits non-zero on any failing case.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT=8631

find_chrome() {
  if [ -n "${CHROME_BIN:-}" ] && [ -x "${CHROME_BIN}" ]; then echo "${CHROME_BIN}"; return; fi
  for c in \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
    "$(command -v google-chrome || true)" \
    "$(command -v google-chrome-stable || true)" \
    "$(command -v chromium-browser || true)" \
    "$(command -v chromium || true)"; do
    if [ -n "$c" ] && [ -x "$c" ]; then echo "$c"; return; fi
  done
  echo ""
}

CHROME="$(find_chrome)"
if [ -z "$CHROME" ]; then
  echo "error: no Chrome/Chromium binary found (set CHROME_BIN)" >&2
  exit 2
fi

SERVER_PID=""
cleanup() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true; }
trap cleanup EXIT

# Reuse an already-running server on the port; otherwise start one.
if ! curl -sf "http://localhost:${PORT}/tests/harness.html" -o /dev/null 2>/dev/null; then
  python3 -m http.server "$PORT" --directory "$ROOT" >/dev/null 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 40); do
    curl -sf "http://localhost:${PORT}/tests/harness.html" -o /dev/null 2>/dev/null && break
    sleep 0.25
  done
fi

DUMP="$(mktemp)"
"$CHROME" --headless=new --disable-gpu --no-sandbox --no-first-run \
  --virtual-time-budget=20000 --timeout=30000 \
  --dump-dom "http://localhost:${PORT}/tests/harness.html" > "$DUMP" 2>/dev/null || true

RESULT_LINE="$(grep -o 'DOWNRIGHT_RESULTS:{.*}' "$DUMP" | head -1 | sed 's/^DOWNRIGHT_RESULTS://' || true)"
rm -f "$DUMP"

if [ -z "$RESULT_LINE" ]; then
  echo "error: harness produced no results (page failed to run)" >&2
  exit 2
fi

python3 - "$RESULT_LINE" <<'EOF'
import json, sys, html
data = json.loads(html.unescape(sys.argv[1]))
if data.get("harnessError"):
    print("HARNESS ERROR:", data["harnessError"])
    sys.exit(2)
passed, total = data["passed"], data["total"]
print(f"{'PASS' if passed == total else 'FAIL'} {passed}/{total}")
for f in data.get("failures", []):
    print(f"  ✗ {f['id']}")
    if f.get("error"):
        print("     error:", f["error"][:300].replace(chr(10), " ⏎ "))
    elif f.get("firstDiff"):
        d = f["firstDiff"]
        print(f"     line {d['line']}:")
        print(f"       got:  {d.get('got')!r}")
        print(f"       want: {d.get('want')!r}")
sys.exit(0 if passed == total and total > 0 else 1)
EOF

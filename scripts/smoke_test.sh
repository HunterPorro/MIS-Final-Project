#!/usr/bin/env bash
# Full-stack smoke: API pipeline + Next.js build.
# Optional: SMOKE_TEST_ASR=1 to also load Whisper (slow, may download weights).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PY="python3"
if [[ -x "$ROOT/.venv/bin/python" ]]; then
  PY="$ROOT/.venv/bin/python"
fi

echo "== Python unit tests + ML pipeline smoke (using $PY) =="
"$PY" -m unittest discover -s api/tests -p "test_*.py" -v

echo "== Next.js production build =="
# Turbopack can be flaky on some local filesystems; use webpack for deterministic CI/smoke.
if lsof -tiTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo
  echo "Dev server detected on :3000 — skipping 'rm -rf web/.next' to avoid corrupting Next dev."
  echo "If you want a fully clean build, stop dev then re-run smoke."
else
  rm -rf web/.next
fi
npm -s run build --prefix web -- --webpack

echo "OK: smoke_test.sh passed"

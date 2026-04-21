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
npm -s run build --prefix web

echo "OK: smoke_test.sh passed"

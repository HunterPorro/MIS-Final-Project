#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -d .venv ]]; then
  echo "Create a venv first: python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
  exit 1
fi
# shellcheck source=/dev/null
source .venv/bin/activate

export PYTHONPATH=.
export BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:8000}"

cleanup() {
  kill "${UVICORN_PID:-0}" 2>/dev/null || true
}
trap cleanup EXIT

uvicorn api.main:app --reload --host 127.0.0.1 --port 8000 &
UVICORN_PID=$!

cd web
export BACKEND_URL
export NEXT_PUBLIC_USE_PROXY=1
npm run dev -- --hostname 127.0.0.1 --port 3000

#!/usr/bin/env bash
set -euo pipefail

kill_port() {
  local port="$1"
  local pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "Freeing port $port (killing: $pids)"
    kill $pids 2>/dev/null || true
  fi
}

kill_port 3000
kill_port 8000

exit 0


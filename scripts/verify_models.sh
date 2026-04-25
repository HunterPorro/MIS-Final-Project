#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

WS="models/workspace/workspace_cnn.pt"
TECH="models/technical/config.json"

missing=0
if [[ ! -f "$WS" ]]; then
  echo "Missing: $WS"
  missing=1
fi
if [[ ! -f "$TECH" ]]; then
  echo "Missing: $TECH"
  missing=1
fi

if [[ "$missing" -ne 0 ]]; then
  echo
  echo "Build artifacts with: ./scripts/train_all.sh"
  exit 1
fi

echo "OK: model artifacts present."


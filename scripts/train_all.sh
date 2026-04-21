#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi
# shellcheck source=/dev/null
source .venv/bin/activate
pip install -r requirements.txt
python training/generate_workspace_patterns.py
python training/build_technical_jsonl.py
# Prefer ImageNet transfer; use --no-pretrained if weight download fails (SSL/offline).
python training/train_workspace_cnn.py --epochs 8 --data-dir training/data/workspace --out models/workspace/workspace_cnn.pt || \
  python training/train_workspace_cnn.py --epochs 8 --data-dir training/data/workspace --out models/workspace/workspace_cnn.pt --no-pretrained
python training/train_technical.py --epochs 3 --batch-size 16
echo "Models ready under models/"

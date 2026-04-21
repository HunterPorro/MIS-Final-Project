# Training and evaluation

Run all commands from the **repository root** with the Python venv activated.

## Generate data

```bash
python training/generate_workspace_patterns.py
python training/build_technical_jsonl.py
```

## Train

```bash
python training/train_workspace_cnn.py --epochs 8 --data-dir training/data/workspace --out models/workspace/workspace_cnn.pt
# If ImageNet weights fail to download:
python training/train_workspace_cnn.py --epochs 8 --data-dir training/data/workspace --out models/workspace/workspace_cnn.pt --no-pretrained

python training/train_technical.py --epochs 3 --batch-size 16
```

Or use `./scripts/train_all.sh`.

## Evaluate (report-friendly metrics)

**Workspace CNN** on a labeled folder (same layout as `ImageFolder` training data):

```bash
python training/eval_workspace.py --data-dir training/data/workspace --checkpoint models/workspace/workspace_cnn.pt
```

**Technical classifier** on the held-out 10% split (same `--seed` as training, default `42`):

```bash
python training/eval_technical.py --data training/data/technical_train.jsonl --model-dir models/technical
```

Synthetic pattern images are easy to separate; expect very high accuracy on that demo set. Replace `training/data/workspace/` with real webcam crops for meaningful environment metrics.

## Improving model quality (production-minded)

### Technical classifier: curated labels

`training/build_technical_jsonl.py` emits combinatorial finance text for a working pipeline. For higher signal:

1. Add **real or expert-labeled** short answers per topic (M&A, LBO, Valuation) with **novice → strong** level annotations matching `LEVEL_LABELS` in `api/ml/technical_infer.py`.
2. Append rows to `training/data/technical_train.jsonl` (or a separate file + concat) preserving the `text` / `label` schema expected by `training/train_technical.py`.
3. Re-run train + `eval_technical.py`; track **per-class** precision/recall, not just accuracy.

### Workspace CNN: real images

Replace synthetic `training/data/workspace/` with **ImageFolder**-style crops from real video backgrounds (professional vs needs work). Re-train and re-run `eval_workspace.py` on a **held-out** folder you never train on.

### Frozen evaluation set

Keep a **fixed** JSONL / image folder (checked in or documented with checksum) that you **do not** train on. Re-run `eval_technical.py` and `eval_workspace.py` after each training change and record numbers in commit messages or a team log so improvements are comparable.

### ASR (Whisper) A/B

The API reads `asr_model` from `api/config.py` (e.g. `openai/whisper-base`). To compare:

1. Train or evaluate **downstream** metrics (WER on a small labeled clip set, or behavioral/technical scores on the same audio) with `whisper-small` vs `whisper-base` vs `whisper-tiny`.
2. Trade off **latency** on your host (Render/Railway CPU) vs transcript quality—document the chosen default in `api/config.py` comments.

### Behavioral / Fit calibration (optional)

Rubric scores in `api/ml/behavioral.py` and fusion in `api/services/fit.py` can be tuned against **human ratings** on a small batch of anonymized transcripts; adjust weights only with before/after frozen-eval comparisons.

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

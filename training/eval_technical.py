"""
Evaluate fine-tuned DistilBERT on a held-out split of the JSONL dataset (same seed as training).
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
from datasets import Dataset
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from transformers import AutoModelForSequenceClassification, AutoTokenizer


def load_jsonl(path: Path) -> Dataset:
    texts, labels = [], []
    with path.open(encoding="utf-8") as f:
        for line in f:
            row = json.loads(line)
            texts.append(row["text"])
            labels.append(int(row["level"]))
    return Dataset.from_dict({"text": texts, "label": labels})


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, default=Path("training/data/technical_train.jsonl"))
    ap.add_argument("--model-dir", type=Path, default=Path("models/technical"))
    ap.add_argument("--seed", type=int, default=42, help="Must match training split to mirror held-out set.")
    ap.add_argument("--batch-size", type=int, default=32)
    args = ap.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    ds = load_jsonl(args.data)
    split = ds.train_test_split(test_size=0.1, seed=args.seed)
    eval_ds = split["test"]

    tokenizer = AutoTokenizer.from_pretrained(str(args.model_dir))
    model = AutoModelForSequenceClassification.from_pretrained(str(args.model_dir))
    model.to(device)
    model.eval()

    labels_all: list[int] = []
    preds_all: list[int] = []

    texts = eval_ds["text"]
    labels = eval_ds["label"]
    bs = args.batch_size
    level_names = ["Novice", "Developing", "Proficient", "Strong"]

    with torch.no_grad():
        for i in range(0, len(texts), bs):
            batch_texts = texts[i : i + bs]
            batch_labels = labels[i : i + bs]
            enc = tokenizer(
                batch_texts,
                truncation=True,
                padding=True,
                max_length=256,
                return_tensors="pt",
            )
            enc = {k: v.to(device) for k, v in enc.items()}
            logits = model(**enc).logits
            pred = logits.argmax(dim=-1).cpu().numpy().tolist()
            preds_all.extend(pred)
            labels_all.extend(batch_labels)

    acc = accuracy_score(labels_all, preds_all)
    cm = confusion_matrix(labels_all, preds_all, labels=[0, 1, 2, 3])
    print(f"Eval samples: {len(labels_all)}")
    print(f"Accuracy: {acc:.4f}")
    print("Confusion matrix (rows=true, cols=pred):")
    print(cm)
    print(classification_report(labels_all, preds_all, target_names=level_names, digits=4, zero_division=0))


if __name__ == "__main__":
    main()

"""
Evaluate workspace CNN checkpoint on an ImageFolder (e.g. training/data/workspace).
Prints accuracy, confusion matrix, and per-class metrics.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from torchvision import datasets, models, transforms
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
import json


def build_model(num_classes: int) -> nn.Module:
    m = models.resnet18(weights=None)
    in_features = m.fc.in_features
    m.fc = nn.Linear(in_features, num_classes)
    return m


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", type=Path, default=Path("training/data/workspace"))
    ap.add_argument("--checkpoint", type=Path, default=Path("models/workspace/workspace_cnn.pt"))
    ap.add_argument("--batch-size", type=int, default=32)
    ap.add_argument("--save-json", type=Path, default=None, help="Optional path to write metrics JSON.")
    args = ap.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    ckpt = torch.load(args.checkpoint, map_location=device)
    classes: list[str] = list(ckpt["classes"])
    model = build_model(len(classes)).to(device)
    model.load_state_dict(ckpt["state_dict"])
    model.eval()

    tfm = transforms.Compose(
        [
            transforms.Resize(256),
            transforms.CenterCrop(224),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ]
    )
    ds = datasets.ImageFolder(str(args.data_dir), transform=tfm)
    # Map folder index order to checkpoint class names (must match training ImageFolder order)
    if list(ds.classes) != classes:
        print("Warning: folder class names differ from checkpoint:", ds.classes, "vs", classes)

    loader = DataLoader(ds, batch_size=args.batch_size, shuffle=False, num_workers=0)

    all_y: list[int] = []
    all_pred: list[int] = []
    with torch.no_grad():
        for x, y in loader:
            x = x.to(device)
            logits = model(x)
            pred = logits.argmax(dim=1).cpu().tolist()
            all_pred.extend(pred)
            all_y.extend(y.tolist())

    acc = accuracy_score(all_y, all_pred)
    cm = confusion_matrix(all_y, all_pred, labels=list(range(len(classes))))
    print(f"Samples: {len(all_y)}")
    print(f"Accuracy: {acc:.4f}")
    print("Confusion matrix (rows=true, cols=pred):")
    print(cm)
    report = classification_report(all_y, all_pred, target_names=classes, digits=4, zero_division=0)
    print(report)

    if args.save_json is not None:
        payload = {
            "samples": int(len(all_y)),
            "accuracy": float(acc),
            "confusion_matrix": cm.tolist(),
            "labels": classes,
        }
        args.save_json.parent.mkdir(parents=True, exist_ok=True)
        args.save_json.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        print(f"Wrote metrics JSON to {args.save_json}")


if __name__ == "__main__":
    main()

"""
Train a 2-class workspace CNN using a torchvision ResNet18 backbone (ImageNet weights).
Expects ImageFolder layout: root/professional/*.png and root/unprofessional/*.png
"""
from __future__ import annotations

import argparse
from pathlib import Path

import torch
import torch.nn as nn
from torch.utils.data import DataLoader, random_split
from torchvision import datasets, models, transforms


def build_model(num_classes: int = 2, pretrained: bool = True) -> nn.Module:
    w = models.ResNet18_Weights.IMAGENET1K_V1 if pretrained else None
    m = models.resnet18(weights=w)
    in_features = m.fc.in_features
    m.fc = nn.Linear(in_features, num_classes)
    return m


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", type=Path, default=Path("training/data/workspace"))
    ap.add_argument("--out", type=Path, default=Path("models/workspace/workspace_cnn.pt"))
    ap.add_argument("--epochs", type=int, default=8)
    ap.add_argument("--batch-size", type=int, default=32)
    ap.add_argument("--lr", type=float, default=1e-4)
    ap.add_argument("--val-fraction", type=float, default=0.15)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument(
        "--no-pretrained",
        action="store_true",
        help="Skip ImageNet weights (use if weight download fails e.g. SSL on locked-down networks).",
    )
    args = ap.parse_args()

    torch.manual_seed(args.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    tfm = transforms.Compose(
        [
            transforms.Resize(256),
            transforms.CenterCrop(224),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ]
    )

    full = datasets.ImageFolder(str(args.data_dir), transform=tfm)
    n_val = max(1, int(len(full) * args.val_fraction))
    n_train = len(full) - n_val
    train_ds, val_ds = random_split(
        full, [n_train, n_val], generator=torch.Generator().manual_seed(args.seed)
    )

    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_ds, batch_size=args.batch_size, shuffle=False, num_workers=0)

    pretrained = not args.no_pretrained
    if not pretrained:
        print("Training from scratch (no ImageNet backbone weights).")
    model = build_model(pretrained=pretrained).to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr)

    best_val = 0.0
    best_state = None

    for epoch in range(args.epochs):
        model.train()
        total_loss = 0.0
        for x, y in train_loader:
            x, y = x.to(device), y.to(device)
            optimizer.zero_grad()
            logits = model(x)
            loss = criterion(logits, y)
            loss.backward()
            optimizer.step()
            total_loss += loss.item() * x.size(0)

        model.eval()
        correct = 0
        total = 0
        with torch.no_grad():
            for x, y in val_loader:
                x, y = x.to(device), y.to(device)
                pred = model(x).argmax(dim=1)
                correct += (pred == y).sum().item()
                total += y.numel()
        acc = correct / max(1, total)
        avg_loss = total_loss / max(1, n_train)
        print(f"epoch {epoch+1}/{args.epochs}  train_loss={avg_loss:.4f}  val_acc={acc:.4f}")

        if acc >= best_val:
            best_val = acc
            best_state = {k: v.cpu() for k, v in model.state_dict().items()}

    args.out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "classes": full.classes,
        "state_dict": best_state if best_state is not None else model.cpu().state_dict(),
        "val_acc": float(best_val),
        "backbone": "resnet18",
    }
    torch.save(payload, args.out)
    print(f"Saved checkpoint to {args.out} (best val_acc={best_val:.4f})")


if __name__ == "__main__":
    main()

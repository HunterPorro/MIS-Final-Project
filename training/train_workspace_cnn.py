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
from sklearn.metrics import f1_score


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
    ap.add_argument("--patience", type=int, default=2, help="Early stopping patience (epochs).")
    ap.add_argument(
        "--no-pretrained",
        action="store_true",
        help="Skip ImageNet weights (use if weight download fails e.g. SSL on locked-down networks).",
    )
    args = ap.parse_args()

    torch.manual_seed(args.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    # Augmentations help generalization on real webcam backgrounds.
    train_tfm = transforms.Compose(
        [
            transforms.RandomResizedCrop(224, scale=(0.75, 1.0), ratio=(0.9, 1.1)),
            transforms.ColorJitter(brightness=0.15, contrast=0.15, saturation=0.1, hue=0.02),
            transforms.RandomHorizontalFlip(p=0.5),
            transforms.RandomRotation(degrees=6),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ]
    )
    eval_tfm = transforms.Compose(
        [
            transforms.Resize(256),
            transforms.CenterCrop(224),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ]
    )

    # For correct evaluation transforms, we build two datasets sharing the same file ordering.
    full_train = datasets.ImageFolder(str(args.data_dir), transform=train_tfm)
    full_eval = datasets.ImageFolder(str(args.data_dir), transform=eval_tfm)
    n_val = max(1, int(len(full_train) * args.val_fraction))
    n_train = len(full_train) - n_val
    train_idx, val_idx = random_split(
        list(range(len(full_train))),
        [n_train, n_val],
        generator=torch.Generator().manual_seed(args.seed),
    )
    # Wrap subsets to apply different transforms.
    train_ds = torch.utils.data.Subset(full_train, train_idx.indices)
    val_ds = torch.utils.data.Subset(full_eval, val_idx.indices)

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
    best_epoch = 0
    epochs_no_improve = 0

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
        y_true: list[int] = []
        y_pred: list[int] = []
        with torch.no_grad():
            for x, y in val_loader:
                x, y = x.to(device), y.to(device)
                pred = model(x).argmax(dim=1)
                correct += (pred == y).sum().item()
                total += y.numel()
                y_true.extend(y.cpu().numpy().tolist())
                y_pred.extend(pred.cpu().numpy().tolist())
        acc = correct / max(1, total)
        macro_f1 = f1_score(y_true, y_pred, average="macro", zero_division=0) if total > 0 else 0.0
        avg_loss = total_loss / max(1, n_train)
        print(
            f"epoch {epoch+1}/{args.epochs}  train_loss={avg_loss:.4f}  val_acc={acc:.4f}  val_macro_f1={macro_f1:.4f}"
        )

        # Prefer macro-F1 as the selection metric (more robust than raw accuracy under imbalance).
        score = float(macro_f1)
        if score >= best_val:
            best_val = score
            best_state = {k: v.cpu() for k, v in model.state_dict().items()}
            best_epoch = epoch + 1
            epochs_no_improve = 0
        else:
            epochs_no_improve += 1
            if epochs_no_improve >= max(1, int(args.patience)):
                print(f"Early stopping at epoch {epoch+1} (best_epoch={best_epoch}, best_val_macro_f1={best_val:.4f})")
                break

    args.out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "classes": full_train.classes,
        "state_dict": best_state if best_state is not None else model.cpu().state_dict(),
        "val_macro_f1": float(best_val),
        "best_epoch": int(best_epoch),
        "backbone": "resnet18",
    }
    torch.save(payload, args.out)
    print(f"Saved checkpoint to {args.out} (best val_macro_f1={best_val:.4f})")


if __name__ == "__main__":
    main()

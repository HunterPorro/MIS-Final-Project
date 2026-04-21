from __future__ import annotations

from pathlib import Path

import torch
import torch.nn as nn
from PIL import Image
from torchvision import models, transforms


def build_model(num_classes: int) -> nn.Module:
    m = models.resnet18(weights=None)
    in_features = m.fc.in_features
    m.fc = nn.Linear(in_features, num_classes)
    return m


class WorkspaceClassifier:
    def __init__(self, checkpoint_path: Path, device: torch.device | None = None) -> None:
        self.device = device or torch.device("cuda" if torch.cuda.is_available() else "cpu")
        ckpt = torch.load(checkpoint_path, map_location=self.device)
        self.classes: list[str] = list(ckpt["classes"])
        self.model = build_model(len(self.classes)).to(self.device)
        self.model.load_state_dict(ckpt["state_dict"])
        self.model.eval()
        self.transform = transforms.Compose(
            [
                transforms.Resize(256),
                transforms.CenterCrop(224),
                transforms.ToTensor(),
                transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
            ]
        )

    @torch.inference_mode()
    def predict_pil(self, image: Image.Image) -> tuple[str, float, int]:
        if image.mode != "RGB":
            image = image.convert("RGB")
        x = self.transform(image).unsqueeze(0).to(self.device)
        logits = self.model(x)
        probs = torch.softmax(logits, dim=1).squeeze(0)
        idx = int(probs.argmax().item())
        conf = float(probs[idx].item())
        return self.classes[idx], conf, idx

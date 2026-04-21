"""
Generate synthetic 224x224 RGB images for demo training.
Class 0 (professional): smooth gradients + structured horizontal bands (office-like).
Class 1 (unprofessional): heavy noise + chaotic color blobs.
A real deployment should replace this with ImageFolder of real webcam crops.
"""
from __future__ import annotations

import argparse
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


def make_professional(rng: random.Random, size: int = 224) -> Image.Image:
    arr = np.zeros((size, size, 3), dtype=np.uint8)
    base = rng.randint(180, 220)
    for c in range(3):
        arr[:, :, c] = np.clip(
            base + np.linspace(-25, 25, size, dtype=np.int16)[:, None] + rng.randint(-5, 5),
            0,
            255,
        ).astype(np.uint8)
    # desk band
    y0 = rng.randint(size // 3, 2 * size // 3)
    arr[y0 : y0 + rng.randint(8, 20), :, :] = (
        np.array(rng.sample(range(80, 140), 3), dtype=np.uint8)[None, None, :]
    )
    img = Image.fromarray(arr, mode="RGB")
    draw = ImageDraw.Draw(img)
    draw.rectangle([10, 10, size - 10, size - 10], outline=(200, 200, 200), width=2)
    return img


def make_unprofessional(rng: random.Random, size: int = 224) -> Image.Image:
    noise = np.random.default_rng(rng.randint(0, 2**31 - 1)).integers(0, 256, (size, size, 3), dtype=np.uint8)
    img = Image.fromarray(noise, mode="RGB")
    draw = ImageDraw.Draw(img)
    for _ in range(rng.randint(15, 40)):
        x1, y1 = rng.randint(0, size - 1), rng.randint(0, size - 1)
        x2, y2 = rng.randint(0, size - 1), rng.randint(0, size - 1)
        draw.line((x1, y1, x2, y2), fill=(rng.randint(0, 255), rng.randint(0, 255), rng.randint(0, 255)), width=2)
    for _ in range(rng.randint(5, 15)):
        r = rng.randint(10, 40)
        cx, cy = rng.randint(r, size - r), rng.randint(r, size - r)
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(rng.randint(0, 255),) * 3, width=2)
    return img


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--out", type=Path, default=Path("training/data/workspace"))
    p.add_argument("--per-class", type=int, default=400)
    p.add_argument("--seed", type=int, default=42)
    args = p.parse_args()

    rng = random.Random(args.seed)
    prof = args.out / "professional"
    unprof = args.out / "unprofessional"
    prof.mkdir(parents=True, exist_ok=True)
    unprof.mkdir(parents=True, exist_ok=True)

    for i in range(args.per_class):
        make_professional(rng).save(prof / f"p_{i:05d}.png")
        make_unprofessional(rng).save(unprof / f"u_{i:05d}.png")

    print(f"Wrote {args.per_class} images per class to {args.out}")


if __name__ == "__main__":
    main()

"""
Generate ~6000 rows of class-conditional synthetic data for the hirability classifier.

Label distribution: ~15% No Hire, ~30% Needs Work, ~35% Lean Hire, ~20% Strong Hire
Label noise: 6%
Output: training/data/hirability_train.csv
"""

from pathlib import Path

import numpy as np
import pandas as pd

SEED = 42
N_ROWS = 6000
NOISE_RATE = 0.06
LABELS = ["No Hire", "Needs Work", "Lean Hire", "Strong Hire"]

FEATURES = [
    "env_score",
    "technical_component",
    "level_confidence",
    "coverage_score",
    "explanation_score",
    "behavioral_score",
    "star_hits",
    "has_outcome_number",
    "filler_per_100",
    "hedge_hits",
    "word_count",
    "delivery_score",
]

rng = np.random.default_rng(SEED)

n_no = int(N_ROWS * 0.15)
n_nw = int(N_ROWS * 0.30)
n_lh = int(N_ROWS * 0.35)
n_sh = N_ROWS - n_no - n_nw - n_lh
class_counts = [n_no, n_nw, n_lh, n_sh]


def clip(arr: np.ndarray, lo: float, hi: float) -> np.ndarray:
    return np.clip(arr, lo, hi)


def gen_no_hire(n: int) -> np.ndarray:
    env        = clip(rng.normal(30, 18, n), 0, 70)
    tech       = clip(rng.normal(28, 12, n), 5, 60)
    lconf      = clip(rng.normal(0.33, 0.13, n), 0.10, 0.70)
    coverage   = clip(rng.normal(24, 12, n), 5, 58)
    expl       = clip(rng.normal(21, 12, n), 5, 55)
    beh        = clip(rng.normal(27, 12, n), 5, 58)
    star       = clip(rng.integers(0, 2, n).astype(float), 0, 4)
    outcome    = rng.binomial(1, 0.12, n).astype(float)
    filler     = clip(rng.gamma(5.0, 4.0, n), 5, 55)
    hedge      = clip(rng.poisson(7, n).astype(float), 2, 22)
    words      = clip(rng.normal(85, 35, n), 20, 200)
    delivery   = clip(rng.normal(27, 12, n), 5, 58)
    return np.column_stack([env, tech, lconf, coverage, expl, beh, star, outcome, filler, hedge, words, delivery])


def gen_needs_work(n: int) -> np.ndarray:
    env        = clip(rng.normal(47, 18, n), 10, 88)
    tech       = clip(rng.normal(44, 12, n), 18, 76)
    lconf      = clip(rng.normal(0.50, 0.14, n), 0.20, 0.84)
    coverage   = clip(rng.normal(41, 13, n), 10, 76)
    expl       = clip(rng.normal(39, 13, n), 10, 74)
    beh        = clip(rng.normal(44, 12, n), 18, 76)
    star       = clip(rng.integers(1, 3, n).astype(float), 0, 4)
    outcome    = rng.binomial(1, 0.33, n).astype(float)
    filler     = clip(rng.gamma(3.0, 3.5, n), 2, 32)
    hedge      = clip(rng.poisson(4, n).astype(float), 0, 15)
    words      = clip(rng.normal(128, 44, n), 48, 280)
    delivery   = clip(rng.normal(45, 14, n), 18, 80)
    return np.column_stack([env, tech, lconf, coverage, expl, beh, star, outcome, filler, hedge, words, delivery])


def gen_lean_hire(n: int) -> np.ndarray:
    env        = clip(rng.normal(64, 15, n), 30, 98)
    tech       = clip(rng.normal(62, 10, n), 38, 90)
    lconf      = clip(rng.normal(0.64, 0.11, n), 0.34, 0.98)
    coverage   = clip(rng.normal(59, 12, n), 28, 94)
    expl       = clip(rng.normal(57, 12, n), 24, 92)
    beh        = clip(rng.normal(62, 10, n), 38, 90)
    star       = clip(rng.integers(2, 4, n).astype(float), 0, 4)
    outcome    = rng.binomial(1, 0.58, n).astype(float)
    filler     = clip(rng.gamma(2.0, 2.5, n), 0, 20)
    hedge      = clip(rng.poisson(2, n).astype(float), 0, 10)
    words      = clip(rng.normal(168, 44, n), 78, 350)
    delivery   = clip(rng.normal(62, 12, n), 34, 94)
    return np.column_stack([env, tech, lconf, coverage, expl, beh, star, outcome, filler, hedge, words, delivery])


def gen_strong_hire(n: int) -> np.ndarray:
    env        = clip(rng.normal(80, 10, n), 50, 100)
    tech       = clip(rng.normal(80, 8, n), 54, 100)
    lconf      = clip(rng.normal(0.80, 0.09, n), 0.50, 1.0)
    coverage   = clip(rng.normal(76, 9, n), 48, 100)
    expl       = clip(rng.normal(75, 9, n), 44, 100)
    beh        = clip(rng.normal(80, 8, n), 54, 100)
    star       = clip(rng.integers(3, 5, n).astype(float), 0, 4)
    outcome    = rng.binomial(1, 0.84, n).astype(float)
    filler     = clip(rng.gamma(1.2, 1.4, n), 0, 10)
    hedge      = clip(rng.poisson(1, n).astype(float), 0, 5)
    words      = clip(rng.normal(212, 38, n), 118, 400)
    delivery   = clip(rng.normal(79, 9, n), 50, 100)
    return np.column_stack([env, tech, lconf, coverage, expl, beh, star, outcome, filler, hedge, words, delivery])


generators = [gen_no_hire, gen_needs_work, gen_lean_hire, gen_strong_hire]

blocks: list[np.ndarray] = []
labels: list[int] = []
for label_idx, (gen, n) in enumerate(zip(generators, class_counts)):
    blocks.append(gen(n))
    labels.extend([label_idx] * n)

X = np.vstack(blocks)
y = np.array(labels, dtype=int)

# 6% label noise
noise_mask = rng.random(len(y)) < NOISE_RATE
y[noise_mask] = rng.integers(0, 4, size=int(noise_mask.sum()))

perm = rng.permutation(len(y))
X, y = X[perm], y[perm]

df = pd.DataFrame(X, columns=FEATURES)
df["label"] = y
df["label_str"] = [LABELS[i] for i in y]

out_path = Path(__file__).parent / "data" / "hirability_train.csv"
out_path.parent.mkdir(parents=True, exist_ok=True)
df.to_csv(out_path, index=False)

print(f"Wrote {len(df)} rows to {out_path}")
print(df["label_str"].value_counts().sort_index())

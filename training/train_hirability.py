"""
Train a hirability classifier.

Compares LogisticRegression, RandomForest, and GradientBoosting via 5-fold CV.
Saves the best tree-based model as a scikit-learn Pipeline to:
  models/hirability/model.joblib

Also writes:
  models/hirability/metadata.json      (feature means/stds + importances for SHAP-lite)
  models/hirability/classification_report.txt
  models/hirability/confusion_matrix.csv
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
import joblib

DATA_PATH = Path(__file__).parent / "data" / "hirability_train.csv"
OUT_DIR = Path(__file__).parent.parent / "models" / "hirability"
OUT_DIR.mkdir(parents=True, exist_ok=True)

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
LABELS = ["No Hire", "Needs Work", "Lean Hire", "Strong Hire"]

print("Loading data from", DATA_PATH)
df = pd.read_csv(DATA_PATH)
X = df[FEATURES].values.astype(np.float32)
y = df["label"].values.astype(int)
print(f"  {len(df)} rows, class distribution:")
for i, lbl in enumerate(LABELS):
    print(f"    {lbl}: {(y == i).sum()}")

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.20, random_state=42, stratify=y
)
print(f"\nTrain: {len(X_train)}  Test: {len(X_test)}")

candidates: dict[str, Pipeline] = {
    "LogisticRegression": Pipeline([
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(
            max_iter=1000, random_state=42, class_weight="balanced",
            C=1.0, solver="lbfgs",
        )),
    ]),
    "RandomForest": Pipeline([
        ("scaler", StandardScaler()),
        ("clf", RandomForestClassifier(
            n_estimators=400, max_depth=12, min_samples_leaf=3,
            random_state=42, class_weight="balanced", n_jobs=-1,
        )),
    ]),
    "GradientBoosting": Pipeline([
        ("scaler", StandardScaler()),
        ("clf", GradientBoostingClassifier(
            n_estimators=250, max_depth=4, learning_rate=0.07,
            subsample=0.85, random_state=42,
        )),
    ]),
}

cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
print("\nCross-validating (5-fold macro-F1):")
scores: dict[str, float] = {}
for name, pipe in candidates.items():
    cv_f1 = cross_val_score(pipe, X_train, y_train, cv=cv, scoring="f1_macro", n_jobs=-1)
    scores[name] = float(cv_f1.mean())
    print(f"  {name:25s}  {scores[name]:.4f} ± {cv_f1.std():.4f}")

tree_names = [n for n in candidates if n != "LogisticRegression"]
best_name = max(tree_names, key=lambda n: scores[n])
print(f"\nBest tree-based model: {best_name}  (macro-F1 = {scores[best_name]:.4f})")

best_pipe = candidates[best_name]
print("Fitting on full training set ...")
best_pipe.fit(X_train, y_train)

y_pred = best_pipe.predict(X_test)
report = classification_report(y_test, y_pred, target_names=LABELS)
print("\nTest-set classification report:")
print(report)

cm = confusion_matrix(y_test, y_pred)
print("Confusion matrix (rows=true, cols=pred):")
print(cm)

model_path = OUT_DIR / "model.joblib"
joblib.dump(best_pipe, model_path)
print(f"\nSaved model -> {model_path}")

clf = best_pipe.named_steps["clf"]
importances: dict[str, float] = {}
if hasattr(clf, "feature_importances_"):
    importances = dict(zip(FEATURES, clf.feature_importances_.tolist()))

feat_means = dict(zip(FEATURES, X_train.mean(axis=0).tolist()))
feat_stds  = dict(zip(FEATURES, X_train.std(axis=0).tolist()))

# Compute test macro-F1 directly from report rather than re-running CV
from sklearn.metrics import f1_score
test_macro_f1 = float(f1_score(y_test, y_pred, average="macro"))

metadata = {
    "model_type": best_name,
    "features": FEATURES,
    "labels": LABELS,
    "feature_means": feat_means,
    "feature_stds": feat_stds,
    "feature_importances": importances,
    "cv_macro_f1": scores[best_name],
    "test_macro_f1": test_macro_f1,
    "all_cv_scores": scores,
}
meta_path = OUT_DIR / "metadata.json"
with open(meta_path, "w") as fh:
    json.dump(metadata, fh, indent=2)
print(f"Saved metadata -> {meta_path}")

(OUT_DIR / "classification_report.txt").write_text(
    f"Model: {best_name}\n"
    f"CV macro-F1: {scores[best_name]:.4f}\n"
    f"Test macro-F1: {test_macro_f1:.4f}\n\n"
    + report
)

cm_df = pd.DataFrame(cm, index=LABELS, columns=LABELS)
cm_df.to_csv(OUT_DIR / "confusion_matrix.csv")
print("Saved classification_report.txt and confusion_matrix.csv")

if importances:
    print("\nTop feature importances:")
    for feat, imp in sorted(importances.items(), key=lambda t: t[1], reverse=True):
        bar = "#" * int(imp * 40)
        print(f"  {feat:25s} {imp:.4f}  {bar}")

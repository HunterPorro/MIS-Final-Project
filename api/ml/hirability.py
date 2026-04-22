from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

logger = logging.getLogger("final-round-api.hirability")

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

_ROOT = Path(__file__).parent.parent.parent
MODEL_PATH = _ROOT / "models" / "hirability" / "model.joblib"
META_PATH = _ROOT / "models" / "hirability" / "metadata.json"

_FACTOR_LABELS: dict[str, tuple[str, str]] = {
    "env_score": ("Professional environment", "Poor environment"),
    "technical_component": ("Strong technical score", "Weak technical score"),
    "level_confidence": ("High expertise confidence", "Low expertise confidence"),
    "coverage_score": ("Good rubric coverage", "Thin rubric coverage"),
    "explanation_score": ("Clear causal reasoning", "Lacking causal reasoning"),
    "behavioral_score": ("Strong behavioral score", "Weak behavioral score"),
    "star_hits": ("Good STAR structure", "Incomplete STAR structure"),
    "has_outcome_number": ("Quantified outcome", "No quantified outcome"),
    "filler_per_100": ("Low filler rate", "High filler rate"),
    "hedge_hits": ("Low hedge usage", "Excessive hedging"),
    "word_count": ("Sufficient response length", "Response too brief"),
    "delivery_score": ("Strong delivery", "Weak delivery"),
}
_NEGATIVE_FEATS = {"filler_per_100", "hedge_hits"}


@dataclass
class HirabilityPrediction:
    label: str
    label_index: int
    probabilities: dict[str, float]
    top_factors: list[str] = field(default_factory=list)
    method: str = "model"


def _rule_predict(features: dict[str, float]) -> HirabilityPrediction:
    score = (
        features.get("technical_component", 50.0) * 0.40
        + features.get("behavioral_score", 50.0) * 0.25
        + features.get("env_score", 50.0) * 0.15
        + features.get("coverage_score", 50.0) * 0.10
        + features.get("delivery_score", 50.0) * 0.10
    )
    fp100 = features.get("filler_per_100", 0.0)
    hh = features.get("hedge_hits", 0.0)
    hon = features.get("has_outcome_number", 0.0)
    wc = features.get("word_count", 100.0)
    if fp100 > 15:
        score -= 5
    if hh > 5:
        score -= 3
    if hon < 0.5:
        score -= 3
    if wc < 80:
        score -= 8
    score = float(np.clip(score, 0, 100))

    if score >= 78:
        idx = 3
    elif score >= 58:
        idx = 2
    elif score >= 38:
        idx = 1
    else:
        idx = 0

    probs = [0.10 / 3] * 4
    probs[idx] = 0.90
    remaining = 0.10 / 3
    for i in range(4):
        if i != idx:
            probs[i] = remaining

    factors: list[str] = []
    tech = features.get("technical_component", 50.0)
    beh = features.get("behavioral_score", 50.0)
    cov = features.get("coverage_score", 50.0)
    if tech >= 65:
        factors.append("Strong technical score")
    elif tech < 40:
        factors.append("Weak technical score")
    if beh >= 65:
        factors.append("Strong behavioral score")
    elif beh < 40:
        factors.append("Weak behavioral score")
    if fp100 > 12:
        factors.append("High filler rate")
    if hon > 0.5:
        factors.append("Quantified outcome")
    if cov >= 60:
        factors.append("Good rubric coverage")
    if not factors:
        factors = ["Rule-based baseline"]

    return HirabilityPrediction(
        label=LABELS[idx],
        label_index=idx,
        probabilities={lbl: round(p, 3) for lbl, p in zip(LABELS, probs)},
        top_factors=factors[:3],
        method="rules",
    )


def _shap_lite_factors(
    features: dict[str, float],
    means: dict[str, float],
    stds: dict[str, float],
    importances: dict[str, float],
) -> list[str]:
    scored: list[tuple[str, float, bool]] = []
    for feat in FEATURES:
        imp = importances.get(feat, 0.0)
        val = features.get(feat, 0.0)
        mu = means.get(feat, 0.0)
        sd = stds.get(feat, 1.0) or 1.0
        z = (val - mu) / sd
        positive = z > 0
        if feat in _NEGATIVE_FEATS:
            positive = not positive
        scored.append((feat, imp * abs(z), positive))
    scored.sort(key=lambda t: t[1], reverse=True)
    factors = []
    for feat, _, positive in scored[:5]:
        pair = _FACTOR_LABELS.get(feat, (feat, feat))
        factors.append(pair[0] if positive else pair[1])
    return factors[:3]


class HirabilityClassifier:
    def __init__(self) -> None:
        self._pipeline = None
        self._meta: dict = {}
        self._loaded = False
        self._try_load()

    def _try_load(self) -> None:
        if not MODEL_PATH.exists():
            logger.info("hirability model not found at %s — using rule-based fallback", MODEL_PATH)
            return
        try:
            import joblib

            self._pipeline = joblib.load(MODEL_PATH)
            if META_PATH.exists():
                with open(META_PATH) as fh:
                    self._meta = json.load(fh)
            self._loaded = True
            logger.info("hirability model loaded from %s", MODEL_PATH)
        except Exception as exc:
            logger.warning("hirability model load failed (%s) — using rule-based fallback", exc)

    def predict(self, features: dict[str, float]) -> HirabilityPrediction:
        if not self._loaded or self._pipeline is None:
            return _rule_predict(features)
        try:
            x = np.array([[features.get(f, 0.0) for f in FEATURES]], dtype=np.float32)
            proba: np.ndarray = self._pipeline.predict_proba(x)[0]
            idx = int(np.argmax(proba))
            means = self._meta.get("feature_means", {})
            stds = self._meta.get("feature_stds", {})
            imps = self._meta.get("feature_importances", {})
            if imps:
                factors = _shap_lite_factors(features, means, stds, imps)
            else:
                factors = _rule_predict(features).top_factors
            return HirabilityPrediction(
                label=LABELS[idx],
                label_index=idx,
                probabilities={lbl: round(float(p), 3) for lbl, p in zip(LABELS, proba)},
                top_factors=factors,
                method="model",
            )
        except Exception as exc:
            logger.warning("hirability predict failed (%s) — falling back to rules", exc)
            return _rule_predict(features)


_instance: HirabilityClassifier | None = None


def get_hirability_classifier() -> HirabilityClassifier:
    global _instance
    if _instance is None:
        _instance = HirabilityClassifier()
    return _instance


def predict_hirability(features: dict[str, float]) -> HirabilityPrediction:
    return get_hirability_classifier().predict(features)

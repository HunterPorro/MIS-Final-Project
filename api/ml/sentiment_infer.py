from __future__ import annotations

import logging
import re
import threading
from dataclasses import dataclass

logger = logging.getLogger(__name__)

_pipe = None
_lock = threading.Lock()


@dataclass(frozen=True)
class SentimentResult:
    tone: str  # confident | neutral | hesitant | negative | mixed
    dominant_emotion: str
    emotion_scores: dict[str, float]
    note: str


def _truncate_words(text: str, max_words: int = 220) -> str:
    t = re.sub(r"\s+", " ", text.strip())
    words = t.split(" ") if t else []
    if len(words) <= max_words:
        return t
    return " ".join(words[:max_words])


def _map_tone(
    scores: dict[str, float],
    *,
    hedge_heavy: bool,
) -> str:
    """Map emotion distribution + hedging to interview-oriented tone."""
    joy = scores.get("joy", 0.0)
    neutral = scores.get("neutral", 0.0)
    surprise = scores.get("surprise", 0.0)
    fear = scores.get("fear", 0.0)
    sadness = scores.get("sadness", 0.0)
    anger = scores.get("anger", 0.0)
    disgust = scores.get("disgust", 0.0)

    neg = sadness + anger + disgust + fear
    pos_like = joy + neutral * 0.85 + surprise * 0.35

    if hedge_heavy and neg < 0.45:
        return "hesitant"
    if neg >= 0.42 and neg > pos_like:
        return "negative"
    if pos_like >= 0.38 and neg < 0.28:
        return "confident"
    if abs(pos_like - neg) < 0.12:
        return "mixed"
    if neutral >= 0.34 and neg < 0.3:
        return "neutral"
    if fear + surprise >= 0.35 and neg >= 0.25:
        return "hesitant"
    return "neutral"


def _label_to_emotion_key(pipe: object, lab: object) -> str:
    """Map pipeline label (string or class id) to a lowercase emotion name."""
    cfg = getattr(getattr(pipe, "model", None), "config", None)
    id2 = getattr(cfg, "id2label", None) if cfg else None
    if isinstance(id2, dict):
        if isinstance(lab, int) and lab in id2:
            return str(id2[lab]).lower()
        s = str(lab)
        if s.isdigit():
            idx = int(s)
            if idx in id2:
                return str(id2[idx]).lower()
    raw = str(lab).lower().replace("label_", "")
    return raw


def _tone_note(tone: str) -> str:
    return {
        "confident": "Tone reads assertive and positive—keep specifics tight.",
        "neutral": "Tone is fairly neutral on language alone—layer in crisp outcomes.",
        "hesitant": "Language sounds tentative—reduce hedging and name one fact per claim.",
        "negative": "Some negative affect in wording—reframe obstacles as actions you owned.",
        "mixed": "Mixed emotional cues in text—prioritize clarity and outcome metrics.",
    }.get(tone, "Tone signal is mixed—focus on structure and metrics.")


def analyze_sentiment(transcript: str, *, hedge_hits: int = 0) -> SentimentResult | None:
    """
    DistilRoBERTa emotion classifier (7-way). Returns None if transformers/model unavailable.
    """
    global _pipe
    text = _truncate_words(transcript)
    if len(text) < 12:
        return None

    hedge_heavy = hedge_hits >= 3

    try:
        from transformers import pipeline
    except ImportError:
        logger.warning("transformers not available for sentiment")
        return None

    with _lock:
        if _pipe is None:
            try:
                _pipe = pipeline(
                    "text-classification",
                    model="j-hartmann/emotion-english-distilroberta-base",
                    top_k=None,
                    truncation=True,
                    device=-1,
                )
            except Exception as e:
                logger.warning("Could not load emotion model: %s", e)
                return None

    try:
        raw = _pipe(text)
    except Exception as e:
        logger.warning("emotion inference failed: %s", e)
        return None

    # pipeline may return list of lists when top_k=None
    items = raw[0] if raw and isinstance(raw[0], list) else raw
    scores: dict[str, float] = {}
    for it in items:
        if isinstance(it, dict) and "label" in it and "score" in it:
            key = _label_to_emotion_key(_pipe, it["label"])
            sc = float(it["score"])
            scores[key] = max(scores.get(key, 0.0), sc)

    if not scores:
        return None

    dominant = max(scores, key=scores.get)
    tone = _map_tone(scores, hedge_heavy=hedge_heavy)

    return SentimentResult(
        tone=tone,
        dominant_emotion=dominant,
        emotion_scores={k: round(v, 4) for k, v in sorted(scores.items(), key=lambda x: -x[1])[:8]},
        note=_tone_note(tone),
    )

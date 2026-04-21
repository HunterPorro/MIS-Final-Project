from __future__ import annotations

from api.ml.prosody import ProsodyResult
from api.ml.sentiment_infer import SentimentResult


def delivery_score_0_100(
    sentiment: SentimentResult | None,
    prosody: ProsodyResult,
) -> float:
    """
    Combine transcript emotion + audio prosody into a 0–100 delivery score for Fit weighting.
    """
    # Prosody base
    if prosody.label == "steady":
        p = 72.0
    elif prosody.label == "rushed":
        p = 58.0
    else:
        p = 52.0

    if sentiment is None:
        return max(0.0, min(100.0, round(0.55 * p + 0.45 * 58.0, 1)))

    t = sentiment.tone
    if t == "confident":
        s = 78.0
    elif t == "neutral":
        s = 64.0
    elif t == "mixed":
        s = 58.0
    elif t == "hesitant":
        s = 52.0
    else:
        s = 46.0

    combined = 0.48 * s + 0.52 * p
    return max(0.0, min(100.0, round(combined, 1)))

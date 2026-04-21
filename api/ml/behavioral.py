from __future__ import annotations

import re
from dataclasses import dataclass


FILLER_WORDS = [
    "um",
    "uh",
    "like",
    "you know",
    "sort of",
    "kind of",
    "basically",
    "actually",
]


@dataclass(frozen=True)
class BehavioralResult:
    score: float
    star_coverage: dict[str, bool]
    filler_words: dict[str, int]
    filler_total: int
    word_count: int
    speaking_rate_wpm: float | None
    has_numbers: bool
    feedback: list[str]


def _count_words(text: str) -> int:
    return len(re.findall(r"[A-Za-z0-9']+", text))


def _count_phrase(text: str, phrase: str) -> int:
    # count phrase occurrences as whole-word-ish
    return len(re.findall(rf"(?i)\\b{re.escape(phrase)}\\b", text))


def analyze_behavioral(transcript: str, audio_seconds: float | None = None) -> BehavioralResult:
    t = transcript.strip()
    low = t.lower()
    wc = _count_words(t)

    # STAR heuristics
    star = {
        "situation": bool(re.search(r"(?i)\\b(situation|context|when i|at the time)\\b", t)),
        "task": bool(re.search(r"(?i)\\b(task|goal|responsib|objective|needed to)\\b", t)),
        "action": bool(re.search(r"(?i)\\b(i did|i led|i built|i created|i decided|i analyzed|i implemented)\\b", t)),
        "result": bool(re.search(r"(?i)\\b(result|impact|outcome|achieved|increased|decreased|improved|delivered)\\b", t)),
    }
    star_hits = sum(1 for v in star.values() if v)

    # Quantification heuristic
    has_numbers = bool(re.search(r"\\b\\d+(?:\\.\\d+)?%?\\b", t))

    # Fillers
    filler_counts = {w: _count_phrase(low, w) for w in FILLER_WORDS}
    filler_total = sum(filler_counts.values())

    # Speaking rate
    wpm: float | None = None
    if audio_seconds and audio_seconds > 0:
        wpm = (wc / audio_seconds) * 60.0

    feedback: list[str] = []
    if wc < 40:
        feedback.append("Answer is very short—add more context and a clear outcome.")
    if star_hits < 3:
        feedback.append("Use STAR: set context, define the task, describe actions, then state results.")
    if not has_numbers:
        feedback.append("Add at least one quantified outcome (%, $, time saved, rank, volume).")
    if filler_total >= 8:
        feedback.append("Reduce filler words (um/like/you know). Pause instead of filling silence.")
    if wpm is not None:
        if wpm < 110:
            feedback.append("Pace is slow—aim for clearer, slightly faster delivery.")
        elif wpm > 180:
            feedback.append("Pace is fast—slow down slightly for clarity.")

    # Score (simple, transparent)
    score = 0.0
    score += min(40.0, (star_hits / 4.0) * 40.0)
    score += 20.0 if has_numbers else 8.0
    if wpm is None:
        score += 15.0
    else:
        score += 15.0 if 120 <= wpm <= 175 else 8.0
    score += 25.0 if wc >= 90 else 15.0 if wc >= 60 else 8.0
    score -= min(20.0, filler_total * 1.5)
    score = max(0.0, min(100.0, round(score, 1)))

    return BehavioralResult(
        score=score,
        star_coverage=star,
        filler_words=filler_counts,
        filler_total=filler_total,
        word_count=wc,
        speaking_rate_wpm=round(wpm, 1) if wpm is not None else None,
        has_numbers=has_numbers,
        feedback=feedback[:6],
    )


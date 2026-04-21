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
    return len(re.findall(rf"(?i)\b{re.escape(phrase)}\b", text))


def analyze_behavioral(transcript: str, audio_seconds: float | None = None) -> BehavioralResult:
    t = transcript.strip()
    low = t.lower()
    wc = _count_words(t)

    # STAR heuristics (HireVue-style: look for narrative structure)
    situation_re = r"(?i)\b(situation|context|background|when i|at the time|during my|in my role at)\b"
    task_re = r"(?i)\b(task|goal|responsib|objective|needed to|asked to|my role was to|i was tasked)\b"
    action_re = (
        r"(?i)\b(i\s+(led|built|created|drove|owned|managed|analyz(?:ed|e)|modeled|implemented|designed|"
        r"partnered|coordinated|synthesized|negotiated|prioritized|executed))\b"
    )
    result_re = r"(?i)\b(result|impact|outcome|achieved|increased|decreased|improved|delivered|reduced|grew|saved|won)\b"
    has_outcome_number = bool(re.search(r"\b\d+(?:\.\d+)?\s*(?:%|percent|bps)?\b", t, flags=re.IGNORECASE)) and bool(
        re.search(result_re, t)
    )

    star = {
        "situation": bool(re.search(situation_re, t)),
        "task": bool(re.search(task_re, t)),
        "action": bool(re.search(action_re, t)),
        "result": bool(re.search(result_re, t)) or has_outcome_number,
    }
    star_hits = sum(1 for v in star.values() if v)

    # Quantification heuristic
    has_numbers = bool(
        re.search(r"\b\d+(?:\.\d+)?\s*(?:%|percent|bps)?\b", t, flags=re.IGNORECASE)
        or re.search(r"(?i)(\$\s*\d+|\d+\s*(?:mm|bn)\b)", t)
    )
    has_time_or_scale = bool(re.search(r"(?i)\\b(week|month|quarter|year|hrs?|days?)\\b", t)) or bool(
        re.search(r"(?i)\\b(\\$|usd|mm|bn|bps|points)\\b", t)
    )

    # Fillers
    filler_counts = {w: _count_phrase(low, w) for w in FILLER_WORDS}
    filler_total = sum(filler_counts.values())
    filler_per_100 = (filler_total / wc) * 100.0 if wc > 0 else 0.0

    # Speaking rate
    wpm: float | None = None
    if audio_seconds and audio_seconds > 0:
        wpm = (wc / audio_seconds) * 60.0
        # Guardrails: short clips / mismatched transcript produce nonsense rates.
        if audio_seconds < 12 or wpm > 260 or wpm < 60:
            wpm = None

    feedback: list[str] = []
    if wc < 55:
        feedback.append("Add detail: one concrete example + a clear closing outcome.")
    if star_hits < 3:
        feedback.append("Structure with STAR: context → task → actions → measurable result.")
    if not has_numbers:
        feedback.append("Add one metric (%, $, bps, time, volume) to make impact credible.")
    elif has_numbers and not has_outcome_number:
        feedback.append("Tie numbers to outcomes (what changed and why it mattered).")
    if filler_per_100 >= 6.0:
        feedback.append("Reduce filler words; use short pauses instead.")
    if wpm is not None:
        if wpm < 120:
            feedback.append("Pace is slow—tighten phrasing and land key points faster.")
        elif wpm > 185:
            feedback.append("Pace is fast—slow down slightly for clarity.")
    if not has_time_or_scale:
        feedback.append("Add timeframe or scale (e.g., 2 weeks, 3-month project, $ volume).")

    # Score (simple, transparent)
    score = 0.0
    score += min(42.0, (star_hits / 4.0) * 42.0)
    score += 22.0 if (has_numbers and has_outcome_number) else 16.0 if has_numbers else 8.0
    if wpm is None:
        score += 12.0
    else:
        score += 12.0 if 125 <= wpm <= 175 else 7.0
    score += 24.0 if wc >= 110 else 18.0 if wc >= 85 else 12.0 if wc >= 60 else 7.0
    score += 6.0 if has_time_or_scale else 2.0
    score -= min(18.0, filler_per_100 * 1.6)
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


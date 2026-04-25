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
    "honestly",
    "literally",
    "obviously",
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
    filler_per_100: float | None = None
    has_time_or_scale: bool | None = None
    has_outcome_number: bool | None = None
    star_hits: int | None = None
    hedge_hits: int | None = None
    subscores: dict[str, float] | None = None
    question_template: str | None = None
    question_coverage: dict[str, bool] | None = None
    question_outline: list[str] | None = None
    top_fixes: list[str] | None = None


def _count_words(text: str) -> int:
    return len(re.findall(r"[A-Za-z0-9']+", text))


def _count_phrase(text: str, phrase: str) -> int:
    # count phrase occurrences as whole-word-ish
    return len(re.findall(rf"(?i)\b{re.escape(phrase)}\b", text))


def _dedupe_feedback(lines: list[str]) -> list[str]:
    """Drop near-duplicate coaching lines while preserving order."""
    seen: set[str] = set()
    out: list[str] = []
    for line in lines:
        key = line.strip().lower()[:72]
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(line)
    return out


def _question_template(question_id: str | None) -> str | None:
    if not question_id:
        return None
    q = question_id.strip().lower()
    if "tell-me" in q or "tell_me" in q or q.endswith("tell-me") or "walk-me" in q:
        return "tell_me_about_yourself"
    if "why-firm" in q or "why_firm" in q or "why-company" in q or "why_company" in q:
        return "why_this_firm"
    if "why-role" in q or "why_role" in q or "why-position" in q:
        return "why_this_role"
    if "lead" in q or "leadership" in q:
        return "leadership"
    if "weak" in q or "weakness" in q:
        return "weakness"
    if "conflict" in q:
        return "conflict"
    return None


def _question_specific_assets(
    template: str | None, text: str
) -> tuple[dict[str, bool], list[str], list[str] | None, list[str] | None]:
    """
    Return (coverage, feedback, outline, top_fixes) for a specific behavioral prompt type.

    Coverage keys are stable strings that can be shown in the UI later if desired.
    """
    t = text.strip()
    low = t.lower()
    cov: dict[str, bool] = {}
    fb: list[str] = []
    outline: list[str] | None = None

    if template == "tell_me_about_yourself":
        # Past → Present → Future + role-fit “because”.
        outline = [
            "Present: what you’re doing now (1 sentence).",
            "Past: 1–2 experiences that shaped your interest (2 sentences).",
            "Strengths: 2 strengths + evidence (1 sentence each).",
            "Future: what you want next + why (1–2 sentences).",
            "Close: why this role/firm is the logical next step (1 sentence).",
        ]
        cov["present_now"] = bool(re.search(r"(?i)\b(currently|right now|today|these days)\b", t))
        cov["past_before"] = bool(re.search(r"(?i)\b(previously|before that|in college|during my|i started)\b", t))
        cov["future_next"] = bool(re.search(r"(?i)\b(next|now i want to|i'm excited to|looking forward)\b", t))
        cov["role_fit"] = bool(re.search(r"(?i)\b(why|because|so that|which is why|that's why)\b", t))
        cov["two_strengths"] = bool(re.search(r"(?i)\b(strength|i'm good at|i focus on|known for)\b", t)) or (
            len(re.findall(r"(?i)\b(i (built|led|drove|modeled|analyzed|presented))\b", t)) >= 2
        )

        if not cov["present_now"]:
            fb.append("Tell me about yourself: add a 1-sentence 'present' (what you’re doing right now).")
        if not cov["past_before"]:
            fb.append("Add 1 sentence of 'past' (what shaped you / relevant prior experience).")
        if not cov["future_next"]:
            fb.append("Add 1 sentence of 'future' (what you want next and why).")
        if not cov["role_fit"]:
            fb.append("End with a role-fit sentence: 'That’s why I’m excited about X role at Y'.")
        if not cov["two_strengths"]:
            fb.append("Name 2 strengths with evidence (e.g., modeling + client communication) instead of only duties.")

    elif template == "why_this_firm":
        outline = [
            "Anchor: name the firm + the role (1 sentence).",
            "Reason #1: platform/team/sector/deals/training that is specific.",
            "Reason #2: people/culture + how you like to work.",
            "Personal link: your background → why you’ll thrive here.",
            "Close: tie back to your near-term goal.",
        ]
        cov["firm_specific"] = bool(
            re.search(r"(?i)\b(platform|culture|team|product|coverage|sector|strategy|mandate|deal|clients?)\b", t)
        )
        cov["two_reasons"] = len(re.findall(r"(?i)\b(first|second|another reason|also)\b", t)) >= 1
        cov["personal_link"] = bool(re.search(r"(?i)\b(i value|i’m looking for|fits my|aligns with)\b", t))
        cov["role_named"] = bool(re.search(r"(?i)\b(analyst|associate|intern|investment banking|equity research|consulting)\b", t))
        if not cov["firm_specific"]:
            fb.append("Make it firm-specific: mention 1 concrete platform/team/sector reason (not generic prestige).")
        if not cov["two_reasons"]:
            fb.append("Give 2 distinct reasons (platform + people/culture, or deals + training).")
        if not cov["personal_link"]:
            fb.append("Add a personal link: why this matters to you (what you want to learn/build).")
        if not cov["role_named"]:
            fb.append("Explicitly name the role you’re interviewing for so the answer lands crisply.")

    elif template == "why_this_role":
        outline = [
            "Role understanding: name 2–3 real tasks you’re excited for.",
            "Evidence: one project/story proving you’ve done adjacent work.",
            "Skill match: 2 skills you’ll use immediately.",
            "Growth: 1 skill you want to build + why this role enables it.",
            "Close: tie to the team/firm briefly (1 sentence).",
        ]
        cov["role_understanding"] = bool(re.search(r"(?i)\b(model|valuation|diligence|pitch|client|deal|process)\b", t))
        cov["skill_match"] = bool(re.search(r"(?i)\b(i have|i built|i learned|i enjoyed|i’m strong in)\b", t))
        cov["growth_plan"] = bool(re.search(r"(?i)\b(i want to learn|i’m excited to learn|grow|develop)\b", t))
        if not cov["role_understanding"]:
            fb.append("Show role understanding: mention 2 real tasks (modeling, diligence, client materials, etc.).")
        if not cov["skill_match"]:
            fb.append("Connect your background to the role with 1 concrete example (project → skill → task).")
        if not cov["growth_plan"]:
            fb.append("Add a growth sentence: what you want to get better at and why this role enables it.")

    elif template == "leadership":
        outline = [
            "Context: team + stakes (deadline, client, risk).",
            "Decision: the call you made and why.",
            "Actions: 2–3 steps you drove.",
            "Result: measurable outcome + what you learned about leading.",
        ]
        cov["stakes"] = bool(re.search(r"(?i)\b(deadline|risk|pressure|stakeholder|conflict)\b", t))
        cov["ownership"] = bool(re.search(r"(?i)\b(i led|i owned|i drove|i managed|i coordinated)\b", t))
        cov["result"] = bool(re.search(r"(?i)\b(result|impact|outcome|delivered|improved|saved|won)\b", t))
        if not cov["ownership"]:
            fb.append("Leadership: state what you owned (scope) + the decision you made.")
        if not cov["stakes"]:
            fb.append("Add stakes (deadline, risk, or constraint) so leadership choices make sense.")
        if not cov["result"]:
            fb.append("Close with the result and what you learned about leading people.")

    elif template == "weakness":
        outline = [
            "Weakness: the real pattern (1 sentence).",
            "Trigger: when it shows up (1 sentence).",
            "Fix: system/habit you changed (1–2 sentences).",
            "Evidence: proof it’s improving (metric or example).",
            "Close: how it makes you stronger for this role.",
        ]
        cov["real_weakness"] = bool(re.search(r"(?i)\b(struggle|weakness|i used to|i tend to)\b", t))
        cov["mitigation"] = bool(re.search(r"(?i)\b(i now|i started|to fix this|i improved|i learned)\b", t))
        cov["not_fatal"] = not bool(re.search(r"(?i)\b(always|never|can't|impossible)\b", low))
        if not cov["real_weakness"]:
            fb.append("Weakness: pick a real weakness (not 'I work too hard') and define the specific pattern.")
        if not cov["mitigation"]:
            fb.append("Explain mitigation: what you changed (habit/system) + evidence it’s improving.")
        if not cov["not_fatal"]:
            fb.append("Avoid absolute language (always/never); keep it coachable and improving.")

    elif template == "conflict":
        outline = [
            "Conflict: what the disagreement was (facts, not blame).",
            "Constraints: what each side cared about.",
            "Actions: how you aligned (questions, options, trade-offs).",
            "Resolution: what you agreed on + what changed.",
            "Lesson: principle you’d reuse next time.",
        ]
        cov["conflict_context"] = bool(re.search(r"(?i)\b(disagree|conflict|tension|misalign)\b", t))
        cov["empathy"] = bool(re.search(r"(?i)\b(i listened|i asked|i understood|their perspective)\b", t))
        cov["resolution"] = bool(re.search(r"(?i)\b(aligned|agreed|resolved|compromise|plan)\b", t))
        if not cov["conflict_context"]:
            fb.append("Conflict: describe the disagreement clearly (what did each side want?).")
        if not cov["empathy"]:
            fb.append("Show empathy: how you learned the other person’s constraints/perspective.")
        if not cov["resolution"]:
            fb.append("Close with the resolution and the principle you’d reuse next time.")

    top_fixes: list[str] | None = None
    if cov:
        missing = [k for k, v in cov.items() if not v]
        if missing:
            top_fixes = [f"Add `{m.replace('_', ' ')}`." for m in missing[:3]]

    return cov, fb, outline, top_fixes


def analyze_behavioral(
    transcript: str,
    audio_seconds: float | None = None,
    *,
    question_id: str | None = None,
) -> BehavioralResult:
    t = transcript.strip()
    low = t.lower()
    wc = _count_words(t)

    template = _question_template(question_id)
    q_cov, q_feedback, q_outline, top_fixes = _question_specific_assets(template, t)

    # STAR heuristics (HireVue-style: look for narrative structure)
    situation_re = r"(?i)\b(situation|context|background|when i|at the time|during my|in my role at)\b"
    task_re = r"(?i)\b(task|goal|responsib|objective|needed to|asked to|my role was to|i was tasked)\b"
    action_re = (
        r"(?i)\b(i\s+(led|built|created|drove|owned|managed|analyz(?:ed|e)|modeled|implemented|designed|"
        r"partnered|coordinated|synthesized|negotiated|prioritized|executed|presented|pitched|structured))\b"
    )
    result_re = r"(?i)\b(result|impact|outcome|achieved|increased|decreased|improved|delivered|reduced|grew|saved|won|learned)\b"
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
    has_sequence = bool(
        re.search(
            r"(?i)\b(first|firstly|then|next|after that|finally|ultimately|in parallel|for example|specifically|furthermore)\b",
            t,
        )
    )

    # Quantification heuristic
    has_numbers = bool(
        re.search(r"\b\d+(?:\.\d+)?\s*(?:%|percent|bps)?\b", t, flags=re.IGNORECASE)
        or re.search(r"(?i)(\$\s*\d+|\d+\s*(?:mm|bn)\b)", t)
    )
    has_time_or_scale = bool(re.search(r"(?i)\b(week|month|quarter|year|hrs?|days?)\b", t)) or bool(
        re.search(r"(?i)\b(\$|usd|mm|bn|bps|points)\b", t)
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
    if star_hits >= 3 and wc < 85:
        feedback.append("Good structure—now add one more specific detail (who, constraint, or metric) per beat.")
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
    if has_sequence and star_hits >= 2:
        feedback.append("Nice sequencing—keep each step tied to a metric or stakeholder decision.")

    hedge_hits = len(re.findall(r"(?i)\b(i guess|i think|maybe|perhaps|probably|i'm not sure)\b", t))
    if hedge_hits >= 3:
        feedback.append("Reduce hedging (I think/maybe)—swap in one concrete fact per claim.")

    # Question-specific coaching (prepend so it’s visible and relevant)
    if template is not None:
        feedback = q_feedback + feedback

    # Score (simple, transparent)
    score = 0.0
    star_score = min(42.0, (star_hits / 4.0) * 42.0)
    quant_score = 22.0 if (has_numbers and has_outcome_number) else 16.0 if has_numbers else 8.0
    pace_score = 12.0 if (wpm is None or (125 <= wpm <= 175)) else 7.0
    length_score = 24.0 if wc >= 110 else 18.0 if wc >= 85 else 12.0 if wc >= 60 else 7.0
    scope_score = 6.0 if has_time_or_scale else 2.0
    structure_bonus = 4.0 if (has_sequence and star_hits >= 3) else 2.0 if has_sequence else 0.0
    hedge_penalty = min(10.0, hedge_hits * 2.2)
    filler_penalty = min(18.0, filler_per_100 * 1.6)
    # Small question-fit bump: reward hitting key beats for the prompt.
    q_fit = 0.0
    if q_cov:
        q_fit = (sum(1 for v in q_cov.values() if v) / max(1, len(q_cov))) * 10.0  # 0..10
    q_fit = round(q_fit, 1)

    score += star_score + quant_score + pace_score + length_score + scope_score + structure_bonus + q_fit
    score -= filler_penalty + hedge_penalty
    score = max(0.0, min(100.0, round(score, 1)))

    return BehavioralResult(
        score=score,
        star_coverage=star,
        question_template=template,
        question_coverage=q_cov or None,
        question_outline=q_outline,
        top_fixes=top_fixes,
        filler_words=filler_counts,
        filler_total=filler_total,
        word_count=wc,
        speaking_rate_wpm=round(wpm, 1) if wpm is not None else None,
        has_numbers=has_numbers,
        filler_per_100=round(filler_per_100, 1) if wc > 0 else 0.0,
        has_time_or_scale=has_time_or_scale,
        has_outcome_number=has_outcome_number,
        star_hits=star_hits,
        hedge_hits=hedge_hits,
        subscores={
            "star": round(star_score, 1),
            "quantification": round(quant_score, 1),
            "pace": round(pace_score, 1),
            "length": round(length_score, 1),
            "scope": round(scope_score, 1),
            "structure": round(structure_bonus, 1),
            "question_fit": q_fit,
            "filler_penalty": round(filler_penalty, 1),
            "hedge_penalty": round(hedge_penalty, 1),
        },
        feedback=_dedupe_feedback(feedback)[:7],
    )


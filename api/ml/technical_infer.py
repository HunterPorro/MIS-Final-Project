from __future__ import annotations

import math
import re
from pathlib import Path

import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer


LEVEL_LABELS = ["Novice", "Developing", "Proficient", "Strong"]

# Topic-specific lexicons for rule-based "skills" and "gaps" (complements model output).
LEXICONS: dict[str, dict[str, list[str]]] = {
    "M&A": {
        "skills": [
            ("synergy", "Synergies"),
            ("accret", "Accretion/dilution"),
            ("purchase price", "Purchase price / consideration"),
            ("goodwill", "Goodwill & PPA"),
            ("due diligence", "Due diligence"),
            ("premium", "Control premium"),
            ("control", "Control / voting considerations"),
            ("exchange ratio", "Exchange ratio / stock deal"),
        ],
        "gaps": [
            ("sources and uses", "Sources & uses bridge"),
            ("pro forma", "Pro forma adjustments"),
            ("eps", "EPS impact framing"),
            ("purchase accounting", "Purchase accounting / opening balance sheet"),
        ],
    },
    "LBO": {
        "skills": [
            ("irr", "IRR / MOIC"),
            ("leverage", "Leverage & debt sizing"),
            ("covenant", "Covenants"),
            ("sponsor", "Sponsor equity"),
            ("deleveraging", "Deleveraging"),
            ("ebitda", "EBITDA / cash conversion"),
            ("refinanc", "Refinancing / amend & extend"),
            ("paper", "Paper / back-of-envelope LBO"),
            ("sources and uses", "Sources & uses"),
            ("exit multiple", "Entry vs exit multiple"),
        ],
        "gaps": [
            ("cash sweep", "Cash sweep / waterfall"),
            ("pik", "PIK / toggle structures"),
            ("exit multiple", "Exit multiple vs entry"),
            ("management rollover", "Management rollover / alignment"),
        ],
    },
    "Valuation": {
        "skills": [
            ("wacc", "WACC"),
            ("dcf", "DCF"),
            ("terminal", "Terminal value"),
            ("comparable", "Comps / multiples"),
            ("bridge", "EV to equity bridge"),
            ("beta", "Beta / cost of equity"),
            ("capm", "CAPM / cost of equity"),
            ("risk free", "Risk-free rate & ERP"),
            ("enterprise value", "Enterprise vs equity value"),
            ("net debt", "Net debt & cash bridge"),
            ("peer", "Trading comps / peers"),
            ("ev/ebitda", "EV/EBITDA or multiple choice"),
            ("sotp", "SOTP / sum-of-the-parts"),
        ],
        "gaps": [
            ("circularity", "WACC / structure circularity"),
            ("football field", "Football field / triangulation"),
            ("normalization", "EBITDA normalization"),
            ("mid-year", "Mid-year / timing conventions"),
            ("diluted", "Diluted shares / options overhang"),
            ("nwc", "Net working capital / change in NWC"),
        ],
    },
    # Behavioral prompts are out-of-domain for the finance classifier; we score communication depth separately.
    "Behavioral": {
        "skills": [
            ("lead", "Leadership / ownership"),
            ("team", "Team collaboration"),
            ("stakeholder", "Stakeholders / cross-functional"),
            ("impact", "Impact / outcome"),
            ("learn", "Reflection / learning"),
            ("priorit", "Prioritization / trade-offs"),
        ],
        "gaps": [
            ("metric", "Concrete metric, %, $, or timeframe"),
            ("tradeoff", "Explicit trade-off or decision rationale"),
            ("result", "Clear result tied to your actions"),
        ],
    },
}


def word_count_text(text: str) -> int:
    """Token count aligned with behavioral/fit smoothing (word-ish tokens)."""
    return len(re.findall(r"[A-Za-z0-9']+", text))


def compute_explanation_score(coverage: dict[str, bool], explained: dict[str, bool]) -> float:
    """
    Among rubric dimensions the candidate touched, what share also showed causal language
    (because / therefore / drives / impact) nearby — 0–100.
    """
    touched = [k for k, v in coverage.items() if v]
    if not touched:
        return 0.0
    explained_hits = sum(1 for k in touched if explained.get(k))
    return round(100.0 * explained_hits / len(touched), 1)


def answer_text_for_classifier(text: str, max_chars: int = 2400) -> str:
    """
    For long transcripts, classify on the tail so the model sees the most recent content
    (spoken answers often build to the key points at the end).
    """
    s = text.strip()
    if len(s) <= max_chars:
        return s
    return s[-max_chars:]


def classifier_text_balanced(text: str, chunk: int = 1200) -> str:
    """
    Head + tail for very long answers so the classifier also sees framing/setup, not only the ending.
    Complements tail-only truncation; tokenizer still caps at max_length.
    """
    s = text.strip()
    if len(s) <= chunk * 2 + 40:
        return s
    return f"{s[:chunk]}\n…\n{s[-chunk:]}"


def softmax_entropy(probs: list[float]) -> float:
    """Shannon entropy of a probability vector; high values mean a flat / uncertain softmax."""
    eps = 1e-12
    return float(-sum(p * math.log(p + eps) for p in probs if p >= 0.0))


def softmax_margin(probs: list[float]) -> float:
    """Top1 − top2 probability gap; small margin ⇒ ambiguous class (blend toward rubric)."""
    if len(probs) < 2:
        return 1.0
    s = sorted(probs, reverse=True)
    return float(s[0] - s[1])


def composite_rubric_score(cov_score: float, explanation_score: float | None) -> float:
    """Combine structure coverage and causal clarity into a single 0–100 rubric score."""
    try:
        c = float(cov_score)
    except (TypeError, ValueError):
        c = 0.0
    if math.isnan(c) or math.isinf(c):
        c = 0.0
    if explanation_score is None:
        return max(0.0, min(100.0, c))
    try:
        e = float(explanation_score)
    except (TypeError, ValueError):
        e = 0.0
    if math.isnan(e) or math.isinf(e):
        e = 0.0
    return max(0.0, min(100.0, round(0.55 * c + 0.45 * e, 1)))


def _sanitize_probability_vector(probs: list[float], n_classes: int = 4) -> list[float]:
    """Handle NaN/Inf/short outputs from the classifier; always return a length-n simplex."""
    if not probs:
        return [1.0 / n_classes] * n_classes
    cleaned: list[float] = []
    for p in probs[:n_classes]:
        try:
            x = float(p)
        except (TypeError, ValueError):
            x = 0.0
        if math.isnan(x) or math.isinf(x):
            x = 0.0
        cleaned.append(max(0.0, x))
    while len(cleaned) < n_classes:
        cleaned.append(0.0)
    s = sum(cleaned)
    if s <= 0:
        return [1.0 / n_classes] * n_classes
    return [p / s for p in cleaned]


# Causal / linkage cues for rubric "explained" dimensions (order-agnostic).
_EXPLAIN_VERBS_LEX = [
    r"\bbecause\b",
    r"\bso that\b",
    r"\bwhich means\b",
    r"\btherefore\b",
    r"\bdrives\b",
    r"\bimpact\b",
    r"\bas a result\b",
    r"\bthis implies\b",
]


def explained_linked(patterns: list[str], explain_verbs: list[str], low: str) -> bool:
    """Concept then causal cue, or causal cue then concept (spoken answers vary in order)."""
    if not patterns or not explain_verbs:
        return False
    p = "(?:" + "|".join(patterns) + ")"
    e = "(?:" + "|".join(explain_verbs) + ")"
    if re.search(rf"(?i){p}.{{0,52}}{e}", low):
        return True
    return bool(re.search(rf"(?i){e}.{{0,56}}{p}", low))


class TechnicalAnalyzer:
    def __init__(self, model_dir: Path, device: torch.device | None = None) -> None:
        self.device = device or torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.tokenizer = AutoTokenizer.from_pretrained(str(model_dir))
        self.model = AutoModelForSequenceClassification.from_pretrained(str(model_dir))
        self.model.to(self.device)
        self.model.eval()

    def _prefix_topic(self, topic: str) -> str:
        t = topic.strip()
        if t not in ("M&A", "LBO", "Valuation"):
            t = "Valuation"
        return t

    @torch.inference_mode()
    def _forward_probs(self, prefixed: str) -> list[float]:
        enc = self.tokenizer(
            prefixed,
            truncation=True,
            padding="max_length",
            max_length=384,
            return_tensors="pt",
        )
        enc = {k: v.to(self.device) for k, v in enc.items()}
        logits = self.model(**enc).logits.squeeze(0)
        probs = torch.softmax(logits, dim=-1)
        return [float(x) for x in probs.tolist()]

    @torch.inference_mode()
    def predict(self, topic: str, answer_text: str) -> tuple[int, float, list[float]]:
        """
        Topic-prefixed DistilBERT forward pass. Long answers use a soft ensemble: tail (primary)
        + head/tail bridge (secondary) averaged in probability space.
        """
        t = self._prefix_topic(topic)
        raw = (answer_text or "").strip()
        # Empty / whitespace-only inputs produce unstable logits; use a stable OOD token.
        safe = raw if len(raw) >= 2 else "[empty]"
        body = raw if len(raw) >= 2 else ""
        p_tail = self._forward_probs(f"[{t}] {answer_text_for_classifier(safe)}")
        if len(body) <= 2800:
            probs = p_tail
        else:
            p_bal = self._forward_probs(f"[{t}] {classifier_text_balanced(safe)}")
            probs = [(a + b) / 2.0 for a, b in zip(p_tail, p_bal)]
        probs = _sanitize_probability_vector(probs)
        idx = max(range(len(probs)), key=lambda i: probs[i])
        conf = float(probs[idx])
        return idx, conf, probs

    @staticmethod
    def lexicon_scan(
        topic: str, text: str
    ) -> tuple[list[str], list[str], dict[str, bool], dict[str, bool], float, float]:
        t = topic if topic in LEXICONS else "Valuation"
        low = (text or "").lower()
        # Structured coverage signals (lightweight rubric)
        def has_any(patterns: list[str]) -> bool:
            return any(re.search(p, low) for p in patterns)

        coverage: dict[str, bool] = {}
        explained: dict[str, bool] = {}
        structured_hits: list[str] = []
        explain_verbs = _EXPLAIN_VERBS_LEX

        if t == "Valuation":
            coverage["projection"] = has_any([r"\bproject", r"\bforecast", r"\bbuild\b.*\bmodel"])
            explained["projection"] = explained_linked([r"\bproject", r"\bforecast", r"\bmodel"], explain_verbs, low)
            if coverage["projection"]:
                structured_hits.append("FCF projection")
            coverage["discounting"] = has_any([r"\bdiscount", r"\bpv\b", r"\bpresent value\b"])
            explained["discounting"] = explained_linked([r"\bdiscount", r"\bpv\b", r"\bpresent value\b"], explain_verbs, low)
            if coverage["discounting"]:
                structured_hits.append("Discounting / PV")
            coverage["terminal_value"] = has_any([r"\bterminal\b", r"\bgordon\b", r"\bexit multiple\b"])
            explained["terminal_value"] = explained_linked(
                [r"\bterminal\b", r"\bgordon\b", r"\bexit multiple\b"], explain_verbs, low
            )
            if coverage["terminal_value"]:
                structured_hits.append("Terminal value methods")
            coverage["wacc"] = has_any([r"\bwacc\b", r"\bcost of equity\b", r"\bcost of debt\b"])
            explained["wacc"] = explained_linked([r"\bwacc\b", r"\bcost of equity\b", r"\bcost of debt\b"], explain_verbs, low)
            if coverage["wacc"]:
                structured_hits.append("WACC components")
            coverage["ev_equity"] = has_any(
                [
                    r"\benterprise value\b",
                    r"\bequity value\b",
                    r"\bmarket cap\b",
                    r"\bmarket capitalization\b",
                    r"\bnet debt\b",
                ]
            )
            explained["ev_equity"] = explained_linked(
                [r"\benterprise value\b", r"\bequity value\b", r"\bnet debt\b", r"\bbridge\b"],
                explain_verbs,
                low,
            )
            if coverage["ev_equity"]:
                structured_hits.append("EV ↔ equity bridge")
            coverage["capm"] = has_any(
                [r"\bcapm\b", r"\bbeta\b", r"\brisk[- ]free\b", r"\berp\b", r"\bequity risk premium\b"]
            )
            explained["capm"] = explained_linked([r"\bcapm\b", r"\bbeta\b", r"\bcost of equity\b", r"\bwacc\b"], explain_verbs, low)
            if coverage["capm"]:
                structured_hits.append("CAPM / cost of equity inputs")
            coverage["trading_comps"] = has_any(
                [
                    r"\btrading comps\b",
                    r"\bcomparable company\b",
                    r"\bpeer\b",
                    r"\bev/ebitda\b",
                    r"\bmultiple\b",
                    r"\bcomparable\b",
                ]
            )
            explained["trading_comps"] = explained_linked(
                [r"\bcomps\b", r"\bpeer\b", r"\bmultiple\b", r"\bev/ebitda\b"],
                explain_verbs,
                low,
            )
            if coverage["trading_comps"]:
                structured_hits.append("Trading comps / multiples")
        elif t == "LBO":
            coverage["capital_structure"] = has_any([r"\bdebt\b", r"\bleverage\b", r"\bcapital structure\b"])
            explained["capital_structure"] = explained_linked(
                [r"\bleverage\b", r"\bcapital structure\b", r"\bdebt\b"], explain_verbs, low
            )
            if coverage["capital_structure"]:
                structured_hits.append("Leverage / capital structure")
            coverage["deleveraging"] = has_any([r"\bfree cash flow\b", r"\bcash flow\b", r"\bdeleverag"])
            explained["deleveraging"] = explained_linked([r"\bcash flow\b", r"\bdeleverag"], explain_verbs, low)
            if coverage["deleveraging"]:
                structured_hits.append("Deleveraging via cash flow")
            coverage["returns"] = has_any([r"\birr\b", r"\bmoic\b", r"\bmultiple of money\b"])
            explained["returns"] = explained_linked([r"\birr\b", r"\bmoic\b", r"\bmultiple of money\b"], explain_verbs, low)
            if coverage["returns"]:
                structured_hits.append("Returns framing")
            coverage["entry_exit"] = has_any([r"\bentry\b.*\bmultiple\b", r"\bexit\b.*\bmultiple\b", r"\bmultiple expansion\b"])
            explained["entry_exit"] = explained_linked(
                [r"\bentry\b.*\bmultiple\b", r"\bexit\b.*\bmultiple\b", r"\bmultiple expansion\b"],
                explain_verbs,
                low,
            )
            if coverage["entry_exit"]:
                structured_hits.append("Entry/exit multiple drivers")
            coverage["paper_lbo"] = has_any(
                [r"\bpaper\b.*\blbo\b", r"\bback of the envelope\b", r"\bsketch\b.*\blbo\b", r"\bquick\b.*\blbo\b"]
            )
            explained["paper_lbo"] = explained_linked([r"\bpaper\b", r"\blbo\b", r"\bleverage\b", r"\birr\b"], explain_verbs, low)
            if coverage["paper_lbo"]:
                structured_hits.append("Paper LBO / sanity checks")
        elif t == "Behavioral":
            coverage["context"] = has_any(
                [r"\binternship\b", r"\brole\b", r"\bproject\b", r"\bexperience\b", r"\bwhen i\b", r"\bduring my\b"]
            )
            explained["context"] = explained_linked([r"\bproject\b", r"\brole\b", r"\bexperience\b"], explain_verbs, low)
            if coverage["context"]:
                structured_hits.append("Situation / context")
            coverage["ownership"] = has_any(
                [r"\bled\b", r"\bdrove\b", r"\bowned\b", r"\bcoordinated\b", r"\bmanaged\b", r"\banalyz"]
            )
            explained["ownership"] = explained_linked([r"\bled\b", r"\bdrove\b", r"\bowned\b"], explain_verbs, low)
            if coverage["ownership"]:
                structured_hits.append("Ownership of actions")
            coverage["outcome"] = has_any(
                [r"\bresult\b", r"\boutcome\b", r"\bimpact\b", r"\bachieved\b", r"\bimproved\b", r"\bdelivered\b"]
            )
            explained["outcome"] = explained_linked([r"\bresult\b", r"\boutcome\b", r"\bimpact\b"], explain_verbs, low)
            if coverage["outcome"]:
                structured_hits.append("Outcome / impact")
            coverage["quant"] = has_any(
                [r"\b\d+\s*(?:%|percent|bps)\b", r"\$\s*\d+", r"\d+\s*(?:week|month|year)s?\b", r"\bpeople\b"]
            )
            # Count as "explained" when explicit numbers are present (concrete specificity).
            explained["quant"] = bool(coverage["quant"])
            if coverage["quant"]:
                structured_hits.append("Quantification / time scale")
        elif t == "M&A":
            coverage["accretion"] = has_any([r"\baccret", r"\bdilut", r"\beps\b"])
            explained["accretion"] = explained_linked([r"\baccret", r"\bdilut", r"\beps\b"], explain_verbs, low)
            if coverage["accretion"]:
                structured_hits.append("Accretion/dilution framing")
            coverage["consideration"] = has_any([r"\bconsideration\b", r"\bpurchase price\b", r"\bsources and uses\b"])
            explained["consideration"] = explained_linked(
                [r"\bconsideration\b", r"\bpurchase price\b", r"\bsources and uses\b"], explain_verbs, low
            )
            if coverage["consideration"]:
                structured_hits.append("Consideration / sources-uses")
            coverage["synergies"] = has_any([r"\bsynerg", r"\bcost savings\b", r"\brevenue synergy\b"])
            explained["synergies"] = explained_linked([r"\bsynerg", r"\bcost savings\b", r"\brevenue synergy\b"], explain_verbs, low)
            if coverage["synergies"]:
                structured_hits.append("Synergies")
            coverage["ppa_goodwill"] = has_any([r"\bgoodwill\b", r"\bppa\b", r"\bpurchase price allocation\b"])
            explained["ppa_goodwill"] = explained_linked(
                [r"\bgoodwill\b", r"\bppa\b", r"\bpurchase price allocation\b"], explain_verbs, low
            )
            if coverage["ppa_goodwill"]:
                structured_hits.append("PPA / goodwill")

        skills: list[str] = []
        missed: list[str] = []
        for needle, label in LEXICONS[t]["skills"]:
            if re.search(rf"\b{re.escape(needle)}", low):
                skills.append(label)
        for needle, label in LEXICONS[t]["gaps"]:
            if not re.search(rf"\b{re.escape(needle)}", low):
                missed.append(label)

        # Boost skills with structured coverage so the report is less keyword-y
        for s in structured_hits:
            skills.append(s)
        # De-duplicate preserving order
        def dedupe(xs: list[str]) -> list[str]:
            seen: set[str] = set()
            out: list[str] = []
            for x in xs:
                if x not in seen:
                    seen.add(x)
                    out.append(x)
            return out

        cov_score = 0.0
        if coverage:
            cov_score = (sum(1 for v in coverage.values() if v) / max(1, len(coverage))) * 100.0
        explanation_score = compute_explanation_score(coverage, explained)
        return (
            dedupe(skills)[:7],
            dedupe(missed)[:6],
            coverage,
            explained,
            round(cov_score, 1),
            explanation_score,
        )

    @staticmethod
    def short_summary(
        level: int,
        topic: str,
        skills: list[str],
        *,
        explanation_score: float | None = None,
    ) -> str:
        tier = LEVEL_LABELS[max(0, min(level, 3))]
        skill_part = ", ".join(skills[:4]) if skills else "limited explicit technical anchors in the text"
        base = f"{tier} {topic} response: demonstrates {skill_part}."
        if topic == "Behavioral":
            return base
        if explanation_score is None:
            return base
        if explanation_score >= 62.0:
            return base + " Causal clarity is strong (you often connect mechanics to “why”)."
        if explanation_score >= 38.0:
            return base + " Add a few more explicit “because / therefore” links between steps."
        return base + " Push on causal links—walk from input → step → implication more explicitly."


def _adjust_behavioral_level(level: int, cov_score: float, expl_score: float) -> int:
    """Align headline communication tier with lexicon + causal read (small nudges, transparent)."""
    if expl_score >= 70.0 and cov_score >= 52.0 and level < 3:
        return min(3, level + 1)
    if expl_score < 22.0 and cov_score < 30.0 and level > 0:
        return max(0, level - 1)
    return level


def _behavioral_technical_level(transcript: str) -> tuple[int, float]:
    """
    Finance DistilBERT is trained on technical prompts; behavioral answers are out-of-domain.
    Use a transparent rubric (structure + specificity + length) for 0–3 communication depth.
    """
    low = transcript.lower()
    wc = len(re.findall(r"[A-Za-z0-9']+", transcript))
    signals = 0
    if re.search(r"(?i)\b(when|while|during|in my|at)\b.+\b(i|we)\b", low):
        signals += 1
    if re.search(r"(?i)\b(result|outcome|impact|achieved|delivered|learned)\b", low):
        signals += 1
    if re.search(r"(?i)\b(team|led|collaborat|stakeholder|owned|drove)\b", low):
        signals += 1
    if re.search(r"\b\d+(?:\.\d+)?\s*(?:%|percent|bps|week|month|year|people)?\b", transcript):
        signals += 1
    if re.search(r"(?i)\b(first|firstly|then|next|after that|finally|ultimately)\b", low):
        signals += 1
    if re.search(r"(?i)\b(however|because|therefore|so that|which meant)\b", low):
        signals += 1
    conf = 0.62 + min(0.18, signals * 0.025)
    if wc < 40:
        return 0, min(0.72, conf)
    if wc < 80 or signals < 2:
        return 1, min(0.78, conf)
    if wc < 160 and signals >= 4:
        return 3, min(0.86, conf + 0.06)
    if wc < 140 and signals >= 3:
        return 3, min(0.82, conf + 0.04)
    return 2, min(0.80, conf)


def _level_implied_by_coverage(cov_score: float) -> int:
    """Map structured rubric coverage (0–100) to a 0–3 tier for blending when the classifier is uncertain."""
    if cov_score >= 72:
        return 3
    if cov_score >= 48:
        return 2
    if cov_score >= 24:
        return 1
    return 0


def blend_technical_level(
    level: int,
    level_conf: float,
    cov_score: float | None,
    entropy: float | None = None,
    word_count: int | None = None,
    margin: float | None = None,
    explanation_score: float | None = None,
) -> int:
    """
    When the finance classifier softmax is flat (low confidence) or entropy is high, anchor the level
    to lexicon / rubric coverage (+ causal clarity) so scores track what the candidate actually said.
    """
    if cov_score is None:
        return level
    comp = composite_rubric_score(float(cov_score), explanation_score)
    # Max entropy for 4 classes ≈ ln(4) ≈ 1.386; values > ~1.15 usually indicate a fairly flat distribution.
    uncertain = level_conf < 0.58
    if entropy is not None and entropy > 1.14:
        uncertain = True
    # Very short answers rarely support a peaked classifier distribution — blend toward rubric coverage.
    if word_count is not None and word_count < 42:
        uncertain = True
    # Tight race between top two labels — common source of misleading point estimates.
    if margin is not None and margin < 0.11:
        uncertain = True
    if not uncertain:
        return level
    implied = _level_implied_by_coverage(comp)
    # When very uncertain, lean harder on structured coverage + explanation.
    w_level = 0.52
    if entropy is not None and entropy > 1.22:
        w_level = 0.34
    elif entropy is not None and entropy > 1.14:
        w_level = 0.44
    blended = int(round(level * w_level + implied * (1.0 - w_level)))
    return max(0, min(3, blended))


def interview_technical(
    topic_norm: str,
    transcript: str,
    question_track: str | None,
    tech: TechnicalAnalyzer,
) -> tuple[int, float, list[str], list[str], dict[str, bool], dict[str, bool], float, float, str]:
    """Finance classifier for technical prompts; rubric-based analysis for behavioral (OOD-safe)."""
    wc = word_count_text(transcript)
    if (question_track or "").strip().lower() == "behavioral":
        level, conf = _behavioral_technical_level(transcript)
        skills, missed, coverage, explained, cov_score, expl_score = TechnicalAnalyzer.lexicon_scan("Behavioral", transcript)
        level = _adjust_behavioral_level(level, cov_score, expl_score)
        summ = TechnicalAnalyzer.short_summary(level, "Behavioral", skills, explanation_score=expl_score)
        return level, conf, skills, missed, coverage, explained, cov_score, expl_score, summ
    level, conf, probs = tech.predict(topic_norm, transcript)
    skills, missed, coverage, explained, cov_score, expl_score = TechnicalAnalyzer.lexicon_scan(topic_norm, transcript)
    ent = softmax_entropy(probs)
    level = blend_technical_level(
        level,
        conf,
        cov_score,
        entropy=ent,
        word_count=wc,
        margin=softmax_margin(probs),
        explanation_score=expl_score,
    )
    summ = TechnicalAnalyzer.short_summary(level, topic_norm, skills, explanation_score=expl_score)
    return level, conf, skills, missed, coverage, explained, cov_score, expl_score, summ


def normalize_topic(raw: str) -> str:
    s = raw.strip()
    mapping = {
        "ma": "M&A",
        "m&a": "M&A",
        "mna": "M&A",
        "mergers": "M&A",
        "lbo": "LBO",
        "leveraged buyout": "LBO",
        "valuation": "Valuation",
        "dcf": "Valuation",
        "comps": "Valuation",
        "trading comps": "Valuation",
        "capm": "Valuation",
        "behavioral": "Behavioral",
        "behavioural": "Behavioral",
        "behavior": "Behavioral",
        "fit": "Behavioral",
    }
    key = re.sub(r"\s+", " ", s.lower())
    allowed = ("M&A", "LBO", "Valuation", "Behavioral")
    return mapping.get(key, s if s in allowed else "Valuation")

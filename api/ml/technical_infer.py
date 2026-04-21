from __future__ import annotations

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
        ],
        "gaps": [
            ("sources and uses", "Sources & uses bridge"),
            ("pro forma", "Pro forma adjustments"),
            ("eps", "EPS impact framing"),
        ],
    },
    "LBO": {
        "skills": [
            ("irr", "IRR / MOIC"),
            ("leverage", "Leverage & debt sizing"),
            ("covenant", "Covenants"),
            ("sponsor", "Sponsor equity"),
            ("deleveraging", "Deleveraging"),
        ],
        "gaps": [
            ("cash sweep", "Cash sweep / waterfall"),
            ("pik", "PIK / toggle structures"),
            ("exit multiple", "Exit multiple vs entry"),
        ],
    },
    "Valuation": {
        "skills": [
            ("wacc", "WACC"),
            ("dcf", "DCF"),
            ("terminal", "Terminal value"),
            ("comparable", "Comps / multiples"),
            ("bridge", "EV to equity bridge"),
        ],
        "gaps": [
            ("circularity", "WACC / structure circularity"),
            ("football field", "Football field / triangulation"),
            ("normalization", "EBITDA normalization"),
        ],
    },
}


class TechnicalAnalyzer:
    def __init__(self, model_dir: Path, device: torch.device | None = None) -> None:
        self.device = device or torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.tokenizer = AutoTokenizer.from_pretrained(str(model_dir))
        self.model = AutoModelForSequenceClassification.from_pretrained(str(model_dir))
        self.model.to(self.device)
        self.model.eval()

    def _prefix(self, topic: str, text: str) -> str:
        t = topic.strip()
        if t not in ("M&A", "LBO", "Valuation"):
            t = "Valuation"
        return f"[{t}] {text.strip()}"

    @torch.inference_mode()
    def predict(self, topic: str, answer_text: str) -> tuple[int, float, list[float]]:
        enc = self.tokenizer(
            self._prefix(topic, answer_text),
            truncation=True,
            padding="max_length",
            max_length=256,
            return_tensors="pt",
        )
        enc = {k: v.to(self.device) for k, v in enc.items()}
        logits = self.model(**enc).logits.squeeze(0)
        probs = torch.softmax(logits, dim=-1)
        idx = int(probs.argmax().item())
        conf = float(probs[idx].item())
        return idx, conf, [float(x) for x in probs.tolist()]

    @staticmethod
    def lexicon_scan(topic: str, text: str) -> tuple[list[str], list[str]]:
        t = topic if topic in LEXICONS else "Valuation"
        low = text.lower()
        skills: list[str] = []
        missed: list[str] = []
        for needle, label in LEXICONS[t]["skills"]:
            if needle in low:
                skills.append(label)
        for needle, label in LEXICONS[t]["gaps"]:
            if needle not in low:
                missed.append(label)
        # De-duplicate preserving order
        def dedupe(xs: list[str]) -> list[str]:
            seen: set[str] = set()
            out: list[str] = []
            for x in xs:
                if x not in seen:
                    seen.add(x)
                    out.append(x)
            return out

        return dedupe(skills), dedupe(missed)[:5]

    @staticmethod
    def short_summary(level: int, topic: str, skills: list[str]) -> str:
        tier = LEVEL_LABELS[max(0, min(level, 3))]
        skill_part = ", ".join(skills[:4]) if skills else "limited explicit technical anchors in the text"
        return f"{tier} {topic} response: demonstrates {skill_part}."


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
    }
    key = re.sub(r"\s+", " ", s.lower())
    return mapping.get(key, s if s in ("M&A", "LBO", "Valuation") else "Valuation")

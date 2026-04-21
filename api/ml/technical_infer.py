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
    def lexicon_scan(topic: str, text: str) -> tuple[list[str], list[str], dict[str, bool], dict[str, bool], float]:
        t = topic if topic in LEXICONS else "Valuation"
        low = text.lower()
        # Structured coverage signals (lightweight rubric)
        def has_any(patterns: list[str]) -> bool:
            return any(re.search(p, low) for p in patterns)

        coverage: dict[str, bool] = {}
        explained: dict[str, bool] = {}
        structured_hits: list[str] = []
        explain_verbs = [r"\bbecause\b", r"\bso that\b", r"\bwhich means\b", r"\btherefore\b", r"\bdrives\b", r"\bimpact\b"]
        def explained_near(patterns: list[str]) -> bool:
            return bool(re.search(rf"(?i)({'|'.join(patterns)}).{{0,40}}({'|'.join(explain_verbs)})", low))

        if t == "Valuation":
            coverage["projection"] = has_any([r"\bproject", r"\bforecast", r"\bbuild\b.*\bmodel"])
            explained["projection"] = explained_near([r"\bproject", r"\bforecast", r"\bmodel"])
            if coverage["projection"]:
                structured_hits.append("FCF projection")
            coverage["discounting"] = has_any([r"\bdiscount", r"\bpv\b", r"\bpresent value\b"])
            explained["discounting"] = explained_near([r"\bdiscount", r"\bpv\b", r"\bpresent value\b"])
            if coverage["discounting"]:
                structured_hits.append("Discounting / PV")
            coverage["terminal_value"] = has_any([r"\bterminal\b", r"\bgordon\b", r"\bexit multiple\b"])
            explained["terminal_value"] = explained_near([r"\bterminal\b", r"\bgordon\b", r"\bexit multiple\b"])
            if coverage["terminal_value"]:
                structured_hits.append("Terminal value methods")
            coverage["wacc"] = has_any([r"\bwacc\b", r"\bcost of equity\b", r"\bcost of debt\b"])
            explained["wacc"] = explained_near([r"\bwacc\b", r"\bcost of equity\b", r"\bcost of debt\b"])
            if coverage["wacc"]:
                structured_hits.append("WACC components")
        elif t == "LBO":
            coverage["capital_structure"] = has_any([r"\bdebt\b", r"\bleverage\b", r"\bcapital structure\b"])
            explained["capital_structure"] = explained_near([r"\bleverage\b", r"\bcapital structure\b", r"\bdebt\b"])
            if coverage["capital_structure"]:
                structured_hits.append("Leverage / capital structure")
            coverage["deleveraging"] = has_any([r"\bfree cash flow\b", r"\bcash flow\b", r"\bdeleverag"])
            explained["deleveraging"] = explained_near([r"\bcash flow\b", r"\bdeleverag"])
            if coverage["deleveraging"]:
                structured_hits.append("Deleveraging via cash flow")
            coverage["returns"] = has_any([r"\birr\b", r"\bmoic\b", r"\bmultiple of money\b"])
            explained["returns"] = explained_near([r"\birr\b", r"\bmoic\b", r"\bmultiple of money\b"])
            if coverage["returns"]:
                structured_hits.append("Returns framing")
            coverage["entry_exit"] = has_any([r"\bentry\b.*\bmultiple\b", r"\bexit\b.*\bmultiple\b", r"\bmultiple expansion\b"])
            explained["entry_exit"] = explained_near([r"\bentry\b.*\bmultiple\b", r"\bexit\b.*\bmultiple\b", r"\bmultiple expansion\b"])
            if coverage["entry_exit"]:
                structured_hits.append("Entry/exit multiple drivers")
        else:  # M&A
            coverage["accretion"] = has_any([r"\baccret", r"\bdilut", r"\beps\b"])
            explained["accretion"] = explained_near([r"\baccret", r"\bdilut", r"\beps\b"])
            if coverage["accretion"]:
                structured_hits.append("Accretion/dilution framing")
            coverage["consideration"] = has_any([r"\bconsideration\b", r"\bpurchase price\b", r"\bsources and uses\b"])
            explained["consideration"] = explained_near([r"\bconsideration\b", r"\bpurchase price\b", r"\bsources and uses\b"])
            if coverage["consideration"]:
                structured_hits.append("Consideration / sources-uses")
            coverage["synergies"] = has_any([r"\bsynerg", r"\bcost savings\b", r"\brevenue synergy\b"])
            explained["synergies"] = explained_near([r"\bsynerg", r"\bcost savings\b", r"\brevenue synergy\b"])
            if coverage["synergies"]:
                structured_hits.append("Synergies")
            coverage["ppa_goodwill"] = has_any([r"\bgoodwill\b", r"\bppa\b", r"\bpurchase price allocation\b"])
            explained["ppa_goodwill"] = explained_near([r"\bgoodwill\b", r"\bppa\b", r"\bpurchase price allocation\b"])
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
        return dedupe(skills)[:7], dedupe(missed)[:6], coverage, explained, round(cov_score, 1)

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

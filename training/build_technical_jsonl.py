"""
Build a labeled JSONL dataset for technical finance answers.
Labels: level 0-3 (novice → strong) with topic prefix in text for single-model training.
"""
from __future__ import annotations

import json
import random
from pathlib import Path

TOPICS = ("M&A", "LBO", "Valuation")

# Short template fragments — expanded combinatorially for scale.
MA_WEAK = [
    "Mergers combine companies.",
    "Acquisitions happen when one firm buys another.",
    "Synergy means 1+1=3 sometimes.",
]
MA_MID = [
    "In M&A, the buyer often pays a control premium. Synergies can be revenue or cost synergies.",
    "Accretion/dilution analysis compares pro forma EPS vs standalone EPS using purchase price and financing mix.",
    "Purchase price allocation maps consideration to assets/liabilities; goodwill arises when price exceeds net identifiable assets.",
]
MA_STRONG = [
    "A merger model ties sources & uses to the purchase price, then builds pro forma balance sheet adjustments, "
    "PPA with step-ups and deferred taxes, synergy timing, and accretion/dilution under various financing scenarios.",
    "Seller notes and earn-outs complicate purchase accounting and may create contingent consideration liabilities under ASC 805.",
]

LBO_WEAK = ["LBO uses debt to buy a company.", "Sponsors put in equity and borrow the rest."]
LBO_MID = [
    "An LBO targets IRR and MOIC via deleveraging, EBITDA growth, and multiple expansion; debt paydown is key.",
    "Covenants and amortization schedules constrain cash available for equity distributions.",
]
LBO_STRONG = [
    "Returns are driven by entry/exit multiples, leverage and pricing on each debt tranche, and cash sweeps; "
    "PIK toggles and covenant-lite structures shift risk to lenders.",
]

VAL_WEAK = ["DCF discounts cash flows.", "Terminal value matters."]
VAL_MID = [
    "DCF uses WACC reflecting capital structure and beta; terminal value often via Gordon growth or exit multiple method.",
    "Comparable company analysis uses EV/EBITDA multiples with adjustments for size and growth.",
]
VAL_STRONG = [
    "Bridge from enterprise value to equity value subtracts net debt and adds non-operating assets; "
    "WACC should be consistent with target capital structure and circularity handled via iteration.",
    "Football field reconciles DCF, comps, and precedent transactions with sensitivity on key drivers.",
]

TOPIC_FRAGS = {
    "M&A": (MA_WEAK, MA_MID, MA_STRONG),
    "LBO": (LBO_WEAK, LBO_MID, LBO_STRONG),
    "Valuation": (VAL_WEAK, VAL_MID, VAL_STRONG),
}


def synth_answer(topic: str, level: int, rng: random.Random) -> str:
    weak, mid, strong = TOPIC_FRAGS[topic]
    if level == 0:
        parts = [rng.choice(weak)]
    elif level == 1:
        parts = [rng.choice(weak), rng.choice(mid)]
    elif level == 2:
        parts = [rng.choice(mid), rng.choice(strong if rng.random() < 0.3 else mid)]
    else:
        parts = [rng.choice(strong), rng.choice(mid)]
    filler = [
        " I would also mention working capital normalization.",
        " Consider risks around integration execution.",
        " Market conditions can change the outcome materially.",
    ]
    if rng.random() < 0.4:
        parts.append(rng.choice(filler))
    text = " ".join(parts)
    return f"[{topic}] " + text


def main() -> None:
    rng = random.Random(42)
    out = Path("training/data/technical_train.jsonl")
    out.parent.mkdir(parents=True, exist_ok=True)
    rows = []
    for topic in TOPICS:
        for level in range(4):
            for _ in range(180):
                rows.append({"text": synth_answer(topic, level, rng), "topic": topic, "level": level})
    rng.shuffle(rows)
    with out.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")
    print(f"Wrote {len(rows)} rows to {out}")


if __name__ == "__main__":
    main()

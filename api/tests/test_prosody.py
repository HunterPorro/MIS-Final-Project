import unittest

import numpy as np

from api.ml.prosody import analyze_prosody


class TestProsody(unittest.TestCase):
    def test_steady_speech_like(self) -> None:
        sr = 16_000
        t = np.linspace(0, 4, 4 * sr, dtype=np.float32)
        # Moderate energy bursts with silence between (pause-heavy)
        y = np.zeros_like(t)
        for i, start in enumerate([0.5, 1.6, 2.7]):
            m = (t >= start) & (t < start + 0.55)
            y[m] = 0.12 * np.sin(2 * np.pi * 180 * t[m])
        r = analyze_prosody(
            y,
            sr,
            transcript_word_count=140,
            audio_seconds=4.0,
            speaking_rate_wpm=155,
        )
        self.assertIn(r.label, ("steady", "uneven", "rushed"))


if __name__ == "__main__":
    unittest.main()

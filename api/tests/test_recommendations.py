from __future__ import annotations

import asyncio
import unittest


class TestRecommendations(unittest.TestCase):
    def test_deterministic_recommendations_present_without_google(self) -> None:
        from api.config import settings
        from api.schemas import BehavioralResult, FitResult, MockInterviewResponse, TechnicalResult, WorkspaceResult
        from api.services.recommendations import build_future_recommendations

        settings.google_api_key = None

        resp = MockInterviewResponse(
            question_id="behav-tell-me",
            question_track="behavioral",
            transcript="Currently I'm a student. Previously I interned. Next I want banking because I like steep learning.",
            workspace=WorkspaceResult(label="unknown", confidence=0.5, class_index=-1),
            technical=TechnicalResult(
                expertise_level=1,
                expertise_label="Developing",
                level_confidence=0.6,
                topic="Behavioral",
                skills_identified=[],
                concepts_missed=["Clear result tied to your actions"],
                summary="x",
                coverage={},
                explained={},
                coverage_score=0.0,
                explanation_score=0.0,
            ),
            behavioral=BehavioralResult(
                score=40.0,
                star_coverage={"situation": False, "task": False, "action": True, "result": False},
                question_template="tell_me_about_yourself",
                question_coverage={"present_now": True, "two_strengths": False},
                question_outline=["Present", "Past", "Strengths", "Future", "Close"],
                top_fixes=["Add `two strengths`."],
                filler_words={},
                filler_total=0,
                word_count=80,
                speaking_rate_wpm=None,
                has_numbers=False,
                feedback=["x"],
            ),
            fit=FitResult(
                fit_score=45.0,
                environment_component=50.0,
                technical_component=40.0,
                weights={"environment": 0.3, "technical": 0.55, "behavioral": 0.15},
            ),
            narrative="x",
        )

        recs, meta = asyncio.run(build_future_recommendations(resp))
        self.assertGreaterEqual(len(recs), 1)
        self.assertEqual(meta["skip_reason"], "missing_google_api_key")

    def test_google_path_uses_gemini_when_key_set(self) -> None:
        from api.config import settings
        from api.schemas import BehavioralResult, FitResult, MockInterviewResponse, TechnicalResult, WorkspaceResult
        import api.services.recommendations as recmod

        settings.google_api_key = "test-key"

        async def fake_gemini(prompt: str) -> str:
            _ = prompt
            return "\n".join(
                [
                    "- Behavioral: Add 1 metric to the result.",
                    "- Technical: Drill WACC in 60 seconds.",
                    "- Plan: Re-record and aim for 3 STAR beats.",
                ]
            )

        recmod._gemini_generate = fake_gemini  # type: ignore[assignment]

        resp = MockInterviewResponse(
            question_id="behav-tell-me",
            question_track="behavioral",
            transcript="hello",
            workspace=WorkspaceResult(label="unknown", confidence=0.5, class_index=-1),
            technical=TechnicalResult(
                expertise_level=1,
                expertise_label="Developing",
                level_confidence=0.6,
                topic="Behavioral",
                skills_identified=[],
                concepts_missed=[],
                summary="x",
                coverage={},
                explained={},
                coverage_score=0.0,
                explanation_score=0.0,
            ),
            behavioral=BehavioralResult(
                score=40.0,
                star_coverage={"situation": False, "task": False, "action": True, "result": False},
                filler_words={},
                filler_total=0,
                word_count=20,
                speaking_rate_wpm=None,
                has_numbers=False,
                feedback=["x"],
            ),
            fit=FitResult(
                fit_score=45.0,
                environment_component=50.0,
                technical_component=40.0,
                weights={"environment": 0.3, "technical": 0.55, "behavioral": 0.15},
            ),
            narrative="x",
        )

        recs, meta = asyncio.run(recmod.build_future_recommendations(resp))
        self.assertEqual(meta["enriched"], True)
        self.assertGreaterEqual(len(recs), 2)


if __name__ == "__main__":
    unittest.main()

